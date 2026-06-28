"""Tests du graphe (LLM + recherche web mockés, aucune clé ni réseau requis)."""
import json

import pytest

from agent import graph as G
from agent.schema import TEMPLATES, AgentOutput

CTX = {"system_prompt": "system", "cv_index": "Python, FastAPI"}


@pytest.fixture(autouse=True)
def _no_web(monkeypatch):
    """Neutralise la recherche web + registre (le nœud research) — pas de réseau en test."""
    import agent.tools as tools

    monkeypatch.setattr(tools, "search_company_web", lambda *a, **k: "")
    monkeypatch.setattr(tools, "lookup_company_registry", lambda *a, **k: {})


class _Resp:
    def __init__(self, content):
        self.content = content


class _LLM:
    def __init__(self, content):
        self._content = content

    def invoke(self, _messages):
        return _Resp(self._content)


def _patch(monkeypatch, content):
    monkeypatch.setattr(G, "get_llm", lambda *a, **k: _LLM(content))


VALID = json.dumps({
    "score": 82, "skills_score": 80, "experience_score": 70, "location_score": 90,
    "salary_score": 50, "recommandation": "postuler", "justification_score": "ok",
    "matching_skills": ["Python"], "missing_skills": ["Kubernetes"],
    "competences_a_ameliorer": [{"competence": "Kubernetes", "conseil": "k3s"}],
    "conseils": "...", "lettre": {"template": "backend", "accroche": "Votre plateforme..."},
    "adaptation_cv": "...", "personnalisation_cv": {"summary": "s", "highlight_skills": ["Python"],
    "highlight_projects": ["infinidex"], "highlight_experiences": [], "hidden_sections": []},
    "objet_email": "Candidature", "langue": "fr",
})


def test_sortie_valide_parite_schema(monkeypatch):
    _patch(monkeypatch, VALID)
    out = G.run_agent({"title": "Dev Backend", "company": "X", "description": "python"}, CTX)
    AgentOutput.model_validate(out)  # ne lève pas -> contrat §6 respecté
    assert out["score"] == 82
    assert out["lettre"]["template"] == "backend"
    assert out["lettre"]["accroche"].startswith("Votre plateforme")


def test_json_invalide_renvoie_defauts(monkeypatch):
    _patch(monkeypatch, "pas du json")
    out = G.run_agent({"title": "X"}, CTX)
    AgentOutput.model_validate(out)
    assert out["lettre"]["template"] in TEMPLATES


def test_template_invalide_normalise(monkeypatch):
    _patch(monkeypatch, json.dumps({"lettre": {"template": "zzz", "accroche": "a"},
                                    "recommandation": "n_importe", "langue": "xx"}))
    out = G.run_agent({"title": "X"}, CTX)
    assert out["lettre"]["template"] == "ia-junior"
    assert out["recommandation"] == "ne_pas_postuler"
    assert out["langue"] == "fr"


def test_validate_retire_tiret_cadratin(monkeypatch):
    _patch(monkeypatch, json.dumps({
        "score": 70, "recommandation": "postuler", "langue": "fr",
        "lettre": {"template": "ia-junior", "accroche": "Votre échelle me parle — un vrai défi."},
    }))
    out = G.run_agent({"title": "X"}, CTX)
    assert "—" not in out["lettre"]["accroche"]
    assert "me parle, un vrai défi" in out["lettre"]["accroche"]


def test_message_spontane(monkeypatch):
    msg = G.build_user_message({"title": "Candidature spontanée", "company": "Acme",
                                "description": "", "spontaneous": True}, "idx")
    assert "candidature-spontanee" in msg.lower()
