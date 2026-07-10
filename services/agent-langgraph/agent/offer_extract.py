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
from datetime import datetime, timezone

import httpx

from .graph import _llm_json, run_agent

_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
_RENDER_URL = os.environ.get("RENDER_API_URL", "http://render:8000")
_OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "/output")


def _write_dossier(app_id: str, out: dict, *, offer: dict | None = None,
                   company: dict | None = None) -> None:
    """Sauvegarde le DOSSIER de candidature à côté du CV/lettre : le lien (preuve),
    le bloc d'infos de l'offre et le bloc entreprise, + le récap de l'agent. Sert
    de trace durable (les offres disparaissent des jobboards) et de base de prépa
    d'entretien. Best-effort : n'interrompt jamais la génération si l'écriture échoue.
    """
    offer = offer or {}
    pc = out.get("personnalisation_cv") or {}
    lettre = out.get("lettre") or {}
    dossier = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        # Le lien, gardé comme clé / preuve de l'offre d'origine.
        "url": offer.get("url", ""),
        # Bloc d'infos de l'offre.
        "offre": {
            "titre": offer.get("title", ""),
            "entreprise": offer.get("company", "") or (company or {}).get("name", ""),
            "lieu": offer.get("location", ""),
            "description": offer.get("description", ""),
        },
        # Bloc entreprise : texte fourni (offre) ou fiche (spontanée, grounded).
        "entreprise": (
            {k: company.get(k, "") for k in ("name", "sector", "website", "ai_summary",
                                             "apply_url", "phone", "email")}
            if company else {"infos": offer.get("company_info", "")}
        ),
        # Récap de l'agent (ce qui a été décidé et généré).
        "analyse": {
            "score": out.get("score", 0),
            "recommandation": out.get("recommandation", ""),
            "cv_title": pc.get("cv_title", ""),
            "objet_email": out.get("objet_email", ""),
            "template": lettre.get("template", ""),
            "accroche": lettre.get("accroche", ""),
            "matching_skills": out.get("matching_skills", []),
            "missing_skills": out.get("missing_skills", []),
        },
    }
    try:
        folder = os.path.join(_OUTPUT_DIR, f"app-{re.sub(r'[^A-Za-z0-9_-]+', '_', app_id)}")
        os.makedirs(folder, exist_ok=True)
        with open(os.path.join(folder, "dossier.json"), "w", encoding="utf-8") as fh:
            json.dump(dossier, fh, ensure_ascii=False, indent=2)
    except Exception:
        pass


def read_dossier(app_id: str) -> dict | None:
    """Relit le dossier d'une candidature générée (None si absent)."""
    safe = re.sub(r"[^A-Za-z0-9_-]+", "_", app_id)
    path = os.path.join(_OUTPUT_DIR, f"app-{safe}", "dossier.json")
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return None


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
    lien = f"\n🔗 {offer['url']}" if offer.get("url") else ""
    content = (
        f"🎯 **Candidature prête : {offer.get('company', '') or 'Entreprise'}**\n"
        f"📌 {pc.get('cv_title', '') or offer.get('title', '')}\n"
        f"📨 Objet : {out.get('objet_email', '')}\n"
        f"⭐ Score {out.get('score', 0)} ({out.get('recommandation', '')}){lien}\n"
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


def _deliver_spontaneous_discord(cv_path: str, letter_path: str, out: dict, company: dict) -> bool:
    """Livre la candidature spontanée sur Discord avec les infos de contact."""
    webhook = os.environ.get("DISCORD_WEBHOOK_ALERTS", "")
    if not webhook:
        return False
    pc = out.get("personnalisation_cv") or {}
    lines = [
        f"🏢 **Candidature spontanée : {company.get('name', '') or 'Entreprise'}**",
        f"📌 {pc.get('cv_title', '') or 'Candidature spontanée'}",
    ]
    if company.get("sector"):
        lines.append(f"🏷️ {company['sector']}")
    contact = []
    if company.get("apply_url"):
        contact.append(f"🔗 {company['apply_url']}")
    if company.get("phone"):
        contact.append(f"☎️ {company['phone']}")
    if company.get("email"):
        contact.append(f"✉️ {company['email']}")
    if company.get("website"):
        contact.append(f"🌐 {company['website']}")
    if contact:
        lines.append("**Contact :** " + "  ".join(contact))
    lines.append("📎 CV + lettre en pièces jointes, à relire avant envoi.")
    content = "\n".join(lines)
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


def generate_spontaneous(company: dict, ctx: dict) -> dict:
    """Candidature SPONTANÉE pour une entreprise : agent -> rendu -> Discord (avec contact)."""
    info = " · ".join(
        v for v in (company.get("sector"), company.get("website"), company.get("ai_summary")) if v
    )
    offer = {
        "title": "Candidature spontanée",
        "company": company.get("name", ""),
        "location": "",
        "description": company.get("description") or company.get("ai_summary") or "",
        "company_info": info,
        "spontaneous": True,
    }
    out = run_agent(offer, ctx)
    pc = out.get("personnalisation_cv") or {}
    lettre = out.get("lettre") or {}
    app_id = _slug(company.get("name") or "spontanee")
    cv = httpx.post(f"{_RENDER_URL}/cv", json={"application_id": app_id, "personalization": pc}, timeout=120).json()
    lt = httpx.post(
        f"{_RENDER_URL}/letter",
        json={
            "application_id": app_id, "company": company.get("name", ""),
            "template": lettre.get("template", "candidature-spontanee"), "accroche": lettre.get("accroche", ""),
            "vars": {"poste": "Candidature spontanée"},
        },
        timeout=120,
    ).json()
    discord_ok = _deliver_spontaneous_discord(cv.get("cv_path", ""), lt.get("letter_path", ""), out, company)
    _write_dossier(app_id, out, offer=offer, company=company)
    return {
        "app_id": app_id,
        "cv_title": pc.get("cv_title", ""),
        "accroche": lettre.get("accroche", ""),
        "template": lettre.get("template", ""),
        "subject": out.get("objet_email", ""),
        "contact": {k: company.get(k, "") for k in ("apply_url", "phone", "email", "website")},
        "discord": discord_ok,
    }


def reanalyze_offer(offer_row: dict, ctx: dict) -> dict:
    """Relance l'analyse (scoring) de l'agent sur une offre stockée. Ne génère rien."""
    offer = {
        "title": offer_row.get("title", ""),
        "company": offer_row.get("company", ""),
        "location": offer_row.get("location", ""),
        "description": offer_row.get("description", ""),
    }
    out = run_agent(offer, ctx)
    score = int(out.get("score", 0) or 0)
    reason = out.get("justification_score", "") or ""
    matching = out.get("matching_skills") or []
    if isinstance(matching, list) and matching:
        reason = (reason + " | " if reason else "") + ", ".join(str(m) for m in matching[:3])
    return {"score": score, "reason": reason[:500], "recommandation": out.get("recommandation", "")}


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
    _write_dossier(app_id, out, offer=offer)
    return {
        "app_id": app_id,
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
