"""Miroir d'historique optionnel vers Airtable.

Postgres reste la source de vérité (cf. CLAUDE.md) ; Airtable n'est qu'une vue
d'historique pratique. Quand tu marques une offre « Postulé », on y ajoute une
ligne. Désactivé tant que AIRTABLE_API_KEY + AIRTABLE_BASE_ID ne sont pas définis.

Table attendue (nom par défaut « Candidatures ») avec les colonnes :
  Poste (text), Entreprise (text), Lieu (text), Lien (url), Score (number),
  Statut (text), Date (date). `typecast` laisse Airtable coercer les types.
"""
from __future__ import annotations

import os
from datetime import date

import httpx


def _config() -> tuple[str, str, str]:
    key = os.environ.get("AIRTABLE_API_KEY", "").strip()
    base = os.environ.get("AIRTABLE_BASE_ID", "").strip()
    table = os.environ.get("AIRTABLE_TABLE", "Candidatures").strip() or "Candidatures"
    return key, base, table


def enabled() -> bool:
    key, base, _ = _config()
    return bool(key and base)


def push_application(offer: dict, status: str = "Postulé") -> str | None:
    """Ajoute une ligne d'historique dans Airtable. Renvoie l'id de ligne (ou None)."""
    key, base, table = _config()
    if not (key and base):
        return None
    fields = {
        "Poste": offer.get("title") or offer.get("poste") or "",
        "Entreprise": offer.get("company") or offer.get("entreprise") or "",
        "Lieu": offer.get("location", "") or "",
        "Lien": offer.get("url") or offer.get("lien") or "",
        "Score": offer.get("score") if offer.get("score") is not None else None,
        "Statut": status,
        "Date": date.today().isoformat(),
    }
    fields = {k: v for k, v in fields.items() if v not in ("", None)}
    url = f"https://api.airtable.com/v0/{base}/{table}"
    try:
        resp = httpx.post(
            url,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"fields": fields, "typecast": True},
            timeout=15,
        )
        if resp.status_code < 300:
            return resp.json().get("id")
        return None
    except Exception:
        return None


def update_record(record_id: str, fields: dict) -> bool:
    """Met à jour une ligne Airtable existante (sync du statut). Best-effort."""
    key, base, table = _config()
    if not (key and base and record_id):
        return False
    url = f"https://api.airtable.com/v0/{base}/{table}/{record_id}"
    try:
        resp = httpx.patch(
            url,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={"fields": fields, "typecast": True},
            timeout=15,
        )
        return resp.status_code < 300
    except Exception:
        return False
