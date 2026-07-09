"""Tests « cassette » : le graphe complet rejoué avec des réponses LLM réalistes.

Les cassettes (tests/cassettes/*.json) contiennent des réponses de la forme
observée en production DeepSeek (mêmes clés, même style, dont un run réel du
2026-07-08). Elles couvrent le chemin de bout en bout
analyze -> research -> accroche -> judge -> validate que les tests unitaires ne
traversent pas : un changement de prompt, de nœud ou de schéma qui casse le
contrat §6 fait échouer ces tests, sans coût API ni clé.

Ré-enregistrer une cassette : copier les sorties brutes des appels LLM d'un run
réel dans le JSON correspondant (une entrée de `responses` par appel, dans
l'ordre analyze puis accroche(s)).
"""
import json
from collections import deque
from pathlib import Path

import pytest

from agent import graph as G
from agent import interview as I
from agent.schema import AgentOutput, InterviewPrep

CTX = {"system_prompt": "system §6", "cv_index": "Python, FastAPI, infinidex, predictiondex"}
CASSETTES = Path(__file__).parent / "cassettes"

OFFER = {
    "title": "Développeur Backend Python",
    "company": "Proxiad Nord",
    "location": "Lille",
    "description": "API FastAPI, PostgreSQL, équipe agile.",
}


@pytest.fixture(autouse=True)
def _no_web(monkeypatch):
    """Grounding web/registre simulé (pas de réseau en test)."""
    import agent.tools as tools

    monkeypatch.setattr(
        tools, "search_company_web",
        lambda *a, **k: "ESN lilloise fondée en 1997, agences à Lille et Valenciennes.",
    )
    monkeypatch.setattr(tools, "lookup_company_registry", lambda *a, **k: {})


class _Resp:
    def __init__(self, content):
        self.content = content


class _CassetteLLM:
    """Rejoue les réponses enregistrées dans l'ordre et capture chaque prompt."""

    def __init__(self, responses, calls):
        self._responses = responses
        self._calls = calls

    def invoke(self, messages):
        self._calls.append(messages)
        if not self._responses:
            raise AssertionError("cassette épuisée : un appel LLM de trop")
        return _Resp(self._responses.popleft())


def play(monkeypatch, name):
    """Branche la cassette `name` sur get_llm. Renvoie (file_restante, appels)."""
    data = json.loads((CASSETTES / f"{name}.json").read_text(encoding="utf-8"))
    remaining = deque(json.dumps(r, ensure_ascii=False) for r in data["responses"])
    calls = []
    monkeypatch.setattr(G, "get_llm", lambda *a, **k: _CassetteLLM(remaining, calls))
    return remaining, calls


def test_offre_backend_bout_en_bout(monkeypatch):
    remaining, calls = play(monkeypatch, "offre-backend")
    out = G.run_agent(dict(OFFER), CTX)
    AgentOutput.model_validate(out)  # contrat §6 respecté
    assert out["score"] == 85
    assert out["recommandation"] == "postuler"
    assert out["lettre"]["template"] == "backend"
    assert "1997" in out["lettre"]["accroche"]  # accroche groundée conservée
    assert out["personnalisation_cv"]["cv_title"] == "Développeur Backend Python"
    # Les compétences et projets hors sujet à masquer traversent le contrat.
    assert out["personnalisation_cv"]["hidden_skills"] == ["React", "Symfony"]
    assert out["personnalisation_cv"]["hidden_projects"] == ["audiomancy"]
    assert "—" not in json.dumps(out, ensure_ascii=False)  # aucun marqueur IA
    assert not remaining  # exactement 2 appels LLM (analyze + accroche)
    # Le grounding web du nœud research est injecté dans le prompt de l'accroche.
    assert any("1997" in m.content for m in calls[1])


def test_accroche_rejetee_puis_corrigee(monkeypatch):
    remaining, calls = play(monkeypatch, "accroche-rejetee")
    out = G.run_agent(dict(OFFER), CTX)
    AgentOutput.model_validate(out)
    # La v1 (cliché « passionné » + tiret cadratin) a été rejetée par le juge.
    assert "passionné" not in out["lettre"]["accroche"].lower()
    assert out["lettre"]["accroche"].startswith("Votre pipeline")
    assert len(calls) == 3  # analyze + accroche v1 + accroche v2
    # Le feedback du juge est réinjecté dans la seconde tentative.
    assert any("REJETÉE" in m.content for m in calls[2])
    assert not remaining


def test_accroches_toutes_rejetees_validate_nettoie(monkeypatch):
    remaining, calls = play(monkeypatch, "accroche-incorrigible")
    out = G.run_agent(dict(OFFER), CTX)
    AgentOutput.model_validate(out)
    # Boucle bornée : analyze + MAX_ACCROCHE_ATTEMPTS tentatives, pas une de plus.
    assert len(calls) == 1 + G.MAX_ACCROCHE_ATTEMPTS
    # Même quand le LLM s'obstine, validate retire les tirets cadratins.
    assert "—" not in out["lettre"]["accroche"]
    assert "–" not in out["lettre"]["accroche"]
    assert not remaining


def test_spontanee_force_le_template(monkeypatch):
    remaining, calls = play(monkeypatch, "spontanee")
    out = G.run_agent(
        {"title": "Candidature spontanée", "company": "ACME Services",
         "location": "Lille", "description": "ESN régionale.", "spontaneous": True},
        CTX,
    )
    AgentOutput.model_validate(out)
    assert out["lettre"]["template"] == "candidature-spontanee"
    # La consigne spontanée est bien injectée dès le premier appel LLM.
    assert any("CANDIDATURE SPONTANÉE" in m.content for m in calls[0])
    assert not remaining


def test_entretien_bout_en_bout(monkeypatch):
    remaining, calls = play(monkeypatch, "entretien")
    out = I.run_interview_prep(dict(OFFER), CTX)
    InterviewPrep.model_validate(out)
    assert out["entreprise"]["resume"]
    assert len(out["questions_probables"]) >= 5
    assert len(out["questions_a_poser"]) >= 3
    # Le nettoyage des tirets cadratins s'applique récursivement à tout le dossier.
    assert "—" not in json.dumps(out, ensure_ascii=False)
    assert not remaining
