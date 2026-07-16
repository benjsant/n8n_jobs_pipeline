"""Graphe LangGraph de l'agent de candidature.

PHASE 1.2 — décomposition en nœuds testables :

    START → analyze → accroche → validate → END

- analyze   : LLM (temp 0.2) — le JUGEMENT : score + sous-scores, matching/missing,
              personnalisation_cv, conseils, objet… (tout le §6 SAUF la lettre).
              Température basse = scoring stable et reproductible.
- accroche  : LLM (temp 0.7) — le CRÉATIF : choix du template + accroche (2-3 phrases).
              Température plus haute = accroche vivante. Nœud séparé = on pourra y
              brancher le tool `company_research` (grounding) en Phase 2.
- judge     : AUTO-ÉVALUATION déterministe (sans LLM) de l'accroche selon §5
              (formules creuses, superlatifs gratuits, tiret cadratin, longueur).
              Si rejet, edge conditionnel -> régénère l'accroche (max 3 tentatives)
              en injectant les défauts comme feedback ; sinon -> validate.
- validate  : DÉTERMINISTE — retire les tirets cadratin de l'accroche (marqueur IA),
              normalise les énumérations, fusionne en objet §6 final. Aucun LLM.

Chaque nœud est une fonction pure (state -> patch de state), testable en isolation.
Le format de sortie reste IDENTIQUE au §6 (parité avec le monolithe / le workflow 02).
"""
from __future__ import annotations

import json
import os
import re
import uuid

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from .llm import get_llm
from .schema import RECOMMANDATIONS, TEMPLATES, AgentOutput, AgentState

ANALYZE_TASK = (
    "TÂCHE — ÉVALUATION. Réponds en JSON UNIQUEMENT avec : score, skills_score, "
    "experience_score, location_score, salary_score, recommandation, "
    "justification_score, matching_skills, missing_skills, competences_a_ameliorer, "
    "conseils, adaptation_cv, personnalisation_cv, objet_email, langue (cf. §6). "
    "N'inclus PAS de champ \"lettre\" ici."
)
ACCROCHE_TASK = (
    "TÂCHE — ACCROCHE. Choisis le template le plus adapté et rédige UNIQUEMENT "
    "l'accroche (2-3 phrases, cf. §5/§6 ; le corps de la lettre est figé hors de toi). "
    'Réponds en JSON UNIQUEMENT : {"lettre": {"template": "<id>", "accroche": "<texte>"}}.'
)


def build_user_message(offer: dict, cv_index: str) -> str:
    """Contexte CV + offre (commun aux nœuds LLM).

    ORDRE VOLONTAIRE (audit 2026-07) : le bloc STABLE (cv_index, identique pour
    toutes les offres) vient EN PREMIER, le contenu variable (l'offre) ensuite.
    DeepSeek applique un cache de préfixe automatique facturé ~10x moins cher :
    avec ce préfixe byte-identique (system prompt + cv_index), les appels
    analyze/accroche d'une même candidature ET les candidatures successives
    réutilisent le cache. Ne pas réintervertir.
    """
    desc = offer.get("description", "")
    if offer.get("spontaneous"):
        desc = (
            'CANDIDATURE SPONTANÉE — aucune offre publiée. Choisis IMPÉRATIVEMENT le '
            'template "candidature-spontanee". Infos connues: ' + desc
        )
    return (
        "VALEURS DISPONIBLES POUR personnalisation_cv (choisis EXCLUSIVEMENT parmi "
        f"elles, ids/noms exacts):\n{cv_index}\n\n"
        f"Offre: {offer.get('title', '')} chez {offer.get('company', '')}\n\n"
        f"Description:\n{desc}\n\n"
        f"Infos entreprise:\n{offer.get('company_info') or 'Non fournies'}"
    )


def _llm_json(system_prompt: str, user: str, temperature: float):
    """Un appel LLM en mode JSON. Renvoie (dict, erreur|None)."""
    from langchain_core.messages import HumanMessage, SystemMessage

    try:
        resp = get_llm(temperature).invoke(
            [SystemMessage(content=system_prompt), HumanMessage(content=user)]
        )
        data = json.loads(resp.content)
        return (data if isinstance(data, dict) else {}), None
    except Exception as exc:  # réseau, JSON invalide…
        return {}, str(exc)


def no_dash(text: str) -> str:
    """Garde-fou anti tiret cadratin (—/–) — virgule à la place (cf. §5)."""
    return re.sub(r"\s*[—–]\s*", ", ", str(text or ""))


