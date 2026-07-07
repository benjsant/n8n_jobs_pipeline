#!/usr/bin/env python3
"""Crée (ou complète) la table Airtable « Candidatures » et ses colonnes.

Idempotent : si la table existe, on n'ajoute que les colonnes manquantes.
Lit AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE dans l'environnement.

Le jeton doit avoir les scopes : schema.bases:read + schema.bases:write
(en plus de data.records:write utilisé par l'application). Stdlib uniquement.
"""
import json
import os
import sys
import urllib.error
import urllib.request

KEY = os.environ.get("AIRTABLE_API_KEY", "").strip()
BASE = os.environ.get("AIRTABLE_BASE_ID", "").strip()
TABLE = os.environ.get("AIRTABLE_TABLE", "Candidatures").strip() or "Candidatures"

if not (KEY and BASE):
    sys.exit("AIRTABLE_API_KEY et AIRTABLE_BASE_ID requis (dans .env).")

META = f"https://api.airtable.com/v0/meta/bases/{BASE}/tables"

# Colonnes attendues. Le PREMIER champ devient le champ primaire de la table.
FIELDS = [
    {"name": "Poste", "type": "singleLineText"},
    {"name": "Entreprise", "type": "singleLineText"},
    {"name": "Lieu", "type": "singleLineText"},
    {"name": "Lien", "type": "url"},
    {"name": "Score", "type": "number", "options": {"precision": 0}},
    {"name": "Statut", "type": "singleSelect", "options": {"choices": [
        {"name": "Postulé"}, {"name": "Entretien"},
        {"name": "Refusé"}, {"name": "Accepté"}, {"name": "Brouillon"},
    ]}},
    {"name": "Date", "type": "date", "options": {"dateFormat": {"name": "iso", "format": "YYYY-MM-DD"}}},
]


def req(method, url, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    r = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        hint = ""
        if e.code in (401, 403):
            hint = " (scopes schema.bases:read + schema.bases:write et accès à la base ?)"
        sys.exit(f"Erreur Airtable {e.code}{hint} : {body}")
    except urllib.error.URLError as e:
        sys.exit(f"Réseau injoignable vers api.airtable.com : {e.reason}")


def main():
    tables = req("GET", META).get("tables", [])
    existing = next((t for t in tables if t["name"] == TABLE), None)
    if not existing:
        req("POST", META, {"name": TABLE, "fields": FIELDS})
        print(f"Table « {TABLE} » créée avec {len(FIELDS)} colonnes.")
        return
    have = {f["name"] for f in existing["fields"]}
    tid = existing["id"]
    added = 0
    for f in FIELDS:
        if f["name"] not in have:
            req("POST", f"{META}/{tid}/fields", f)
            print(f"Colonne ajoutée : {f['name']}")
            added += 1
    print(f"Table « {TABLE} » déjà présente. Colonnes ajoutées : {added}.")


if __name__ == "__main__":
    main()
