# 🧠 Contexte Claude — mémoire portable du projet

> Ce fichier remplace ce que Claude « retient » entre les sessions (le dossier
> `.claude/` local n'est **pas** exportable d'un PC à l'autre). Il consigne les
> décisions prises, le pourquoi, l'état d'avancement et les points en attente,
> pour qu'un Claude sur une autre machine reprenne sans perte de contexte.
>
> À lire en début de session (référencé depuis `CLAUDE.md`). À tenir à jour
> quand une décision structurante est prise.

---

## 🔄 REPRISE DE SESSION — handoff (2026-07-08)

> À lire en premier pour reprendre. Résume l'état exact et le travail en cours.

**Durcissement + dédup + digest (2026-07-08, suite audit Claude)** : (1) liens
d'action Discord **signés** par `WEBHOOK_SECRET` (optionnel, vérifié par
`03`/`05`/`06`, vide = rétro-compatible) ; (2) l'INSERT du `01` **persiste enfin
les embeddings** (`offers.embedding` + nouvelle colonne `company_canon`) et fait
la **dédup sémantique inter-runs** (anti-join pgvector, SQL validé sur Postgres
jetable) — sur une base existante, appliquer `db/schema.sql` à la main ; (3)
nouveau workflow **`07-digest-hebdo`** (dimanche 18h : récap offres/candidatures
+ à relancer → jobs-alerts) ; (4) docs resynchronisées avec le code
(`workflows/README.md` : 3 sources réelles, `04` = livraison Discord ;
`CLAUDE.md` : stack/pipeline/arborescence actuels) ; (5) fix `db/queries.test.sh`
(image pgvector + attente robuste — il échouait sur main). Après réimport des
workflows dans n8n : réactiver, et renseigner `WEBHOOK_SECRET` dans `.env`.

**Exploitation du même jour (2ᵉ vague)** : tout est **déployé et vérifié en
réel** (WEBHOOK_SECRET dans le .env local, migration appliquée, 8 workflows
importés/actifs, run du 01 en succès : 14 offres insérées AVEC embeddings).
En opérant : throttle + retry sur les nœuds Discord du 01 (le run du
2026-07-07 était mort en 429), **workflow `08-notification-erreurs`** (Error
Workflow des 01→07 : échec → jobs-log), **`just deploy-workflows`** (credential
+ import + réactivation + restart en une commande), et **fuseau corrigé**
(`GENERIC_TIMEZONE=Europe/Paris` ; sans lui n8n était en America/New_York et
le « 8h » partait à 14h Paris — constaté sur les exécutions).

**MVP n8n = TERMINÉ et déployé sur `main`**. Chaîne complète
**sans Google** : `01` (cron 8h, sources **France Travail réparé + JobSpy**) → Discord
→ clic Générer → `03 → 02` (agent → **CV ATS par défaut** + **lettre
assemblage déterministe**) → `04` = **livraison Discord** (CV + lettre en PJ, garde-fou
humain). Maillon spontané `05` OK et **LBA branché sur de vraies entreprises** (clé
`LBA_API_KEY` en place, forme API vérifiée le 2026-06-28).
Service de rendu, purge auto (`cleanup`, 21 j), guides `docs/oauth-google.md` +
`docs/cles-sources.md`. Préférences candidat : **pas de tiret cadratin (—)**, pas
d'exagération de distance (encodées §5 du system prompt + mémoire).

**v0.2.0 = MERGÉ sur `main` et tagué (2026-06-28)** : l'agent du `02` est extrait dans un
service **LangGraph** (`services/agent-langgraph/`, plan `docs/plan-langgraph.md`).
`main` et `feat/agent-langgraph` sont synchro avec `origin`.
- ✅ Phase 1.1 (commit `ecfe064`) : squelette strangler, 1 nœud, parité §6 prouvée.
- ✅ Phase 1.2 (commit `2444013`) : 3 nœuds `analyze`(0.2) → `accroche`(0.7) → `validate`
  (déterministe, anti tiret cadratin). 5 tests verts, parité réelle OK.