# ── Nœuds ────────────────────────────────────────────────────────────────────
def analyze_node(state: AgentState) -> dict:
    user = build_user_message(state.get("offer", {}), state.get("cv_index", "")) + "\n\n" + ANALYZE_TASK
    data, err = _llm_json(state.get("system_prompt", ""), user, 0.2)
    patch = {"analysis": data}
    if err:
        patch["error"] = err
    return patch


def research_node(state: AgentState) -> dict:
    """Tool de grounding : faits officiels (registre) + extraits web (ou '' si rien)."""
    from .tools import lookup_company_registry, registry_grounding_text, search_company_web

    offer = state.get("offer", {})
    company = offer.get("company", "")
    return {
        "company_web": search_company_web(company, offer.get("location", "")),
        "company_registry": registry_grounding_text(lookup_company_registry(company)),
    }


MAX_ACCROCHE_ATTEMPTS = 3

# Motifs rejetés dans l'accroche (cf. §5 : formules creuses, superlatifs gratuits,
# ouverture banale, exagération géo). Le tiret cadratin et la longueur sont gérés à part.
_ACCROCHE_CLICHES = [
    (r"dynamique et motiv", "formule creuse « dynamique et motivé »"),
    (r"depuis (mon plus jeune âge|toujours)", "cliché « depuis toujours »"),
    (r"passionn[ée]", "cliché « passionné »"),
    (r"candidat id[ée]al", "formule « candidat idéal »"),
    (r"n'h[ée]sitez pas", "formule « n'hésitez pas »"),
    (r"je vous [ée]cris pour le poste", "ouverture banale « je vous écris pour le poste »"),
    (r"\b(leader|n°\s?1|num[ée]ro 1|meilleur[e]?)\b", "superlatif non vérifié (leader/n°1/meilleur)"),
    (r"à quelques minutes", "exagération de la proximité géographique"),
]


def check_accroche(text: str) -> list[str]:
    """Garde-fous déterministes (§5). Renvoie la liste des problèmes (vide = OK)."""
    t = (text or "").strip()
    if not t:
        return ["accroche vide"]
    low = t.lower()
    problems = [label for pat, label in _ACCROCHE_CLICHES if re.search(pat, low)]
    if "—" in t or "–" in t:
        problems.append("tiret cadratin (marqueur IA)")
    n_sent = len([s for s in re.split(r"[.!?]+", t) if s.strip()])
    if n_sent > 4:
        problems.append(f"trop long ({n_sent} phrases, vise 2-3)")
    if len(t) > 700:
        problems.append("accroche trop longue (> 700 caractères)")
    return problems


def accroche_node(state: AgentState) -> dict:
    web = state.get("company_web") or ""
    registry = state.get("company_registry") or ""
    official = (
        "\n\nFAITS OFFICIELS sur l'entreprise (registre INSEE — AUTORITATIFS, prioritaires "
        f"sur le web ; ne les contredis pas) :\n{registry}\n"
        if registry
        else ""
    )
    grounding = (
        "\n\nINFOS WEB sur l'entreprise (résultats de recherche — utilise-les "
        "SI pertinents et fiables, sinon IGNORE ; n'invente JAMAIS un fait absent de "
        f"ces extraits ou de l'offre) :\n{web}\n"
        if web
        else ""
    )
    # Feedback du juge sur la tentative précédente (boucle d'auto-correction).
    problems = state.get("accroche_problems") or []
    feedback = (
        "\n\n⚠️ Ta tentative précédente a été REJETÉE pour : " + " ; ".join(problems) +
        ". Réécris une accroche concise (2-3 phrases), spécifique, sans ces défauts.\n"
        if problems
        else ""
    )
    user = build_user_message(state.get("offer", {}), state.get("cv_index", "")) + official + grounding + feedback + "\n\n" + ACCROCHE_TASK
    data, err = _llm_json(state.get("system_prompt", ""), user, 0.7)
    if isinstance(data.get("lettre"), dict):
        lettre = data["lettre"]
    elif "template" in data or "accroche" in data:
        lettre = {"template": data.get("template", ""), "accroche": data.get("accroche", "")}
    else:
        lettre = {}
    patch = {"lettre": lettre, "accroche_attempts": state.get("accroche_attempts", 0) + 1}
    if err:
        patch["error"] = err
    return patch


def judge_node(state: AgentState) -> dict:
    """Auto-évaluation déterministe de l'accroche (LLM-judge léger, sans appel)."""
    lettre = state.get("lettre") or {}
    return {"accroche_problems": check_accroche(lettre.get("accroche", ""))}


def route_after_judge(state: AgentState) -> str:
    """Régénère si l'accroche est mauvaise et qu'il reste des tentatives, sinon continue."""
    problems = state.get("accroche_problems") or []
    if problems and state.get("accroche_attempts", 0) < MAX_ACCROCHE_ATTEMPTS:
        return "retry"
    return "ok"


