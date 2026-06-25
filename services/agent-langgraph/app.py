"""Service HTTP de l'agent de candidature (FastAPI + LangGraph).

  POST /agent/run   { title, company, description, company_info?, spontaneous? }
                    -> objet JSON §6 (cf. agent/schema.py)
  GET  /health      -> { status: "ok" }

Remplace l'appel DeepSeek du workflow n8n 02. Le system prompt et l'index CV sont
lus depuis les volumes montés (/prompts, /cv) au démarrage.
"""
from __future__ import annotations

from fastapi import FastAPI

from agent.graph import load_context, run_agent
from agent.schema import AgentOutput, Offer

app = FastAPI(title="agent-langgraph", version="0.1.0")

# Contexte (prompt + index CV) chargé une fois au démarrage.
CONTEXT = load_context()


@app.get("/health")
def health() -> dict:
    ready = bool(CONTEXT.get("system_prompt"))
    return {"status": "ok", "prompt_loaded": ready, "cv_index_loaded": bool(CONTEXT.get("cv_index"))}


@app.post("/agent/run", response_model=AgentOutput)
def agent_run(offer: Offer) -> dict:
    return run_agent(offer.model_dump(), CONTEXT)
