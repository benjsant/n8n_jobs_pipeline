"""Service HTTP de l'agent de candidature (FastAPI + LangGraph).

  GET  /                -> mini-interface web (Alpine.js) : URL offre -> confirmation
                           -> génération CV + lettre -> livraison Discord.
  POST /offer/extract   { url } -> { title, company, location, description } (best-effort)
  POST /offer/generate  { title, company, location, description } -> génère + livre Discord
  POST /agent/run       { title, company, description, company_info?, spontaneous? }
                        -> objet JSON §6 (cf. agent/schema.py)
  POST /interview/prep  { title, company, description, company_info?, location? }
                        -> dossier de préparation d'entretien (cf. InterviewPrep)
  GET  /health          -> { status: "ok" }

Le system prompt et l'index CV sont lus depuis les volumes montés (/prompts, /cv).
"""
from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from agent.graph import load_context, run_agent
from agent.interview import run_interview_prep
from agent.offer_extract import extract_offer, generate_application
from agent.schema import AgentOutput, InterviewPrep, Offer

app = FastAPI(title="agent-langgraph", version="0.1.0")

# Contexte (prompt + index CV) chargé une fois au démarrage.
CONTEXT = load_context()
_STATIC = os.path.join(os.path.dirname(__file__), "static", "index.html")


class UrlIn(BaseModel):
    url: str = ""


@app.get("/", response_class=HTMLResponse)
def home() -> str:
    try:
        return open(_STATIC, encoding="utf-8").read()
    except OSError:
        return "<h1>agent-langgraph</h1><p>Interface indisponible.</p>"


@app.get("/health")
def health() -> dict:
    ready = bool(CONTEXT.get("system_prompt"))
    return {"status": "ok", "prompt_loaded": ready, "cv_index_loaded": bool(CONTEXT.get("cv_index"))}


@app.post("/offer/extract")
def offer_extract(body: UrlIn) -> dict:
    return extract_offer(body.url)


@app.post("/offer/generate")
def offer_generate(offer: Offer) -> dict:
    return generate_application(offer.model_dump(), CONTEXT)


@app.post("/agent/run", response_model=AgentOutput)
def agent_run(offer: Offer) -> dict:
    return run_agent(offer.model_dump(), CONTEXT)


@app.post("/interview/prep", response_model=InterviewPrep)
def interview_prep(offer: Offer) -> dict:
    return run_interview_prep(offer.model_dump(), CONTEXT)
