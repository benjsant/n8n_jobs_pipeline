"""Outils de l'agent — recherche web légère pour GROUNDER l'accroche.

`search_company_web` interroge DuckDuckGo (HTML, sans clé, petit volume) et renvoie
quelques extraits réels sur l'entreprise. But : éviter les inventions (ex. supposer
« Ponera = ESN » alors que c'est de l'e-commerce). Tolérant : toute erreur réseau
ou format -> chaîne vide (l'accroche retombe alors sur le texte de l'offre, sans
régression).

⚠️ Usage perso, faible volume. Les extraits sont une AIDE, jamais une vérité :
le prompt impose à l'agent de ne s'en servir que s'ils sont pertinents et de ne
jamais inventer.
"""
from __future__ import annotations

import html
import re

_TAG = re.compile(r"<[^>]+>")
_SNIPPET = re.compile(r'class="result__snippet"[^>]*>(.*?)</a>', re.S)
_TITLE = re.compile(r'class="result__a"[^>]*>(.*?)</a>', re.S)
_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


def _clean(s: str) -> str:
    return html.unescape(_TAG.sub("", s)).strip()


def search_company_web(company: str, location: str = "", max_snippets: int = 3, timeout: float = 8.0) -> str:
    """Renvoie quelques extraits web sur l'entreprise (ou '' si rien/échec)."""
    company = (company or "").strip()
    if not company:
        return ""
    import httpx  # import paresseux (le module reste importable sans réseau)

    query = f"{company} entreprise {location}".strip()
    try:
        resp = httpx.post(
            "https://html.duckduckgo.com/html/",
            data={"q": query},
            headers={"User-Agent": _UA},
            timeout=timeout,
            follow_redirects=True,
        )
        resp.raise_for_status()
        body = resp.text
    except Exception:
        return ""

    titles = [_clean(t) for t in _TITLE.findall(body)]
    snippets = [_clean(s) for s in _SNIPPET.findall(body)]
    lines: list[str] = []
    for i, snip in enumerate(snippets):
        if not snip:
            continue
        title = titles[i] if i < len(titles) else ""
        lines.append(f"- {title + ' : ' if title else ''}{snip}")
        if len(lines) >= max_snippets:
            break
    return "\n".join(lines)
