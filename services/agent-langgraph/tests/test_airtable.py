"""Tests du miroir Airtable (sans appel réseau)."""
from agent import airtable


def test_disabled_without_keys(monkeypatch):
    monkeypatch.delenv("AIRTABLE_TOKEN", raising=False)
    monkeypatch.delenv("AIRTABLE_BASE_ID", raising=False)
    assert airtable.enabled() is False
    # push est un no-op sûr quand la fonctionnalité est inactive (aucun id créé)
    assert airtable.push_application({"title": "x"}) is None
    assert airtable.update_record("rec123", {"Statut": "Postulé"}) is False


def test_enabled_when_both_keys_present(monkeypatch):
    monkeypatch.setenv("AIRTABLE_TOKEN", "pat_xxx")
    monkeypatch.setenv("AIRTABLE_BASE_ID", "appXXX")
    assert airtable.enabled() is True


def test_disabled_if_only_one_key(monkeypatch):
    monkeypatch.setenv("AIRTABLE_TOKEN", "pat_xxx")
    monkeypatch.delenv("AIRTABLE_BASE_ID", raising=False)
    assert airtable.enabled() is False