def sanitize_personalisation(pc: object, cv_index_text: str = "") -> object:
    """Garde-fous déterministes sur le masquage (le LLM a tendance à sur-masquer) :
    - jamais masquer ce qui est mis en avant (contradiction highlight/hidden) ;
    - au plus un tiers des compétences masquées ;
    - au moins 3 projets visibles (si le profil en compte autant).
    Tolérant : si l'index CV est illisible, seule la règle de contradiction s'applique.
    """
    if not isinstance(pc, dict):
        return pc
    pc = dict(pc)
    for hidden_key, highlight_key in (
        ("hidden_skills", "highlight_skills"),
        ("hidden_projects", "highlight_projects"),
    ):
        highlights = set(pc.get(highlight_key) or [])
        pc[hidden_key] = [
            x for x in (pc.get(hidden_key) or []) if isinstance(x, str) and x not in highlights
        ]
    try:
        idx = json.loads(cv_index_text or "")
    except Exception:
        idx = {}
    skills = idx.get("skills") if isinstance(idx, dict) else None
    if isinstance(skills, list) and skills:
        pc["hidden_skills"] = pc["hidden_skills"][: len(skills) // 3]
    projects = idx.get("projects") if isinstance(idx, dict) else None
    if isinstance(projects, list) and projects:
        max_hidden = max(0, len(projects) - min(3, len(projects)))
        pc["hidden_projects"] = pc["hidden_projects"][:max_hidden]
    return pc


def validate_node(state: AgentState) -> dict:
    """Fusion déterministe + garde-fous. Aucun LLM."""
    merged = dict(state.get("analysis") or {})
    lettre = dict(state.get("lettre") or merged.get("lettre") or {})
    lettre["accroche"] = no_dash(lettre.get("accroche", ""))
    if lettre.get("template") not in TEMPLATES:
        lettre["template"] = "ia-junior"
    merged["lettre"] = lettre
    merged["conseils"] = no_dash(merged.get("conseils") or "")
    merged["personnalisation_cv"] = sanitize_personalisation(
        merged.get("personnalisation_cv"), state.get("cv_index", "")
    )
    return {"output": coerce_output(merged)}


def coerce_output(data: object) -> dict:
    """Tolérant (comme le parser du 02) : défauts + recouvrement + normalisation."""
    base = AgentOutput().model_dump()
    if isinstance(data, dict):
        for key in base:
            if key in data and data[key] is not None:
                base[key] = data[key]
    lettre = base.get("lettre") if isinstance(base.get("lettre"), dict) else {}
    if lettre.get("template") not in TEMPLATES:
        lettre["template"] = "ia-junior"
    lettre.setdefault("accroche", "")
    base["lettre"] = lettre
    if base.get("recommandation") not in RECOMMANDATIONS:
        base["recommandation"] = "ne_pas_postuler"
    if base.get("langue") not in ("fr", "en"):
        base["langue"] = "fr"
    try:
        return AgentOutput.model_validate(base).model_dump()
    except Exception:
        return AgentOutput().model_dump()


def build_graph():
    g = StateGraph(AgentState)
    g.add_node("analyze", analyze_node)
    g.add_node("research", research_node)
    g.add_node("accroche", accroche_node)
    g.add_node("judge", judge_node)
    g.add_node("validate", validate_node)
    g.add_edge(START, "analyze")
    g.add_edge("analyze", "research")
    g.add_edge("research", "accroche")
    g.add_edge("accroche", "judge")
    # Auto-correction : si le juge rejette l'accroche, on régénère (max 3), sinon on valide.
    g.add_conditional_edges("judge", route_after_judge, {"retry": "accroche", "ok": "validate"})
    g.add_edge("validate", END)
    return g.compile(checkpointer=MemorySaver())


GRAPH = build_graph()


def load_context() -> dict:
    prompt_path = os.environ.get("PROMPT_PATH", "/prompts/agent-system-prompt.md")
    cv_index_path = os.environ.get("CV_INDEX_PATH", "/cv/cv-index.json")
    read = lambda p: open(p, encoding="utf-8").read() if os.path.exists(p) else ""
    return {"system_prompt": read(prompt_path), "cv_index": read(cv_index_path)}


def run_agent(offer: dict, ctx: dict) -> dict:
    state = {"offer": offer, "system_prompt": ctx["system_prompt"], "cv_index": ctx["cv_index"]}
    # Endpoint stateless : un thread_id UNIQUE par appel (sinon deux offres de même
    # titre partageraient leur état via le checkpointer -> bleed entre runs).
    config = {"configurable": {"thread_id": uuid.uuid4().hex}}
    result = GRAPH.invoke(state, config)
    return result.get("output", AgentOutput().model_dump())
