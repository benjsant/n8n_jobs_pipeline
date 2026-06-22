# 🧠 Contexte Claude — mémoire portable du projet

> Ce fichier remplace ce que Claude « retient » entre les sessions (le dossier
> `.claude/` local n'est **pas** exportable d'un PC à l'autre). Il consigne les
> décisions prises, le pourquoi, l'état d'avancement et les points en attente,
> pour qu'un Claude sur une autre machine reprenne sans perte de contexte.
>
> À lire en début de session (référencé depuis `CLAUDE.md`). À tenir à jour
> quand une décision structurante est prise.

---

## 👤 Profil utilisateur

- **Benjamin Santrisse** — Développeur Backend Python (API, IA appliquée),
  reconverti vers l'IA (formation Développeur IA RNCP 6, Simplon Lille 2025-26).
- Prose et échanges **en français** ; identifiants techniques en anglais.
- Travaille seul sur le projet, directement sur la branche `main`.
- Tient à la **sécurité des secrets** : demande systématiquement de vérifier
  qu'aucune donnée sensible ne part avant un push.

## 🎯 Préférences candidat (déjà fixées)

- Recherche : **CDI ou alternance**, disponible immédiatement.
- Mode de travail : présentiel/hybride sur la **métropole Valenciennes / Lille**.
- → reportées en section 3 de `prompts/agent-system-prompt.md`, et le profil
  structuré vit dans `cv/*.json` (voir décision 13).

## 🧱 Décisions structurantes (et pourquoi)

1. **Racine canonique = `n8n_jobs_pipeline/`.** Un doublon complet `job-hunter/`
   existait ; il a été supprimé et la structure remontée à la racine
   (`workflows/`, `prompts/`, `docs/`, `assets/`). Raison : docker-compose monte
   `./workflows` et `./prompts`, qui doivent exister à la racine.
2. **Notifications : Discord uniquement.** Telegram (prévu à l'origine) a été
   **retiré** car il faisait doublon avec le webhook Discord choisi par l'utilisateur.
3. **Sources d'offres retenues** : France Travail (base, API officielle) +
   **Adzuna** (API gratuite) + **JobSpy** (micro-service Python, Tâche 5) +
   **Welcome to the Jungle** (RSS). Écartées pour l'instant : Jooble, Remotive
   (réactivables). Règle : privilégier API/RSS officiels, éviter le scraping direct.
4. **Secrets** : `.env` jamais commité (gitignoré, vérifié). Les secrets locaux
   (clé de chiffrement, mots de passe) sont **générés** dans `.env`, pas inventés.
   Les clés externes restent vides tant que l'utilisateur ne les fournit pas.
5. **Dépôt public** : `github.com/benjsant/n8n_jobs_pipeline`. Donc vigilance
   accrue : rien de sensible dans les fichiers suivis.
6. **PostgreSQL = seule source de vérité** (décision V2, 2026-06-10). Tables
   métier : `offers`, `companies`, `applications`, `generated_documents`,
   `profile`. Raison : Postgres est déjà dans la stack, schéma maîtrisé, pas de
   rate-limit/fragilité d'API comme colonne vertébrale. **Notion rétrogradé** :
   plus le stockage ; au plus une interface de consultation lecture seule, hors V1.
7. **CV : DeepSeek produit des données, Astro fait le rendu** (décision V2).
   L'agent ne sort que du JSON (`highlight_skills`, `highlight_projects`,
   `summary`, réordonnancement, masquage) à partir de `cv/*.json` ; le template
   Astro (HTML/CSS fixe) génère le PDF. L'agent ne touche jamais au HTML/CSS et
   n'invente rien. Garde-fou rendu structurel, pas seulement consigne de prompt.
8. **Lettres typées** dans `assets/letters/` (`ia-junior`, `backend`,
   `frontend`, `alternance`, `candidature-spontanee`) : l'agent choisit le
   modèle le plus adapté.
9. **Communication aval** : Discord deux canaux (jobs-alerts actionnable /
   jobs-log technique), **Gmail brouillon uniquement** (jamais d'envoi auto),
   archivage Google Drive sous `Candidatures/<Entreprise>/`.
10. **Dédup** = `SHA256(title + company + location)` ; **scoring** = 0-100.
11. **Multi-profils** (d'après l'export Airtable/Make réel) : table
    `search_profiles` (configs `must_have`/`exclusions`/seuil) ; le `01` boucle
    sur les profils actifs. Source **Google Jobs (SerpApi)** ajoutée aux sources.
12. **Rendu en micro-service** (`cv/server.mjs`, conteneur `render`,
    `RENDER_API_URL`) : le `02` POST `/cv` + `/letter` → PDF dans `./output`
    (volume partagé n8n ↔ render) → `generated_documents` → `04`. Raison : un
    `docker run` one-shot n'est pas appelable depuis n8n en marche.
13. **Profil réel synchronisé depuis le portfolio** (`benjsant/astro-portfolio`,
    `src/data/cv.ts` = source de vérité) via `make cv-sync`
    (`cv/scripts/sync-from-portfolio.mjs`, fonctions pures testées). Anti-invention :
    champ absent du portfolio = vide ; champs optionnels manuels préservés.
14. **Garde-fou anti-fuite modernisé** : le profil réel est committé volontairement
    (déjà public via le portfolio) ; `scripts/check-no-personal-data.sh` ne bloque
    plus sur « données réelles » mais sur motifs sensibles (tél/IBAN/NIR/adresse) + `.env`.
15. **Workflows avec `id` racine stable** (`wf01rechercheoff`…) : requis pour
    l'import sur n8n 2.x ; appels croisés `03→02`/`02→04` câblés sur ces ids.
16. **Cible de déploiement = VPS personnel privé** : accès UI n8n **uniquement
    via WireGuard** (n8n bindé sur l'IP WG, jamais `0.0.0.0`), SSH durci (port
    custom, clés only), `ufw` n'ouvre que SSH + WireGuard. `WEBHOOK_URL` = IP
    WireGuard (les liens d'action Discord sont cliqués depuis le PC connecté au
    tunnel ; Discord lui-même ne reçoit que des webhooks **sortants**). Guide
    complet : `docs/deploiement-vps.md`.
17. **Source JSearch (RapidAPI)** : 6e source du `01` (LinkedIn/Indeed/Glassdoor
    via API), alternative fiable au scraping JobSpy. Forme FT + JSearch vérifiées
    sur un workflow n8n réel. §6 enrichi (`conseils`, `competences_a_ameliorer`).

## ⏳ En attente de l'utilisateur

- **Clés externes** uniquement — c'est le **seul vrai blocage** restant pour un
  bout-en-bout réel : `DEEPSEEK_API_KEY` (le plus utile), une source (Adzuna
  gratuit ou `SERPAPI_KEY`), un webhook Discord. Plus, pour `04`, l'OAuth Google
  (Gmail+Drive) dans l'UI n8n. Tableau dans `reste-a-faire.md`.
- Optionnel : compléter les champs profil absents du portfolio (soft skills,
  salaire visé, secteurs à éviter, niveaux de compétence) — sinon laissés vides.

## 🚧 État d'avancement

Synthèse vivante dans **`reste-a-faire.md`**. Au **2026-06-20** : stack lancée
(postgres + n8n + jobspy + render, healthy), schéma DB initialisé, profil réel
en place et synchronisable, maillon `02→rendu→04` câblé **et rendu PDF vérifié**,
**4 workflows importés sans erreur sur n8n 2.26.7**. Logique métier testée hors
stack (8 suites + intégration DB). Reste : associer les credentials en UI,
fournir les clés, puis lancer un vrai bout-en-bout. Le `04` a un point connu à
fiabiliser (fusionner les binaires CV+lettre avant le nœud Gmail).

## 🧭 Règles de travail avec cet utilisateur

- Ne jamais committer `.env` ; vérifier l'absence de secrets avant chaque push.
- Ne jamais inventer d'information personnelle : demander.
- Garder une **relecture humaine** avant tout envoi de candidature.
- Committer/pusher **quand l'utilisateur le demande** ; messages de commit en français.
- Préférer les solutions simples (KISS) et versionner chaque workflow validé en JSON.

## 🔗 Où trouver le reste

- `CLAUDE.md` — contexte projet + conventions (point d'entrée).
- `docs/reference.md` — infos API exactes (DeepSeek, France Travail, Adzuna, Notion, Discord, JobSpy, WTTJ).
- `docs/reste-a-faire.md` — état d'avancement + clés à fournir.
- `docs/installation.md` — installation sur une nouvelle machine.
- `docs/deploiement-vps.md` — déploiement VPS privé (WireGuard + SSH durci).
- `docs/donnees-et-deepseek.md` — quelles données fournir, modèle DeepSeek,
  génération CV/lettre (PDF en sortie, pas en entrée) ; ce qui est attendu de l'utilisateur.
- `TASKS.md` — plan de build ordonné.
