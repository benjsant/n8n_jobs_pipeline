"""Schémas d'entrée/sortie de l'agent — contrat IDENTIQUE au §6 du system prompt.

Le service LangGraph remplace l'appel DeepSeek du workflow n8n 02 : il doit donc
renvoyer EXACTEMENT le même JSON que celui que le `02` parse aujourd'hui
(cf. prompts/agent-system-prompt.md §6 et scripts/test_deepseek.py).
"""
from __future__ import annotations

from typing import Literal, TypedDict

from pydantic import BaseModel, Field

TEMPLATES = ("ia-junior", "backend", "frontend", "alternance", "candidature-spontanee")
RECOMMANDATIONS = ("postuler", "postuler_si_peu_options", "ne_pas_postuler")


# ── Entrée : l'offre (ce que le 02 envoie) ───────────────────────────────────
class Offer(BaseModel):
    title: str = ""
    company: str = ""
    location: str = ""
    description: str = ""
    company_info: str = ""
    spontaneous: bool = False


# ── Sortie : objet JSON strict (§6) ──────────────────────────────────────────
class Lettre(BaseModel):
    template: Literal[TEMPLATES] = "ia-junior"  # type: ignore[valid-type]
    accroche: str = ""


class CompetenceAAmeliorer(BaseModel):
    competence: str = ""
    conseil: str = ""


class PersonnalisationCv(BaseModel):
    summary: str = ""
    highlight_skills: list[str] = Field(default_factory=list)
    highlight_projects: list[str] = Field(default_factory=list)
    highlight_experiences: list[str] = Field(default_factory=list)
    hidden_sections: list[str] = Field(default_factory=list)


class AgentOutput(BaseModel):
    score: int = 0
    skills_score: int = 0
    experience_score: int = 0
    location_score: int = 0
    salary_score: int = 0
    recommandation: Literal[RECOMMANDATIONS] = "ne_pas_postuler"  # type: ignore[valid-type]
    justification_score: str = ""
    matching_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    competences_a_ameliorer: list[CompetenceAAmeliorer] = Field(default_factory=list)
    conseils: str = ""
    lettre: Lettre = Field(default_factory=Lettre)
    adaptation_cv: str = ""
    personnalisation_cv: PersonnalisationCv = Field(default_factory=PersonnalisationCv)
    objet_email: str = ""
    langue: Literal["fr", "en"] = "fr"


# ── État du graphe LangGraph ─────────────────────────────────────────────────
class AgentState(TypedDict, total=False):
    offer: dict          # Offer.model_dump()
    cv_index: str        # contenu de cv/cv-index.json (valeurs sélectionnables)
    system_prompt: str   # prompts/agent-system-prompt.md
    analysis: dict       # sortie du nœud analyze (§6 sans la lettre)
    lettre: dict         # sortie du nœud accroche ({template, accroche})
    output: dict         # AgentOutput.model_dump() — sortie finale (validate)
    error: str
