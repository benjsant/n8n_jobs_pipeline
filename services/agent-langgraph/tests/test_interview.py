"""Tests de la préparation d'entretien (LLM + recherche web mockés)."""
import json

import pytest

from agent import interview as I
from agent.schema import InterviewPrep

CTX = {"system_prompt": "PROFIL: Benjamin, dev backend Python."}


@pytest.fixture(autouse=True)
def _no_web(monkeypatch):
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
    # interview._llm_json délègue à graph.get_llm -> on patche graph.
    import agent.graph as G

    monkeypatch.setattr(G, "get_llm", lambda *a, **k: _LLM(content))


VALID = json.dumps({
    "entreprise": {"resume": "PME logistique du Nord.", "points_cles": ["e-commerce", "25000 colis/jour"]},
    "match": {"atouts": ["Python", "FastAPI"], "a_anticiper": ["pas de Kubernetes"]},
    "questions_probables": [
        {"question": "Parlez d'un projet Python.", "angle_reponse": "InfiniDex, pipeline ETL."},
    ],
    "questions_a_poser": ["Quelle est la stack actuelle ?"],
    "langue": "fr",
})


def test_sortie_valide_conforme_schema(monkeypatch):
    _patch(monkeypatch, VALID)
    out = I.run_interview_prep({"title": "Dev Backend", "company": "Ponera"}, CTX)
    InterviewPrep.model_validate(out)  # ne lève pas
    assert out["entreprise"]["resume"].startswith("PME logistique")
    assert out["match"]["atouts"] == ["Python", "FastAPI"]
    assert out["questions_probables"][0]["question"].startswith("Parlez")
    assert len(out["questions_a_poser"]) == 1


def test_json_invalide_renvoie_defauts(monkeypatch):
    _patch(monkeypatch, "pas du json")
    out = I.run_interview_prep({"title": "X"}, CTX)
    InterviewPrep.model_validate(out)
    assert out["questions_probables"] == []
    assert out["langue"] == "fr"


def test_retire_tiret_cadratin_partout(monkeypatch):
    _patch(monkeypatch, json.dumps({
        "entreprise": {"resume": "Une PME — leader du Nord.", "points_cles": ["forte croissance — depuis 2015"]},
        "match": {"atouts": ["autonomie — rigueur"], "a_anticiper": []},
        "questions_probables": [{"question": "Pourquoi nous — vraiment ?", "angle_reponse": "le projet — concret."}],
        "questions_a_poser": ["Le rythme — exact ?"],
        "langue": "fr",
    }))
    out = I.run_interview_prep({"title": "X", "company": "Y"}, CTX)
    blob = json.dumps(out, ensure_ascii=False)
    assert "—" not in blob and "–" not in blob
    assert "PME, leader" in out["entreprise"]["resume"]
