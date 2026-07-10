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
import logging
import os
import secrets

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from pydantic import BaseModel

from agent import airtable, db
from agent.graph import load_context, run_agent
from agent.interview import run_interview_prep
from agent.offer_extract import (
    extract_offer,
    generate_application,
    generate_spontaneous,
    reanalyze_offer,
    read_dossier,
)
from agent.schema import AgentOutput, InterviewPrep, Offer

app = FastAPI(title="agent-langgraph", version="0.1.0")
logger = logging.getLogger("agent")

# Contexte (prompt + index CV) chargé une fois au démarrage.
CONTEXT = load_context()
_STATIC = os.path.join(os.path.dirname(__file__), "static", "index.html")
_OUTPUT = os.environ.get("OUTPUT_DIR", "/output")
_RENDER = os.environ.get("RENDER_API_URL", "http://render:8000")


# Jeton d'accès opt-in (UI_TOKEN dans .env) : indispensable avant d'ouvrir la
# mini-interface au-delà de 127.0.0.1 (BIND_HOST). Vide = pas d'authentification
# (comportement historique, usage local). Trois porteurs acceptés : header
# X-UI-Token (appels serveur, ex. workflows n8n), ?token= (première visite du
# navigateur, posé ensuite en cookie), cookie ui_token (navigation courante).
_UI_TOKEN = os.environ.get("UI_TOKEN", "").strip()


@app.middleware("http")
async def _ui_auth(request: Request, call_next):
    if _UI_TOKEN and request.url.path != "/health":
        supplied = (
            request.headers.get("x-ui-token")
            or request.query_params.get("token")
            or request.cookies.get("ui_token")
            or ""
        ).strip()
        if not secrets.compare_digest(supplied, _UI_TOKEN):
            return JSONResponse(
                {"detail": "jeton d'accès requis : ouvre /?token=<UI_TOKEN> (cf. .env)"},
                status_code=401,
            )
    response = await call_next(request)
    # Première visite avec ?token= : on pose le cookie pour la suite de la session.
    if _UI_TOKEN and request.query_params.get("token", "").strip() == _UI_TOKEN:
        response.set_cookie("ui_token", _UI_TOKEN, httponly=True, samesite="lax")
    return response


class UrlIn(BaseModel):
    url: str = ""


class StatusIn(BaseModel):
    hash: str
    status: str


class CompanyIn(BaseModel):
    name: str


class ManualCompanyIn(BaseModel):
    name: str
    website: str = ""
    sector: str = ""


class HashIn(BaseModel):
    hash: str


class PurgeIn(BaseModel):
    days: int | None = None
    status: str | None = None


class AppUpdateIn(BaseModel):
    id: int
    status: str | None = None
    notes: str | None = None
    remind: bool = False


# Libellés FR des statuts de candidature, pour la colonne « Statut » d'Airtable.
STATUS_FR = {
    "draft": "Brouillon", "sent": "Postulé", "interview": "Entretien",
    "rejected": "Refusé", "accepted": "Accepté",
}


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
        dossier = os.path.exists(os.path.join(d, "dossier.json"))
        if cv or letter:
            items.append({"app_id": app_id, "cv": cv, "letter": letter,
                          "dossier": dossier, "mtime": int(os.path.getmtime(d))})
    return {"items": items[:20]}


@app.get("/dossier/{app_id}")
def dossier(app_id: str) -> dict:
    """Dossier d'une candidature générée : lien (preuve), bloc offre, bloc entreprise."""
    if "/" in app_id or ".." in app_id:
        raise HTTPException(status_code=400, detail="identifiant non autorisé")
    d = read_dossier(app_id)
    if d is None:
        raise HTTPException(status_code=404, detail="dossier introuvable")
    return d


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
        row = db.set_offer_status(body.hash, body.status)
    except db.DbUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"Base indisponible : {exc}.")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except KeyError:
        raise HTTPException(status_code=404, detail="offre introuvable (hash inconnu)")
    # Marquer « Postulé » crée/retrouve la candidature (suivi) + ligne Airtable.
    if body.status == "applied":
        try:
            app_row = db.ensure_application_for_offer(body.hash, status="sent")
            if airtable.enabled() and not app_row.get("airtable_id"):
                rec = airtable.push_application(app_row, status="Postulé")
                if rec:
                    db.set_application_airtable_id(app_row["id"], rec)
            row["application_id"] = app_row["id"]
        except Exception:
            logger.warning("suivi/Airtable après « Postulé » échoué (hash=%s)", body.hash, exc_info=True)
    return row


