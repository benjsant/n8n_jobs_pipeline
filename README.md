# 🎯 job-hunter

Automatisation de recherche d'emploi pour développeur IA : recherche d'offres
par mots-clés, suivi dans Notion, et génération de lettres de motivation +
adaptations de CV personnalisées par entreprise via un agent LLM (DeepSeek).

## Stack

n8n (Docker) · PostgreSQL · DeepSeek · Notion · France Travail / JobSpy ·
Telegram · piloté avec Claude Code.

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

**Phase 1 — Recherche d'offres**
Déclencheur planifié → requêtes API (France Travail) + JobSpy + RSS →
déduplication → stockage Notion → notification Telegram.

**Phase 2 — Candidature (l'agent)**
Sélection d'une offre → l'agent DeepSeek évalue l'adéquation, analyse
l'entreprise, génère lettre + adaptation CV → relecture humaine → envoi.

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
