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

import glob
import os

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel

from agent import db
from agent.graph import load_context, run_agent
from agent.interview import run_interview_prep
from agent.offer_extract import extract_offer, generate_application, generate_spontaneous
from agent.schema import AgentOutput, InterviewPrep, Offer

app = FastAPI(title="agent-langgraph", version="0.1.0")

# Contexte (prompt + index CV) chargé une fois au démarrage.
CONTEXT = load_context()
_STATIC = os.path.join(os.path.dirname(__file__), "static", "index.html")
_OUTPUT = os.environ.get("OUTPUT_DIR", "/output")
_RENDER = os.environ.get("RENDER_API_URL", "http://render:8000")


class UrlIn(BaseModel):
    url: str = ""


class StatusIn(BaseModel):
    hash: str
    status: str


class CompanyIn(BaseModel):
    name: str


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


@app.get("/status")
def status() -> dict:
    """État des services pour la page d'accueil (agent, render, Discord configuré)."""
    render_ok = False
    try:
        render_ok = httpx.get(f"{_RENDER}/health", timeout=2).status_code == 200
    except Exception:
        render_ok = False
    return {
        "agent": bool(CONTEXT.get("system_prompt")),
        "render": render_ok,
        "discord": bool(os.environ.get("DISCORD_WEBHOOK_ALERTS")),
    }


@app.get("/history")
def history() -> dict:
    """Liste les candidatures générées (dossiers ./output/app-*) avec leurs PDF."""
    items = []
    for d in sorted(glob.glob(os.path.join(_OUTPUT, "app-*")), key=os.path.getmtime, reverse=True):
        app_id = os.path.basename(d)[len("app-"):]
        cv = os.path.exists(os.path.join(d, "cv.pdf"))
        letter = os.path.exists(os.path.join(d, "lettre.pdf"))
        if cv or letter:
            items.append({"app_id": app_id, "cv": cv, "letter": letter, "mtime": int(os.path.getmtime(d))})
    return {"items": items[:20]}


@app.get("/files/{app_id}/{name}")
def get_file(app_id: str, name: str) -> FileResponse:
    """Télécharge un PDF généré (cv.pdf ou lettre.pdf) d'une candidature."""
    if name not in ("cv.pdf", "lettre.pdf") or "/" in app_id or ".." in app_id:
        raise HTTPException(status_code=400, detail="fichier non autorisé")
    path = os.path.join(_OUTPUT, f"app-{app_id}", name)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="introuvable")
    return FileResponse(path, media_type="application/pdf", filename=f"{app_id}-{name}")


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


# --- Tri des offres (nécessite Postgres = stack complète, sinon 503) ---------


@app.get("/offers")
def offers(status: str = "", limit: int = 50) -> dict:
    """Offres collectées (source de vérité Postgres), pour les trier/ignorer."""
    try:
        items = db.list_offers(status=status or None, limit=limit)
        return {"items": items, "counts": db.counts_by_status()}
    except db.DbUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"Base indisponible : {exc}. Lance la stack complète (just up).")


@app.post("/offers/status")
def offers_status(body: StatusIn) -> dict:
    """Bascule le statut d'une offre (ignored / applied / selected / reviewed)."""
    try:
        return db.set_offer_status(body.hash, body.status)
    except db.DbUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"Base indisponible : {exc}.")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except KeyError:
        raise HTTPException(status_code=404, detail="offre introuvable (hash inconnu)")


# --- Entreprises à contacter (candidature spontanée, façon La Bonne Boîte) -----


@app.get("/companies")
def companies(limit: int = 100) -> dict:
    """Entreprises collectées avec un moyen de contact (LBA), à démarcher."""
    try:
        return {"items": db.list_companies(limit=limit)}
    except db.DbUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"Base indisponible : {exc}. Lance la stack complète (just up).")


@app.post("/companies/apply")
def companies_apply(body: CompanyIn) -> dict:
    """Génère une candidature spontanée (CV + lettre) pour l'entreprise et la livre sur Discord."""
    try:
        company = db.get_company(body.name)
    except db.DbUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"Base indisponible : {exc}.")
    if not company:
        raise HTTPException(status_code=404, detail="entreprise introuvable")
    return generate_spontaneous(company, CONTEXT)
