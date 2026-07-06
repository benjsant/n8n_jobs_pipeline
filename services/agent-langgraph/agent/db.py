"""Accès Postgres pour la page de tri des offres (mini-interface).

Optionnel : si Postgres n'est pas joignable (mode léger `just ui`, sans la
stack complète), les fonctions lèvent `DbUnavailable` et les routes renvoient
un 503 explicite plutôt que de planter. Postgres reste la source de vérité ;
on ne fait que lire les offres et basculer leur `status`.
"""
from __future__ import annotations

import os

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # dépendance absente = base indisponible
    psycopg = None


class DbUnavailable(RuntimeError):
    """Postgres non configuré ou injoignable (mode léger sans la stack)."""


# Statuts autorisés pour une bascule manuelle depuis la page de tri.
# (sous-ensemble du CHECK de la table offers ; 'new' n'est pas une cible)
SETTABLE_STATUS = {"reviewed", "selected", "ignored", "applied"}


def _dsn() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    host = os.environ.get("POSTGRES_HOST", "postgres")
    port = os.environ.get("POSTGRES_PORT", "5432")
    db = os.environ.get("POSTGRES_DB", "n8n")
    user = os.environ.get("POSTGRES_USER", "n8n")
    pwd = os.environ.get("POSTGRES_PASSWORD", "")
    return f"host={host} port={port} dbname={db} user={user} password={pwd}"


def _connect():
    if psycopg is None:
        raise DbUnavailable("psycopg non installé")
    try:
        return psycopg.connect(_dsn(), connect_timeout=3, row_factory=dict_row)
    except Exception as exc:  # connexion refusée, timeout, auth…
        raise DbUnavailable(str(exc)) from exc


def list_offers(status: str | None = None, limit: int = 50) -> list[dict]:
    """Offres récentes (les plus récentes d'abord), filtrables par statut."""
    limit = max(1, min(int(limit), 200))
    where, params = "", []
    if status:
        where = "WHERE status = %s"
        params.append(status)
    sql = (
        "SELECT id, hash, title, company, location, score, url, status, "
        "       to_char(created_at, 'YYYY-MM-DD') AS created "
        f"FROM offers {where} ORDER BY created_at DESC LIMIT %s"
    )
    params.append(limit)
    with _connect() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def set_offer_status(offer_hash: str, status: str) -> dict:
    """Bascule le statut d'une offre (par hash). Renvoie la ligne mise à jour."""
    if status not in SETTABLE_STATUS:
        raise ValueError(f"statut non autorisé : {status}")
    with _connect() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE offers SET status = %s WHERE hash = %s "
            "RETURNING id, hash, title, status",
            (status, offer_hash),
        )
        row = cur.fetchone()
        conn.commit()
    if not row:
        raise KeyError(offer_hash)
    return row


def counts_by_status() -> dict:
    """Compteur d'offres par statut (pour les onglets de la page)."""
    with _connect() as conn, conn.cursor() as cur:
        cur.execute("SELECT status, count(*) AS n FROM offers GROUP BY status")
        return {r["status"]: r["n"] for r in cur.fetchall()}
