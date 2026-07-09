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


def test_judge_check_accroche():
    ok = "Votre plateforme logistique à Prouvy m'attire : ma stack Python/FastAPI colle à vos besoins."
    assert G.check_accroche(ok) == []
    assert "accroche vide" in G.check_accroche("")
    assert any("passionné" in p for p in G.check_accroche("Je suis passionné par votre entreprise."))
    assert any("dynamique" in p for p in G.check_accroche("Candidat dynamique et motivé, je postule."))
    assert any("superlatif" in p for p in G.check_accroche("Vous êtes le leader européen du secteur."))
    assert any("tiret" in p for p in G.check_accroche("Votre mission m'attire — vraiment."))
    long = "Phrase une. Phrase deux. Phrase trois. Phrase quatre. Phrase cinq."
    assert any("trop long" in p for p in G.check_accroche(long))


def test_route_after_judge():
    assert G.route_after_judge({"accroche_problems": ["x"], "accroche_attempts": 1}) == "retry"
    assert G.route_after_judge({"accroche_problems": ["x"], "accroche_attempts": 3}) == "ok"  # plafond atteint
    assert G.route_after_judge({"accroche_problems": [], "accroche_attempts": 1}) == "ok"


def test_accroche_propre_passe_sans_retry(monkeypatch):
    # Une accroche correcte ne déclenche pas de régénération : 1 seule tentative.
    _patch(monkeypatch, VALID)
    out = G.run_agent({"title": "Dev Backend", "company": "X", "description": "python"}, CTX)
    assert out["lettre"]["accroche"].startswith("Votre plateforme")


class _SeqLLM:
    """LLM mock qui renvoie des contenus différents à chaque appel (analyze, accroches…)."""
    def __init__(self, contents):
        self.contents = list(contents)
        self.calls = 0

    def invoke(self, _messages):
        c = self.contents[min(self.calls, len(self.contents) - 1)]
        self.calls += 1
        return _Resp(c)


def test_accroche_cliche_est_regeneree(monkeypatch):
    analyze = json.dumps({"score": 70, "recommandation": "postuler", "langue": "fr"})
    bad = json.dumps({"lettre": {"template": "backend", "accroche": "Je suis passionné, dynamique et motivé."}})
    good = json.dumps({"lettre": {"template": "backend", "accroche": "Votre stack Python me parle, vos outils logistiques aussi."}})
    seq = _SeqLLM([analyze, bad, good])
    monkeypatch.setattr(G, "get_llm", lambda *a, **k: seq)
    out = G.run_agent({"title": "X", "company": "Y", "description": "z"}, CTX)
    assert "passionné" not in out["lettre"]["accroche"].lower()  # la mauvaise a été rejetée
    assert "Python me parle" in out["lettre"]["accroche"]        # la régénérée est gardée
    assert seq.calls >= 3                                        # analyze + >=2 accroches


def test_message_spontane(monkeypatch):
    msg = G.build_user_message({"title": "Candidature spontanée", "company": "Acme",
                                "description": "", "spontaneous": True}, "idx")
    assert "candidature-spontanee" in msg.lower()


def test_sanitize_personalisation_bornes():
    """Garde-fous déterministes anti sur-masquage (constaté en réel : 40/49
    compétences et 2/4 projets masqués par le LLM sur un CV backend/IA)."""
    idx = json.dumps({
        "skills": [f"s{i}" for i in range(12)],
        "projects": [{"id": p} for p in ("a", "b", "c", "d")],
    })
    pc = {
        "highlight_skills": ["s0"], "highlight_projects": ["a"],
        "hidden_skills": [f"s{i}" for i in range(12)],  # contradiction (s0) + excès
        "hidden_projects": ["a", "b", "c"],             # contradiction (a) + excès
    }
    out = G.sanitize_personalisation(pc, idx)
    assert "s0" not in out["hidden_skills"]   # jamais masquer un highlight
    assert len(out["hidden_skills"]) == 4     # au plus un tiers (12 // 3)
    assert out["hidden_projects"] == ["b"]    # 4 projets -> au moins 3 visibles
    # Index illisible : seule la règle de contradiction s'applique (tolérant).
    out2 = G.sanitize_personalisation(dict(pc), "pas du json")
    assert "s0" not in out2["hidden_skills"]
    assert len(out2["hidden_skills"]) == 11