@app.post("/offers/reanalyze")
def offers_reanalyze(body: HashIn) -> dict:
    """Relance l'analyse (scoring) de l'agent sur une offre et met à jour son score."""
    try:
        offer = db.get_offer(body.hash)
    except db.DbUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"Base indisponible : {exc}.")
    if not offer:
        raise HTTPException(status_code=404, detail="offre introuvable")
    res = reanalyze_offer(offer, CONTEXT)
    try:
        db.update_offer_score(body.hash, res["score"], res["reason"])
    except db.DbUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"Base indisponible : {exc}.")
    return res


@app.post("/offers/delete")
def offers_delete(body: HashIn) -> dict:
    """Supprime définitivement une offre."""
    try:
        return db.delete_offer(body.hash)
    except db.DbUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"Base indisponible : {exc}.")
    except KeyError:
        raise HTTPException(status_code=404, detail="offre introuvable (hash inconnu)")


@app.post("/offers/purge")
def offers_purge(body: PurgeIn) -> dict:
    """Supprime en masse les offres selon l'âge (days) et/ou le statut."""
    try:
        return {"deleted": db.purge_offers(days=body.days, status=body.status)}
    except db.DbUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"Base indisponible : {exc}.")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# --- Suivi des candidatures (« Mes candidatures ») ---------------------------


@app.get("/applications")
def applications() -> dict:
    """Liste des candidatures pour le suivi des réponses."""
    try:
        return {"items": db.list_applications()}
    except db.DbUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"Base indisponible : {exc}. Lance la stack complète (just up).")


@app.post("/applications/update")
def applications_update(body: AppUpdateIn) -> dict:
    """Fait avancer une candidature (statut / note / relance) + sync Airtable."""
    try:
        row = db.update_application(body.id, status=body.status, notes=body.notes, remind=body.remind)
    except db.DbUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"Base indisponible : {exc}.")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except KeyError:
        raise HTTPException(status_code=404, detail="candidature introuvable")
    # Répercute le statut sur Airtable si la ligne y existe.
    if row.get("airtable_id") and airtable.enabled() and body.status:
        try:
            airtable.update_record(row["airtable_id"], {"Statut": STATUS_FR.get(body.status, body.status)})
        except Exception:
            logger.warning("sync Airtable du statut échouée (app_id=%s)", body.id, exc_info=True)
    return row


@app.get("/stats")
def stats() -> dict:
    """Taux de réponse par type, tranche de score et source (hors brouillons)."""
    try:
        return db.response_stats()
    except db.DbUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"Base indisponible : {exc}. Lance la stack complète (just up).")


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
    return _spontaneous_and_track(company)


def _spontaneous_and_track(company: dict) -> dict:
    """Génère la candidature spontanée puis l'enregistre (suivi + Airtable)."""
    result = generate_spontaneous(company, CONTEXT)
    try:
        app_row = db.ensure_spontaneous_application(company)
        if airtable.enabled() and not app_row.get("airtable_id"):
            rec = airtable.push_application(app_row, status="Postulé")
            if rec:
                db.set_application_airtable_id(app_row["id"], rec)
        result["application_id"] = app_row["id"]
    except Exception:
        logger.warning("suivi/Airtable de la candidature spontanée échoué (%s)", company.get("name"), exc_info=True)
    return result


@app.post("/companies/manual")
def companies_manual(body: ManualCompanyIn) -> dict:
    """Candidature spontanée pour une entreprise saisie à la main (démarchage ad hoc)."""
    try:
        db.upsert_company(body.name, body.website, body.sector)
        company = db.get_company(body.name)
    except db.DbUnavailable as exc:
        raise HTTPException(status_code=503, detail=f"Base indisponible : {exc}.")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not company:
        raise HTTPException(status_code=404, detail="entreprise introuvable")
    return _spontaneous_and_track(company)