- ✅ **Phase 2 — tool `company_research`** (commits `adf05b9` WIP + `2a56341` finalisation) :
  graphe `analyze → research → accroche → validate`. `agent/tools.py`
  (`search_company_web` DuckDuckGo HTML, tolérant → '' si bloqué), grounding injecté dans
  `accroche_node`, `httpx` aux deps, recherche mockée dans les tests. **VALIDÉ le 2026-06-27** :
  build `--network=host` OK, **pytest 5/5 vert**, **vrai appel DeepSeek** sur une offre Ponera
  → DDG renvoie le vrai secteur (logistique/e-commerce, entrepôt Prouvy), accroche groundée,
  **aucune invention d'« ESN »**, template `backend`, score 85. README service à jour.
  ⚠️ DDG peut rester bloqué/vide selon le réseau → fallback propre (accroche sur l'offre).

**FILE D'ATTENTE — toute traitée le 2026-06-28** :
1. ✅ ~~Finir Phase 2~~ (company_research, validé le 2026-06-27).
2. ✅ ~~Intégration LangGraph~~ : service au `docker-compose`, le `02` poste sur
   `AGENT_API_URL` (`http://agent-langgraph:8001/agent/run`). **Mesure v1 vs v2** (5 offres)
   faite : v2 plus spécifique, plus honnête sur les manques, meilleur choix de template,
   pour ~2x la latence → merge `--no-ff` + tag `v0.2.0`.
3. ✅ ~~CV ATS~~ : choix retenu = **garder les DEUX styles**, ATS prioritaire par défaut
   (pas de remplacement). `cv/template-ats.astro` (porté de `astro-portfolio/src/pages/cv.astro`,
   1 colonne, **sans photo**, `<style is:inline>`, couleurs hex, mêmes `cv/*.json` + perso) ;
   switch `CV_STYLE` dans `cv/src/pages/index.astro` (`ats` défaut / `design` = ancien
   `cv/template.astro`) ; `CV_STYLE` câblé dans le service `render` + `.env.example` ;
   `cv/README.md` documente les deux. Rendu PDF vérifié (ATS 1 page sans photo, design intact).
   Commit `cb479cc`.

**PROCHAINE ÉTAPE (opérationnel, hors code) — PLUS BLOQUÉ PAR LES CLÉS** : le `.env` a déjà
le trio minimum (`DEEPSEEK_API_KEY`, `FRANCE_TRAVAIL_CLIENT_ID/_SECRET`, `DISCORD_WEBHOOK_ALERTS`
+ `_LOG`) — vérifié le 2026-06-28. Vides = optionnel seulement (Adzuna, SERPAPI, RAPIDAPI, LBA,
WTTJ, OAuth Google inutile car livraison Discord). Le service `agent-langgraph` est câblé
(reçoit `DEEPSEEK_API_KEY`, monte `/prompts`+`/cv`). Reste à : `just up`, puis dans l'UI n8n
importer `01`–`05`, associer la credential Postgres, **activer** (un réimport repasse inactif →
`03`/`05` échouent sinon), déclencher le `01` et vérifier la chaîne réelle. Idée notée :
variante ATS strictement noir/blanc si un parser très ancien le justifie (trivial à ajouter).

**Rappels** : Benjamin travaille directement sur `main`. Builds Docker avec
**`--network=host`** (DNS du builder capricieux). `.env` jamais commité.

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
    `src/data/cv.ts` = source de vérité) via `just cv-sync`
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
18. **Localisation réelle = Valenciennes + Lille** (2026-06-22). Le seed
    d'exemple pointait Lyon (`69123`) ; remplacé par 4 profils réels (Dev IA/ML
    junior + Dev Backend Python junior, chacun à Valenciennes `59606` et Lille
    `59350`, rayon 30 km, contrats `CDI,Alternance`). **2 ancres** couvrent le
    corridor ~50 km (la dédup gère le recouvrement). Surtout : seul France
    Travail consommait la zone (INSEE+rayon) ; les 4 sources texte (Adzuna,
    SerpApi, JobSpy, JSearch) cherchaient `"France"` **en dur** → corrigé via une
    colonne `search_profiles.location_label` (nom de ville). Les API ne géocodent
    pas une adresse/gare : INSEE+rayon (FT) ou nom de ville (le reste).
