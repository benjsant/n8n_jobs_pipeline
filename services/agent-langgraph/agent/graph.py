"""Graphe LangGraph de l'agent de candidature.

PHASE 1.2 — décomposition en nœuds testables :

    START → analyze → accroche → validate → END

- analyze   : LLM (temp 0.2) — le JUGEMENT : score + sous-scores, matching/missing,
              personnalisation_cv, conseils, objet… (tout le §6 SAUF la lettre).
              Température basse = scoring stable et reproductible.
- accroche  : LLM (temp 0.7) — le CRÉATIF : choix du template + accroche (2-3 phrases).
              Température plus haute = accroche vivante. Nœud séparé = on pourra y
              brancher le tool `company_research` (grounding) en Phase 2.
- validate  : DÉTERMINISTE — retire les tirets cadratin de l'accroche (marqueur IA),
              normalise les énumérations, fusionne en objet §6 final. Aucun LLM.

Chaque nœud est une fonction pure (state -> patch de state), testable en isolation.
Le format de sortie reste IDENTIQUE au §6 (parité avec le monolithe / le workflow 02).
"""
from __future__ import annotations

import json
import os
import re

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
    """Contexte offre + valeurs CV disponibles (commun aux nœuds LLM)."""
    desc = offer.get("description", "")
    if offer.get("spontaneous"):
        desc = (
            'CANDIDATURE SPONTANÉE — aucune offre publiée. Choisis IMPÉRATIVEMENT le '
            'template "candidature-spontanee". Infos connues: ' + desc
        )
    return (
        f"Offre: {offer.get('title', '')} chez {offer.get('company', '')}\n\n"
        f"Description:\n{desc}\n\n"
        f"Infos entreprise:\n{offer.get('company_info') or 'Non fournies'}\n\n"
        "VALEURS DISPONIBLES POUR personnalisation_cv (choisis EXCLUSIVEMENT parmi "
        f"elles, ids/noms exacts):\n{cv_index}"
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
    """Tool de grounding : extraits web réels sur l'entreprise (ou '' si rien)."""
    from .tools import search_company_web

    offer = state.get("offer", {})
    return {"company_web": search_company_web(offer.get("company", ""), offer.get("location", ""))}


def accroche_node(state: AgentState) -> dict:
    web = state.get("company_web") or ""
    grounding = (
        "\n\nINFOS WEB RÉELLES sur l'entreprise (résultats de recherche — utilise-les "
        "SI pertinents et fiables, sinon IGNORE ; n'invente JAMAIS un fait absent de "
        f"ces extraits ou de l'offre) :\n{web}\n"
        if web
        else ""
    )
    user = build_user_message(state.get("offer", {}), state.get("cv_index", "")) + grounding + "\n\n" + ACCROCHE_TASK
    data, err = _llm_json(state.get("system_prompt", ""), user, 0.7)
    if isinstance(data.get("lettre"), dict):
        lettre = data["lettre"]
    elif "template" in data or "accroche" in data:
        lettre = {"template": data.get("template", ""), "accroche": data.get("accroche", "")}
    else:
        lettre = {}
    patch = {"lettre": lettre}
    if err:
        patch["error"] = err
    return patch


def validate_node(state: AgentState) -> dict:
    """Fusion déterministe + garde-fous. Aucun LLM."""
    merged = dict(state.get("analysis") or {})
    lettre = dict(state.get("lettre") or merged.get("lettre") or {})
    lettre["accroche"] = no_dash(lettre.get("accroche", ""))
    if lettre.get("template") not in TEMPLATES:
        lettre["template"] = "ia-junior"
    merged["lettre"] = lettre
    merged["conseils"] = no_dash(merged.get("conseils") or "")
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
    g.add_node("validate", validate_node)
    g.add_edge(START, "analyze")
    g.add_edge("analyze", "research")
    g.add_edge("research", "accroche")
    g.add_edge("accroche", "validate")
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
    config = {"configurable": {"thread_id": offer.get("title", "run") or "run"}}
    result = GRAPH.invoke(state, config)
    return result.get("output", AgentOutput().model_dump())
