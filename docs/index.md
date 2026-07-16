# 🎯 Job Hunter

Assistant de recherche d'emploi **semi-automatique** pour développeur IA / backend.
Il collecte des offres sur 7 sources, les dédoublonne, les score, notifie sur
Discord, puis, sur validation humaine, génère un **CV personnalisé** (Astro → PDF)
et une **lettre de motivation** via un agent LLM, prépare la candidature et un
**dossier d'entretien**.

!!! warning "Garde-fou non négociable"
    Le système **assiste**, il n'invente jamais (ni compétence, ni expérience, ni
    fait sur l'entreprise) et **n'envoie jamais** une candidature sans relecture
    humaine.

PostgreSQL est la **seule source de vérité**. n8n orchestre ; l'intelligence
(scoring, accroche, prépa entretien) vit dans un micro-service Python **LangGraph**.

## Par où commencer

<div class="grid cards" markdown>

- :material-rocket-launch: **[Mini-interface](interface.md)**
  Sans déployer : générer depuis une URL, trier les offres, suivre les réponses.

- :material-download: **[Installation](installation.md)**
  Lancer la stack complète (Docker Compose) sur une nouvelle machine.

- :material-key: **[Clés & sources](cles-sources.md)**
  Quelles clés créer (DeepSeek, France Travail, Discord…) et où les coller.

- :material-lightbulb-on: **[Choix technologiques](choix-techniques.md)**
  Pourquoi chaque brique (n8n, Postgres, LangGraph, DeepSeek…) a été retenue.

</div>

## Ce que ça fait

| Étape | Détail |
|---|---|
| **Collecte** | France Travail, Adzuna, JobSpy, WTTJ (RSS), SerpApi, JSearch, La Bonne Alternance. Multi-profils, cron quotidien. |
| **Dédup** | Hash exact (SHA256 canonicalisé, accent-insensible) **+ sémantique** (embeddings pgvector). |
| **Scoring** | 0-100 piloté par le profil + affinage LLM. Filtre géo et exclusions. |
| **Agent** | Graphe LangGraph : jugement, accroche groundée **auto-corrigée**, personnalisation CV. |
| **Enrichissement** | Registre officiel INSEE + web léger, pour ancrer les faits entreprise. |
| **CV** | 2 styles (ATS par défaut / design), titre adapté à l'offre, sans signe IA. |
| **Lettre** | Corps figé validé + accroche LLM, assemblage déterministe (5 templates). |
| **Entretien** | Dossier de prépa (faits entreprise, atouts, questions probables + réponses). |
| **Livraison** | CV + lettre livrés sur Discord. Validation humaine avant envoi. |
| **Suivi** | Page « Mes candidatures » : statuts, relances, notes ; miroir Airtable optionnel. |
| **Démarchage** | Entreprises à contacter (façon La Bonne Boîte) + candidature spontanée. |

## Le graphe de l'agent

```
START → analyze → research → accroche → judge ⇄ (retry max 3) → validate → END
```

- **analyze** : jugement (score, matching/missing, personnalisation CV).
- **research** : faits officiels (INSEE) + web, *grounding anti-invention*.
- **accroche** : 2-3 phrases groundées (le corps de la lettre est figé hors LLM).
- **judge** : auto-évaluation (clichés, superlatifs, tirets IA) → régénère si rejet.
- **validate** : nettoyage déterministe + sortie contractuelle.

## Deux façons de l'utiliser

| Besoin | À lancer |
|---|---|
| **Candidature ponctuelle depuis une URL** | `just ui` → [mini-interface](interface.md) |
| **Collecte automatique** (offres → alertes Discord) | `just up` (stack complète) |

---

Code source : [github.com/benjsant/job_hunter](https://github.com/benjsant/job_hunter)
