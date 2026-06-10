"""Tests du micro-service JobSpy — couvrent /health et la normalisation, sans
toucher aux boards externes ni à la dépendance python-jobspy."""
from app import app, normalize_records
from fastapi.testclient import TestClient

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_search_requires_term():
    assert client.get("/search").status_code == 422  # term manquant


def test_normalize_records():
    raw = [
        {
            "site": "indeed",
            "id": "abc",
            "title": "Dev IA",
            "company": "NovaTech",
            "location": {"city": "Lyon", "country": "France"},
            "job_type": "fulltime",
            "min_amount": 35000,
            "max_amount": 42000,
            "description": "RAG, FastAPI",
            "job_url": "https://example.com/job/abc",
        },
        {"site": "linkedin", "title": "ML Eng", "job_url": "https://x/y"},
    ]
    offers = normalize_records(raw)
    assert offers[0]["source"] == "jobspy:indeed"
    assert offers[0]["location"] == "Lyon, France"
    assert offers[0]["salary"] == "35000-42000"
    assert offers[0]["url"] == "https://example.com/job/abc"
    # source_id retombe sur l'url quand l'id manque
    assert offers[1]["source_id"] == "https://x/y"
    assert offers[1]["company"] == ""


if __name__ == "__main__":
    test_health()
    test_search_requires_term()
    test_normalize_records()
    print("tous les tests JobSpy passent")
