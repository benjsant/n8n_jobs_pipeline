"""Micro-service JobSpy — expose la lib python-jobspy en HTTP pour n8n (Tâche 5).

n8n appelle GET /search et reçoit des offres normalisées (mêmes champs que la
table `offers`, hors hash/score qui sont calculés côté workflow).

L'import de `jobspy` est paresseux : /health et la normalisation fonctionnent
sans la dépendance lourde (utile pour les tests).
"""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException, Query

app = FastAPI(title="jobspy-service", version="1.0.0")

DEFAULT_SITES = ["indeed", "linkedin", "glassdoor"]


def _coerce_str(value: Any) -> str:
    """Aplati les valeurs (dict de localisation, NaN pandas, etc.) en str propre."""
    if value is None:
        return ""
    if isinstance(value, float) and value != value:  # NaN
        return ""
    if isinstance(value, dict):
        parts = [str(v) for v in value.values() if v]
        return ", ".join(parts)
    return str(value).strip()


def normalize_records(records: list[dict]) -> list[dict]:
    """Convertit les lignes brutes de JobSpy en offres normalisées.

    Fonction pure (pas de dépendance jobspy/pandas) → testable en isolation.
    """
    offers: list[dict] = []
    for r in records:
        url = _coerce_str(r.get("job_url") or r.get("url"))
        site = _coerce_str(r.get("site"))
        salary = ""
        smin, smax = r.get("min_amount"), r.get("max_amount")
        if smin or smax:
            salary = "-".join(_coerce_str(x) for x in (smin, smax) if x)
        offers.append(
            {
                "source": f"jobspy:{site}" if site else "jobspy",
                "source_id": _coerce_str(r.get("id")) or url,
                "title": _coerce_str(r.get("title")),
                "company": _coerce_str(r.get("company")),
                "location": _coerce_str(r.get("location")),
                "contract_type": _coerce_str(r.get("job_type")),
                "salary": salary,
                "description": _coerce_str(r.get("description")),
                "url": url,
            }
        )
    return offers


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/search")
def search(
    term: str = Query(..., description="mots-clés"),
    location: str = Query("France"),
    results: int = Query(50, ge=1, le=200),
    hours_old: int = Query(72, ge=1),
    sites: str | None = Query(None, description="liste séparée par des virgules"),
    country_indeed: str = Query("France"),
) -> dict:
    try:
        from jobspy import scrape_jobs  # import paresseux
    except ImportError as e:  # pragma: no cover
        raise HTTPException(503, f"python-jobspy non installé : {e}")

    site_list = [s.strip() for s in sites.split(",")] if sites else DEFAULT_SITES
    try:
        df = scrape_jobs(
            site_name=site_list,
            search_term=term,
            location=location,
            results_wanted=results,
            hours_old=hours_old,
            country_indeed=country_indeed,
        )
    except Exception as e:  # pragma: no cover - dépend des boards externes
        raise HTTPException(502, f"échec scraping JobSpy : {e}")

    records = df.to_dict("records") if df is not None else []
    offers = normalize_records(records)
    return {"count": len(offers), "offers": offers}
