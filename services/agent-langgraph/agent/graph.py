"""Graphe LangGraph de l'agent de candidature.

PHASE 1 (strangler) : un SEUL nœud `agent` qui réplique l'appel monolithique
actuel du workflow n8n 02 (system prompt + offre + cv-index -> JSON §6). Une fois
la parité v1/v2 validée, on décomposera ce nœud en sous-nœuds testables
(scoring_adequation, accroche, conseils, cv_personalization) + tool company_research.
"""
from __future__ import annotations

import json
import os

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from .llm import get_llm
from .schema import RECOMMANDATIONS, TEMPLATES, AgentOutput, AgentState


def build_user_message(offer: dict, cv_index: str) -> str:
    """Reproduit le message utilisateur construit par le nœud DeepSeek du 02."""
    desc = offer.get("description", "")
    if offer.get("spontaneous"):
        desc = (
            'CANDIDATURE SPONTANÉE — aucune offre publiée. Choisis IMPÉRATIVEMENT le '
            'template "candidature-spontanee" et rédige une accroche disant pourquoi '
            "CETTE entreprise (secteur, valeurs, produits). Infos connues: " + desc
        )
    return (
        f"Offre: {offer.get('title', '')} chez {offer.get('company', '')}\n\n"
        f"Description:\n{desc}\n\n"
        f"Infos entreprise:\n{offer.get('company_info') or 'Non fournies'}\n\n"
        "VALEURS DISPONIBLES POUR personnalisation_cv (choisis EXCLUSIVEMENT parmi "
        f"elles, ids/noms exacts):\n{cv_index}"
    )


def coerce_output(data: object) -> dict:
    """Tolérant comme le parser du 02 : part des défauts, recouvre les champs
    valides, normalise les énumérations (template / recommandation / langue)."""
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


def agent_node(state: AgentState) -> dict:
    """Nœud monolithique : un appel DeepSeek -> JSON §6 (parité avec le 02)."""
    from langchain_core.messages import HumanMessage, SystemMessage

    user = build_user_message(state.get("offer", {}), state.get("cv_index", ""))
    try:
        resp = get_llm().invoke(
            [SystemMessage(content=state.get("system_prompt", "")), HumanMessage(content=user)]
        )
        data = json.loads(resp.content)
    except Exception as exc:  # réseau, JSON invalide, etc.
        return {"error": str(exc), "output": AgentOutput().model_dump()}
    return {"output": coerce_output(data)}


def build_graph():
    g = StateGraph(AgentState)
    g.add_node("agent", agent_node)
    g.add_edge(START, "agent")
    g.add_edge("agent", END)
    return g.compile(checkpointer=MemorySaver())


GRAPH = build_graph()


def load_context() -> dict:
    """Charge le system prompt + l'index CV depuis les volumes montés."""
    prompt_path = os.environ.get("PROMPT_PATH", "/prompts/agent-system-prompt.md")
    cv_index_path = os.environ.get("CV_INDEX_PATH", "/cv/cv-index.json")
    read = lambda p: open(p, encoding="utf-8").read() if os.path.exists(p) else ""
    return {"system_prompt": read(prompt_path), "cv_index": read(cv_index_path)}


def run_agent(offer: dict, ctx: dict) -> dict:
    """Exécute le graphe pour une offre et renvoie l'objet §6 (dict)."""
    state = {"offer": offer, "system_prompt": ctx["system_prompt"], "cv_index": ctx["cv_index"]}
    config = {"configurable": {"thread_id": offer.get("title", "run") or "run"}}
    result = GRAPH.invoke(state, config)
    return result.get("output", AgentOutput().model_dump())
