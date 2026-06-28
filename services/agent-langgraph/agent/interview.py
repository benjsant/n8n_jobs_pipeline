"""Préparation d'entretien — capacité distincte de l'agent de candidature.

Quand une candidature passe en entretien, on produit un DOSSIER DE PRÉPARATION
ancré sur du réel :

    START → research → prep → validate → END

- research : tool `company_research` (web léger) — mêmes extraits réels que pour
             l'accroche (grounding anti-invention sur l'entreprise).
- prep     : LLM — résumé entreprise (offre + web), points de match (profil réel),
             écarts à anticiper (honnêtes), questions probables + réponses ancrées,
             questions à poser. Le profil candidat vient du system prompt (§3).
- validate : déterministe — retire les tirets cadratin (marqueur IA) partout,
             coerce vers le schéma InterviewPrep. Aucun LLM.

Réutilise les briques du graphe de candidature (search_company_web, _llm_json,
no_dash) pour rester cohérent et testable.
"""
from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from .graph import _llm_json, no_dash
from .schema import InterviewPrep, InterviewState

PREP_TASK = (
    "TÂCHE — PRÉPARATION D'ENTRETIEN. À partir de l'offre, du PROFIL CANDIDAT (cf. "
    "message système) et des infos entreprise, produis un dossier de préparation en "
    "JSON UNIQUEMENT avec ces clés : entreprise { resume, points_cles }, match "
    "{ atouts, a_anticiper }, questions_probables (liste de { question, angle_reponse }), "
    "questions_a_poser (liste), langue. "
    "RÈGLES STRICTES : (1) n'affirme sur l'entreprise QUE ce qui figure littéralement "
    "dans l'offre ou les infos web ci-dessous. Interdiction d'ajouter un superlatif ou "
    "un statut non écrit noir sur blanc (ex. « leader », « leader européen », « n°1 », "
    "« en forte croissance ») s'il n'apparaît pas tel quel dans les sources ; en cas de "
    "doute, reste factuel et général. "
    "(2) Les atouts et les angles de réponse s'appuient EXCLUSIVEMENT sur le profil "
    "réel du candidat (jamais d'expérience/compétence inventée). (3) Sois honnête sur "
    "a_anticiper (écarts réels à préparer), sans les minimiser ni inventer. "
    "Vise 5 à 7 questions probables et 3 à 5 questions à poser."
)


def _build_user(offer: dict, web: str, registry: str = "") -> str:
    desc = offer.get("description", "")
    official = (
        "\n\nFAITS OFFICIELS sur l'entreprise (registre public INSEE/recherche-entreprises "
        "— AUTORITATIFS, PRIORITAIRES sur le web ; ne les contredis pas) :\n"
        f"{registry}\n" if registry else ""
    )
    grounding = (
        "\n\nINFOS WEB sur l'entreprise (extraits de recherche — utilise-les SI pertinents "
        "et fiables, sinon ignore ; n'invente jamais un fait absent) :\n"
        f"{web}\n" if web else ""
    )
    return (
        f"Offre: {offer.get('title', '')} chez {offer.get('company', '')}\n"
        f"Lieu: {offer.get('location', '')}\n\n"
        f"Description de l'offre:\n{desc}\n\n"
        f"Infos entreprise (fournies):\n{offer.get('company_info') or 'Non fournies'}\n"
        f"{official}{grounding}\n{PREP_TASK}"
    )


def research_node(state: InterviewState) -> dict:
    from .tools import lookup_company_registry, registry_grounding_text, search_company_web

    offer = state.get("offer", {})
    company = offer.get("company", "")
    return {
        "company_web": search_company_web(company, offer.get("location", "")),
        "company_registry": registry_grounding_text(lookup_company_registry(company)),
    }


def prep_node(state: InterviewState) -> dict:
    user = _build_user(state.get("offer", {}), state.get("company_web") or "", state.get("company_registry") or "")
    data, err = _llm_json(state.get("system_prompt", ""), user, 0.4)
    patch = {"prep": data}
    if err:
        patch["error"] = err
    return patch


def _clean(value):
    """Retire les tirets cadratin récursivement (chaînes, listes, dicts)."""
    if isinstance(value, str):
        return no_dash(value)
    if isinstance(value, list):
        return [_clean(v) for v in value]
    if isinstance(value, dict):
        return {k: _clean(v) for k, v in value.items()}
    return value


def validate_node(state: InterviewState) -> dict:
    data = _clean(state.get("prep") or {})
    try:
        out = InterviewPrep.model_validate(data).model_dump()
    except Exception:
        out = InterviewPrep().model_dump()
    if out.get("langue") not in ("fr", "en"):
        out["langue"] = "fr"
    return {"output": out}


def build_interview_graph():
    g = StateGraph(InterviewState)
    g.add_node("research", research_node)
    g.add_node("prepare", prep_node)
    g.add_node("validate", validate_node)
    g.add_edge(START, "research")
    g.add_edge("research", "prepare")
    g.add_edge("prepare", "validate")
    g.add_edge("validate", END)
    return g.compile()


GRAPH = build_interview_graph()


def run_interview_prep(offer: dict, ctx: dict) -> dict:
    state = {"offer": offer, "system_prompt": ctx.get("system_prompt", "")}
    result = GRAPH.invoke(state)
    return result.get("output", InterviewPrep().model_dump())
