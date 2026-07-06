"""Tests de la logique du module db (sans base réelle).

On couvre ce qui ne nécessite pas de connexion : construction du DSN depuis
l'environnement et refus des statuts non autorisés (validé avant tout connect).
"""
import os

import pytest

from agent import db


def test_settable_status_is_a_safe_subset():
    # 'new' n'est jamais une cible de bascule manuelle.
    assert "new" not in db.SETTABLE_STATUS
    assert {"ignored", "applied"} <= db.SETTABLE_STATUS


def test_set_offer_status_rejects_unknown_status_before_connecting():
    # Doit lever ValueError sans tenter la moindre connexion Postgres.
    with pytest.raises(ValueError):
        db.set_offer_status("deadbeef", "envoye")


def test_dsn_prefers_database_url(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://u:p@h:5432/x")
    assert db._dsn() == "postgres://u:p@h:5432/x"


def test_dsn_built_from_parts(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("POSTGRES_HOST", "postgres")
    monkeypatch.setenv("POSTGRES_DB", "n8n")
    monkeypatch.setenv("POSTGRES_USER", "n8n")
    monkeypatch.setenv("POSTGRES_PASSWORD", "secret")
    dsn = db._dsn()
    assert "host=postgres" in dsn and "dbname=n8n" in dsn
    assert "user=n8n" in dsn and "password=secret" in dsn
