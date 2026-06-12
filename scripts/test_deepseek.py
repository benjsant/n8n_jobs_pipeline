#!/usr/bin/env python3
"""Test de l'agent DeepSeek seul (Tâche 4).

Construit l'appel (system prompt + offre fictive), l'envoie à DeepSeek, puis
valide que la réponse respecte le schéma de sortie (section 6 du system prompt).

Usage :
    python3 scripts/test_deepseek.py            # appel réel (DEEPSEEK_API_KEY requis)
    python3 scripts/test_deepseek.py --mock     # sans réseau ni clé : valide le validateur
    python3 scripts/test_deepseek.py --offer chemin.txt   # offre depuis un fichier

Dépendances : stdlib uniquement.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SYSTEM_PROMPT_PATH = ROOT / "prompts" / "agent-system-prompt.md"
CV_DIR = ROOT / "cv"

# Champs attendus dans la sortie (cf. section 6 du system prompt).
REQUIRED_KEYS = {
    "score": int,
    "recommandation": str,
    "justification_score": str,
    "points_forts": list,
    "gaps": list,
    "lettre_motivation": str,
    "adaptation_cv": str,
    "personnalisation_cv": dict,
    "objet_email": str,
    "langue": str,
}
ALLOWED_RECO = {"postuler", "postuler_si_peu_options", "ne_pas_postuler"}
ALLOWED_HIDDEN = {"summary", "skills", "experiences", "projects", "education"}


def _load_json(name: str) -> dict:
    path = CV_DIR / name
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def cv_valid_values() -> tuple[set, set, set]:
    """Noms de compétences + ids de projets/expériences réellement présents."""
    skills = _load_json("skills.json")
    skill_names = {
        i.get("name", "")
        for cat in skills.get("categories", [])
        for i in cat.get("items", [])
        if i.get("name")
    }
    project_ids = {p.get("id", "") for p in _load_json("projects.json").get("projects", []) if p.get("id")}
    exp_ids = {e.get("id", "") for e in _load_json("experiences.json").get("experiences", []) if e.get("id")}
    return skill_names, project_ids, exp_ids


def validate_personalization(p: dict) -> list[str]:
    """Vérifie la structure ET que les highlights référencent du réel (anti-invention)."""
    errors: list[str] = []
    for key in ("highlight_skills", "highlight_projects", "highlight_experiences", "hidden_sections"):
        if key in p and not isinstance(p[key], list):
            errors.append(f"personnalisation_cv.{key} doit être une liste")
    bad_hidden = set(p.get("hidden_sections", [])) - ALLOWED_HIDDEN
    if bad_hidden:
        errors.append(f"hidden_sections invalides : {sorted(bad_hidden)}")

    skill_names, project_ids, exp_ids = cv_valid_values()
    # On ne contrôle l'appartenance que si le profil est connu (fichiers présents).
    if skill_names:
        unknown = set(p.get("highlight_skills", [])) - skill_names
        if unknown:
            errors.append(f"highlight_skills inventées (absentes du profil) : {sorted(unknown)}")
    if project_ids:
        unknown = set(p.get("highlight_projects", [])) - project_ids
        if unknown:
            errors.append(f"highlight_projects inconnus : {sorted(unknown)}")
    if exp_ids:
        unknown = set(p.get("highlight_experiences", [])) - exp_ids
        if unknown:
            errors.append(f"highlight_experiences inconnues : {sorted(unknown)}")
    return errors

DUMMY_OFFER = """\
Intitulé : Développeur IA Junior (H/F)
Entreprise : NovaTech (fictif)
Lieu : Lyon (hybride)
Contrat : CDI
Description : Rejoignez notre équipe produit pour développer des fonctionnalités
basées sur des LLM (RAG, agents). Stack : Python, FastAPI, PostgreSQL/pgvector,
Docker. Profil junior accepté, curiosité et rigueur attendues.
"""

MOCK_RESPONSE = {
    "score": 82,
    "recommandation": "postuler",
    "justification_score": "Bonne adéquation : stack Python/FastAPI/pgvector et "
    "expérience RAG du candidat collent au poste. Junior accepté.",
    "points_forts": ["Projet RAG avec pgvector", "FastAPI", "Python solide"],
    "gaps": ["Pas d'expérience LLM agents en production"],
    "lettre_motivation": "Madame, Monsieur,\n\n[lettre mock]\n\nAlex Martin",
    "adaptation_cv": "Mettre en avant le projet rag-assistant et FastAPI ; "
    "ajouter les mots-clés LLM, RAG, pgvector.",
    "personnalisation_cv": {
        "summary": "Développeur IA junior orienté RAG et mise en production de modèles.",
        "highlight_skills": ["PyTorch", "Python", "RAG / LLM"],
        "highlight_projects": ["rag-assistant", "image-classifier"],
        "highlight_experiences": ["stage-data"],
        "hidden_sections": [],
    },
    "objet_email": "Candidature — Développeur IA Junior",
    "langue": "fr",
}


def load_system_prompt() -> str:
    if not SYSTEM_PROMPT_PATH.exists():
        sys.exit(f"System prompt introuvable : {SYSTEM_PROMPT_PATH}")
    return SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")


def call_deepseek(system_prompt: str, offer: str) -> dict:
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        sys.exit(
            "DEEPSEEK_API_KEY absent. Renseigne-la dans l'environnement, ou "
            "lance avec --mock pour valider sans appel réseau."
        )
    base = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    model = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
    body = json.dumps(
        {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": offer},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.7,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        f"{base}/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        sys.exit(f"Erreur HTTP DeepSeek {e.code} : {e.read().decode('utf-8', 'ignore')}")
    except urllib.error.URLError as e:
        sys.exit(f"Erreur réseau DeepSeek : {e.reason}")
    content = payload["choices"][0]["message"]["content"]
    return json.loads(content)


def validate(out: dict) -> list[str]:
    """Renvoie la liste des erreurs ; vide = conforme."""
    errors: list[str] = []
    for key, typ in REQUIRED_KEYS.items():
        if key not in out:
            errors.append(f"clé manquante : {key}")
            continue
        if not isinstance(out[key], typ):
            errors.append(
                f"type invalide pour {key} : attendu {typ.__name__}, "
                f"reçu {type(out[key]).__name__}"
            )
    if isinstance(out.get("score"), int) and not (0 <= out["score"] <= 100):
        errors.append(f"score hors bornes 0-100 : {out['score']}")
    if out.get("recommandation") not in ALLOWED_RECO:
        errors.append(
            f"recommandation invalide : {out.get('recommandation')} "
            f"(attendu l'un de {sorted(ALLOWED_RECO)})"
        )
    if out.get("langue") not in {"fr", "en"}:
        errors.append(f"langue invalide : {out.get('langue')}")
    if isinstance(out.get("personnalisation_cv"), dict):
        errors.extend(validate_personalization(out["personnalisation_cv"]))
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Test de l'agent DeepSeek")
    parser.add_argument("--mock", action="store_true", help="sans réseau ni clé")
    parser.add_argument("--offer", type=Path, help="fichier contenant l'offre")
    args = parser.parse_args()

    offer = args.offer.read_text(encoding="utf-8") if args.offer else DUMMY_OFFER

    if args.mock:
        print("== MODE MOCK (aucun appel réseau) ==")
        out = MOCK_RESPONSE
    else:
        system_prompt = load_system_prompt()
        print("== Appel DeepSeek en cours… ==")
        out = call_deepseek(system_prompt, offer)

    print("\n--- Sortie de l'agent ---")
    print(json.dumps(out, ensure_ascii=False, indent=2))

    errors = validate(out)
    print("\n--- Validation du schéma (section 6) ---")
    if errors:
        for e in errors:
            print(f"  ✗ {e}")
        print("\nRÉSULTAT : NON CONFORME")
        return 1
    print("  ✓ toutes les clés présentes et valides")
    print(f"  ✓ score={out['score']} recommandation={out['recommandation']} "
          f"langue={out['langue']}")
    print("\nRÉSULTAT : CONFORME")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
