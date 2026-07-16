"""Test du service d'embeddings (modèle réel, hors-ligne une fois l'image buildée).

Vérifie la propriété qui justifie la dédup sémantique : deux intitulés d'offre
PARAPHRASÉS sont plus proches (cosinus) que deux offres sans rapport. Lance :
  docker run --rm embeddings python -m pytest -q   (ou via just)
"""
import math


def _cos(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def test_dim_et_similarite_semantique():
    from app import _get_model, DIM

    textes = [
        "Développeur Backend Python (H/F) - FastAPI, PostgreSQL",   # 0
        "Ingénieur backend Python / API REST avec FastAPI et Postgres",  # 1 paraphrase de 0
        "Conseiller commercial en assurance, secteur banque",       # 2 sans rapport
    ]
    vecs = [v.tolist() for v in _get_model().embed(textes)]
    assert all(len(v) == DIM for v in vecs)

    sim_paraphrase = _cos(vecs[0], vecs[1])
    sim_unrelated = _cos(vecs[0], vecs[2])
    # La paraphrase doit être nettement plus proche que l'offre sans rapport.
    assert sim_paraphrase > sim_unrelated
    assert sim_paraphrase > 0.6


def test_chargement_paresseux_et_dechargement(monkeypatch):
    """Le modèle n'existe pas avant le premier /embed, et se décharge après TTL."""
    import app as A

    # État initial : rien de chargé tant que personne n'appelle /embed.
    monkeypatch.setattr(A, "_model", None)
    assert A.health()["loaded"] is False

    # Premier usage : chargé.
    A._get_model()
    assert A.health()["loaded"] is True

    # Inactivité au-delà du TTL : déchargé par le reaper.
    monkeypatch.setattr(A, "_last_use", 0.0)  # « dernier usage » très ancien
    A._unload_if_idle()
    assert A.health()["loaded"] is False
