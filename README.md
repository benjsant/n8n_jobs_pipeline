# 🎯 job-hunter

Assistant de recherche d'emploi semi-automatique pour développeur IA : collecte
d'offres multi-sources, déduplication, scoring, suivi dans **PostgreSQL**, et
génération de CV (Astro→PDF) + lettres de motivation personnalisées par
entreprise via un agent LLM (DeepSeek). Validation humaine avant tout envoi.

## Stack

n8n (Docker) · **PostgreSQL (source de vérité)** · DeepSeek · CV Astro→PDF ·
France Travail / Adzuna / JobSpy / WTTJ · Discord · Gmail (brouillon) ·
Google Drive · piloté avec Claude Code.

## Démarrage rapide

```bash
# 1. Configurer les secrets
cp .env.example .env
openssl rand -hex 32        # colle le résultat dans N8N_ENCRYPTION_KEY

# 2. Lancer la stack
docker compose up -d

# 3. Ouvrir n8n
#    http://localhost:5678  (login défini dans .env)

# 4. Importer les workflows
#    Dans n8n : Workflows → Import from File → workflows/*.json
```

## Architecture

```
Sources → Collecte → Déduplication (SHA256) → Scoring (0-100) → PostgreSQL
→ Discord → Validation humaine → Agent candidature → CV Astro/PDF
→ Lettre → Brouillon Gmail → Google Drive
```

**Phase 1 — Recherche d'offres**
Déclencheur planifié → requêtes API (France Travail + Adzuna) + JobSpy + RSS →
déduplication → scoring → stockage **PostgreSQL** → notification Discord
(jobs-alerts + jobs-log).

**Phase 2 — Candidature (l'agent)**
Sélection d'une offre → l'agent DeepSeek évalue l'adéquation, analyse
l'entreprise, produit des données structurées → CV rendu par Astro (PDF) +
lettre depuis un template → brouillon Gmail + archivage Drive → relecture
humaine avant envoi. PostgreSQL est la seule source de vérité ; Notion n'est pas
le stockage (au plus une vue de consultation ultérieure).

L'agent est entièrement piloté par `prompts/agent-system-prompt.md`. C'est le
fichier le plus important du projet : son comportement, ses garde-fous et son
format de sortie y sont définis.

## Configurer DeepSeek

1. Récupère ta clé sur https://platform.deepseek.com et mets-la dans `.env`
   (`DEEPSEEK_API_KEY`).
2. L'API est compatible OpenAI. Le workflow `02-agent-candidature.json` appelle
   directement `https://api.deepseek.com/chat/completions` en HTTP, avec le
   system prompt chargé depuis `/prompts/`.
3. Modèles : `deepseek-chat` (rapide) ou `deepseek-reasoner` (raisonnement
   plus poussé, utile pour le scoring d'adéquation).

## Personnaliser l'agent

Édite `prompts/agent-system-prompt.md`, surtout la **section 3 (profil du
candidat)**. Plus elle est précise et honnête, meilleures sont les lettres.
Aucune modification de workflow n'est nécessaire pour changer le comportement.

## Sécurité

- `.env` n'est jamais commité (voir `.gitignore`).
- Garde toujours une étape de relecture humaine avant tout envoi de candidature.
- Privilégie les sources avec API/RSS officiels au scraping direct.
