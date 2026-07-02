"""Extraction d'offre depuis une URL + orchestration de génération pour la mini-UI.

Flux de l'interface Alpine.js :
  1. /offer/extract { url }  -> récupère la page, extrait { title, company, location,
     description } (LLM, best-effort ; l'utilisateur CONFIRME/corrige ensuite).
  2. /offer/generate { ...offre confirmée } -> agent (§6) -> rendu CV + lettre PDF
     (service render) -> livraison sur Discord (2 pièces jointes). Relecture humaine.
"""
from __future__ import annotations

import html
import json
import os
import re

import httpx

from .graph import _llm_json, run_agent

_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
_RENDER_URL = os.environ.get("RENDER_API_URL", "http://render:8000")


def _page_text(url: str, timeout: float = 15.0) -> str:
    """Récupère la page et en extrait le texte brut (sans scripts/styles/balises)."""
    resp = httpx.get(url, headers={"User-Agent": _UA}, timeout=timeout, follow_redirects=True)
    resp.raise_for_status()
    body = resp.text
    body = re.sub(r"<(script|style)[\s\S]*?</\1>", " ", body, flags=re.I)
    text = html.unescape(re.sub(r"<[^>]+>", " ", body))
    return re.sub(r"\s+", " ", text).strip()[:6000]


def extract_offer(url: str) -> dict:
    """Extrait les champs d'une offre depuis son URL (best-effort ; vide si échec)."""
    empty = {"title": "", "company": "", "location": "", "description": "", "url": url}
    url = (url or "").strip()
    if not url:
        return empty
    try:
        text = _page_text(url)
    except Exception:
        return empty
    if not text:
        return empty
    system = (
        "Tu extrais les informations d'une offre d'emploi à partir du texte d'une page. "
        "Réponds en JSON UNIQUEMENT avec: title (intitulé du poste), company (entreprise), "
        "location (ville/département), description (résumé des missions et du profil, 600 "
        "caractères max). Si une info est absente, mets une chaîne vide. N'invente rien."
    )
    data, _ = _llm_json(system, f"Texte de la page d'offre:\n{text}", 0.1)
    return {**empty, **{k: str(data.get(k, "") or "") for k in ("title", "company", "location", "description")}}


def _slug(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "-", (s or "").strip()).strip("-").lower() or "candidature"


def _deliver_discord(cv_path: str, letter_path: str, out: dict, offer: dict) -> bool:
    """Poste le CV + la lettre (PDF) sur Discord, avec un récap. Relecture humaine."""
    webhook = os.environ.get("DISCORD_WEBHOOK_ALERTS", "")
    if not webhook:
        return False
    pc = out.get("personnalisation_cv") or {}
    content = (
        f"🎯 **Candidature prête : {offer.get('company', '') or 'Entreprise'}**\n"
        f"📌 {pc.get('cv_title', '') or offer.get('title', '')}\n"
        f"📨 Objet : {out.get('objet_email', '')}\n"
        f"⭐ Score {out.get('score', 0)} ({out.get('recommandation', '')})\n"
        f"📎 CV + lettre en pièces jointes, à relire avant envoi."
    )
    files = []
    for i, p in enumerate([cv_path, letter_path]):
        if p and os.path.exists(p):
            files.append((f"files[{i}]", (os.path.basename(p), open(p, "rb"), "application/pdf")))
    try:
        resp = httpx.post(webhook, data={"payload_json": json.dumps({"content": content})}, files=files, timeout=30)
        return resp.status_code < 300
    except Exception:
        return False
    finally:
        for _, (_, fh, _ct) in files:
            fh.close()


def generate_application(offer: dict, ctx: dict) -> dict:
    """Agent -> rendu PDF (CV + lettre) -> livraison Discord. Renvoie un récap."""
    out = run_agent(offer, ctx)
    pc = out.get("personnalisation_cv") or {}
    lettre = out.get("lettre") or {}
    app_id = _slug(offer.get("company") or offer.get("title"))
    cv = httpx.post(f"{_RENDER_URL}/cv", json={"application_id": app_id, "personalization": pc}, timeout=120).json()
    lt = httpx.post(
        f"{_RENDER_URL}/letter",
        json={
            "application_id": app_id, "company": offer.get("company", ""),
            "template": lettre.get("template", "ia-junior"), "accroche": lettre.get("accroche", ""),
            "vars": {"poste": offer.get("title", "")},
        },
        timeout=120,
    ).json()
    discord_ok = _deliver_discord(cv.get("cv_path", ""), lt.get("letter_path", ""), out, offer)
    return {
        "cv_title": pc.get("cv_title", ""),
        "summary": pc.get("summary", ""),
        "score": out.get("score", 0),
        "recommandation": out.get("recommandation", ""),
        "accroche": lettre.get("accroche", ""),
        "template": lettre.get("template", ""),
        "subject": out.get("objet_email", ""),
        "cv_path": cv.get("cv_path", ""),
        "letter_path": lt.get("letter_path", ""),
        "discord": discord_ok,
    }