19. **Source La Bonne Alternance** (2026-06-22, 7e source) : service public
    apprentissage spécifique **alternance**, renvoie offres ET **entreprises à
    contacter en candidature spontanée**. Cherche par **codes ROME + lat/long**
    (≠ INSEE/ville) → colonnes `latitude`, `longitude`, `rome_codes` (`M1805`)
    ajoutées à `search_profiles`. Le `01` fan-out la réponse : `jobs[]` → pipeline
    offres ; `recruiters[]` → `normalizeLBARecruiters` → upsert `companies` +
    Discord « candidature spontanée ». Clé `LBA_API_KEY`
    (api.apprentissage.beta.gouv.fr). ✅ **Forme VÉRIFIÉE le 2026-06-28** : vrai appel
    HTTP 200 (auth `Bearer`), réponse `{ jobs, recruiters, warnings }`, 14 recruiters
    réels (zone Valenciennes/Lille, rome M1805). Les deux normaliseurs sont **verrouillés
    par des fixtures réelles** (`sources.test.mjs`). Réserve : jobs partenaires (FT) →
    `company` vide (workplace null, pas d'invention). Le maillon lettre spontanée (`05`)
    était déjà fait (décision 23) ; LBA est donc **opérationnel de bout en bout**.
20. **Runner = `Justfile`** (2026-06-22, remplace le `Makefile`). Mêmes noms de
    cibles (`just up`, `just test`, `just cv-sync`…). Adapté **full Docker** : les
    tâches Node/Python tournent dans un conteneur jetable (`node:20-alpine` /
    `python:3.12-alpine`), donc **aucun node/python requis sur l'hôte**. `just`
    s'installe via `dnf install just` (Fedora/Nobara). `set dotenv-load` charge
    `.env`. Lister : `just --list`.
23. **Maillon candidature spontanée** (2026-06-24, construit + testé en réel). Les
    entreprises LBA « à contacter » (sans offre) sont traitées via un nouveau
    workflow **`05-candidature-spontanee`** (webhook `spontaneous-apply?company=<nom>`,
    lien dans l'alerte Discord spontanée du `01`). Le `05` charge l'entreprise →
    appelle le **`02` en mode spontané** : le `02` a été étendu (`spontaneous=true`,
    `offer_id` NULL) → même branche que les offres (enrichissement → application →
    rendu → `04`), mais **force le template `candidature-spontanee`** et écrit
    `applications.kind='spontaneous'`. Schéma : `applications.offer_id` rendu
    **nullable** + colonne **`kind`** (`offer`/`spontaneous`). **Testé end-to-end**
    avec une entreprise factice → lettre spontanée parfaite (accroche spécifique +
    corps figé verbatim + `{{entreprise.nom}}` substitué). ⚠️ Réimporter un workflow
    le repasse **inactif** : réactiver `02` après réimport (sinon `05`/`03` échouent
    « Workflow is not active »).
22. **Lettre = corps figé + assemblage déterministe** (2026-06-23, refonte initiée
    par l'utilisateur). Les `assets/letters/*.md` sont désormais **quasi-complets** :
    le corps est **figé et validé** par le candidat ; l'agent ne produit QUE
    l'**accroche** (2-3 phrases). §6 : `lettre_motivation` (texte complet) →
    remplacé par `lettre: { template, accroche }`. L'assemblage (corps figé +
    accroche + `{{placeholders}}`) est **déterministe**, fait par le service de
    rendu (`cv/letter-template.mjs`, `assembleLetter`, 7 tests), **jamais par le
    LLM** → corps garanti verbatim. `./assets` monté en RO dans le conteneur
    `render` (`LETTERS_DIR=/assets/letters`). Le `02` envoie `template`+`accroche`+
    `vars{poste}` ; le service complète le reste depuis `profile.json`. Vars
    alternance (`formation_visee`/`rythme`/`date_debut`) = bloc `profile.alternance`
    (manuel, préservé au sync, défauts neutres si vide — **à compléter par l'utilisateur**).
21. **Voix candidat encodée + résidence Marly** (2026-06-22). 6 vraies lettres du
    candidat (`astro-portfolio/lettres-motivation/*.docx`) lues et **distillées en
    patterns** dans la §5 du system prompt + un bloc « ton de référence » dans
    chacun des 5 `assets/letters/*.md`. **Lettres non committées** (dépôt public) :
    seuls les patterns le sont. Faits confirmés : résidence **Marly (59)** (champ
    manuel `cv/profile.json.residence`, **préservé au sync** via `keepIfFilled`,
    injecté dans l'en-tête + la date « Marly, le … » par `cv/server.mjs`) ; email
    des lettres = **santrissebenjamin@gmail.com** (principal, = CV). Garde-fou
    inchangé : la voix guide le ton, jamais les faits.
24. **Agent en service LangGraph** (2026-06-28, `v0.2.0`). L'agent du `02` (appel
    DeepSeek monolithique) est extrait dans `services/agent-langgraph/` : graphe
    `analyze`(0.2) → `research` → `accroche`(0.7) → `validate` (déterministe), tool
    `company_research` (DuckDuckGo, grounding anti-invention de l'accroche), sortie
    **identique au §6**. n8n reste l'orchestrateur ; le `02` poste sur `AGENT_API_URL`.
    Mesuré meilleur que le monolithe (spécificité, honnêteté sur les manques, template)
    pour ~2x la latence. Service au `docker-compose`, mergé sur `main` + tag `v0.2.0`.
25. **CV : deux styles, ATS par défaut** (2026-06-28). Décision de **garder les deux**
    rendus (pas de remplacement) : `cv/template-ats.astro` (1 colonne, **sans photo**,
    pensé filtres ATS, porté de `astro-portfolio/src/pages/cv.astro`) et `cv/template.astro`
    (design hero/timeline, photo optionnelle). `cv/src/pages/index.astro` choisit via
    `CV_STYLE` (`ats` défaut / `design`). Mêmes données `cv/*.json` + personnalisation pour
    les deux ; `<style is:inline>` + couleurs hex (rendu PDF en `file://`). Archi inchangée :
    DeepSeek = données, Astro = rendu.
26. **Webhooks d'action signés** (2026-07-08). Les liens ✅/🚫/spontanée/entretien
    des messages Discord sont des GET **mutables** : un robot de prévisualisation
    de liens peut les visiter. `WEBHOOK_SECRET` (`.env`, passé à n8n) est ajouté
    en `&token=` par le `01` et vérifié par `03`/`05`/`06` (throw si mismatch).
    Vide = désactivé (aucune rupture). La vraie solution long terme reste un bot
    Discord à boutons natifs (interactions signées).
27. **Dédup sémantique inter-runs + embeddings persistés** (2026-07-08). Avant :
    embeddings calculés par le `01` mais jamais insérés (colonne pgvector vide,
    index HNSW inutile) ; dédup limitée au lot du jour. Maintenant : le nœud
    généré « Dédup sémantique » attache `embedding` + `company_canon` (nouvelle
    colonne `offers`), et l'INSERT (executeQuery) fait un anti-join
    (`embedding <=> $vec <= 0.20` + même `company_canon`) avant insertion.
    Seuil = 1 - SEMANTIC_DUP_THRESHOLD (0.80, offer-utils.mjs). Comportement
    validé par un test SQL réel (quasi-doublon rejeté, autre entreprise passe,
    sans embedding passe). ⚠️ Migration : base existante → rejouer schema.sql.
28. **Workflow 07 digest hebdo** (2026-07-08). Cron dimanche 18h → une requête
    stats (offres 7 j par statut, totaux candidatures, top 5 « à relancer » :
    sent sans réponse > 7 j, non relancées récemment) → message jobs-alerts.
    Lecture seule, garde si webhook absent.
29. **Workflow 08 = Error Workflow global** (2026-07-08). Déclaré dans
    `settings.errorWorkflow` des workflows 01→07 : tout échec d'exécution poste
    workflow + nœud + message sur jobs-log (fallback alerts). Motivation : le
    run du 2026-07-07 avait échoué en silence (429 Discord), invisible hors UI.
    ⚠️ Le 08 doit être ACTIF : n8n 2.x refuse d'exécuter un error workflow
    inactif (constaté en réel). Testé de bout en bout : erreur provoquée sur
    le 03 → exécution wf08 en succès → message posté sur jobs-log. Au passage :
    throttle 1 msg/2 s + retry sur les 3 nœuds Discord du 01 (cause du 429).
30. **`just deploy-workflows`** (2026-07-08). Déploiement en une commande :
    substitue `REMPLACER` par l'id réel de la credential Postgres (lu dans
    `credentials_entity`), importe chaque `NN-*.json`, réactive tout sauf le 08,
    redémarre n8n. Remplace la procédure manuelle en 4 étapes piégeuse
    (credential perdue à l'import, workflows désactivés).
31. **Fuseau horaire des crons fixé** (2026-07-08). `GENERIC_TIMEZONE` + `TZ`
    (défaut Europe/Paris) ajoutés au service n8n : sans eux, n8n tournait en
    America/New_York et le cron « 8h » du 01 partait à **14h heure de Paris**
    (vérifié sur les startedAt réels : 12:00 UTC = 8:00 New York).
32. **Parité totale nœuds ↔ lib** (2026-07-08). `build-nodes.mjs` génère
    désormais **12 nœuds** (8 du 01 : scorer, dédup, 4 normaliseurs, scoring
    LLM ×2 ; 4 du 02 : enrichissement ×2, payloads de rendu ×2) depuis
    sources/llm-scoring/company-enrichment/render-payloads. Les copies
    manuelles avaient déjà dérivé (prompts condensés) ; les libs testées
    redeviennent l'unique source. Restent manuels : la pure glu n8n.
33. **Tests cassette** (2026-07-08). `tests/test_cassettes.py` + 5 fixtures
    `tests/cassettes/*.json` (réponses LLM réalistes, forme du run réel
    Proxiad) : chemin nominal §6, rejet du juge puis correction (feedback
    vérifié dans le prompt), épuisement des 3 tentatives (validate nettoie),
    spontanée (template forcé), entretien. 31 tests pytest verts.
34. **Stats de taux de réponse** (2026-07-08). `db.response_stats()` +
    `GET /stats` + carte « Statistiques de réponse » dans l'interface :
    par type (offre/spontanée, délai moyen), par tranche de score, par source
    (hors brouillons). Pour calibrer le scoring sur du réel.
35. **Auth opt-in de la mini-interface** (2026-07-08). `UI_TOKEN` (vide =
    comportement historique) : middleware FastAPI (401 sans jeton, sauf
    /health), cookie posé via `/?token=`, header `X-UI-Token` envoyé par les
    workflows 02/06 (câblé compose + .env.example). Préalable à toute
    ouverture de `BIND_HOST`.

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
