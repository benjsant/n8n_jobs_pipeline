# TASKS.md — Plan de build pour Claude Code

> Plan d'exécution ordonné. Chaque tâche est autonome, avec un objectif, des
> étapes, et des critères d'acceptation. Fais-les dans l'ordre. Coche `[x]` au
> fur et à mesure. Avant de commencer, lis `CLAUDE.md` et `docs/reference.md`.
>
> Règle d'or : après chaque tâche, vérifie les critères d'acceptation avant de
> passer à la suivante. Ne committe jamais `.env`.
>
> **Source de vérité = PostgreSQL.** Notion n'est plus le stockage : il pourra
> servir, plus tard et optionnellement, de simple interface de consultation.

---

## ✅ Tâche 0 — Vérifier l'environnement (déjà fait en partie)

Le squelette existe déjà : `docker-compose.yml`, `.env.example`, `.gitignore`,
`CLAUDE.md`, `README.md`, `prompts/agent-system-prompt.md`,
`workflows/02-agent-candidature.json`.

**Étapes**
- [ ] Vérifier que tous ces fichiers sont présents.
- [ ] `git init` si ce n'est pas fait, vérifier que `.env` est bien ignoré.
- [ ] Créer `.env` à partir de `.env.example` (laisser les valeurs vides que
      l'utilisateur remplira lui-même — NE PAS inventer de clés).

**Critères d'acceptation**
- `git status` ne montre jamais `.env` comme suivi.
- `docker compose config` ne renvoie pas d'erreur de syntaxe.

---

## ⬜ Tâche 1 — Démarrer la stack et valider n8n

**Objectif** : avoir n8n + Postgres qui tournent et l'UI accessible.

**Étapes**
- [ ] `docker compose up -d`
- [ ] Vérifier les logs : `docker compose logs n8n --tail=50`
- [ ] Confirmer que `http://localhost:5678` répond et demande l'auth basique.

**Critères d'acceptation**
- Les deux conteneurs sont `healthy` / `running`.
- L'UI n8n se charge.

---

## ⬜ Tâche 2 — Schéma PostgreSQL (source de vérité)

**Objectif** : créer les tables métier dans Postgres (distinctes des tables
internes de n8n).

**Étapes**
- [ ] Écrire `db/schema.sql` avec les tables `offers`, `companies`,
      `applications`, `generated_documents`, `profile` (schéma exact dans
      `docs/reference.md`).
- [ ] Inclure : `hash` unique sur `offers`, contraintes de statut, index sur
      `offers.hash` et `offers.status`.
- [ ] Appliquer le schéma (montage d'init Postgres ou exécution manuelle).

**Critères d'acceptation**
- Les 5 tables existent dans la base.
- Insérer deux fois la même offre (même `hash`) ne crée pas de doublon.

---

## ⬜ Tâche 3 — Configurer le profil candidat

**Objectif** : remplir la section 3 de `prompts/agent-system-prompt.md` ET les
données structurées du CV (`cv/*.json`).

**Étapes**
- [ ] Demander à l'utilisateur ses vraies infos (compétences, expérience,
      projets, formation, préférences) OU lui rappeler de les remplir lui-même.
- [ ] Reporter ces infos dans `cv/profile.json`, `skills.json`, `projects.json`,
      `experiences.json`, `education.json`.
- [ ] Ne RIEN inventer. Si une info manque, laisser un placeholder explicite.

**Critères d'acceptation**
- La section 3 ne contient plus de `[crochets]` non remplis (ou ils sont
  marqués « à compléter par l'utilisateur »).
- Les fichiers `cv/*.json` sont valides et cohérents avec le system prompt.

---

## ⬜ Tâche 4 — Tester l'agent DeepSeek seul

**Objectif** : valider que l'appel DeepSeek + system prompt produit un JSON conforme.

**Étapes**
- [ ] Vérifier que `DEEPSEEK_API_KEY` est rempli dans `.env`.
- [ ] Écrire un petit script de test `scripts/test_deepseek.py` (ou commande
      curl) qui envoie le system prompt + une offre fictive et affiche la sortie.
      Détails API dans `docs/reference.md`.
- [ ] Vérifier que la réponse est un JSON valide respectant le schéma de la
      section 6 du system prompt (score, recommandation, données CV, lettre…).

**Critères d'acceptation**
- La sortie parse en JSON sans erreur et contient les clés attendues.
- Le JSON CV ne contient que du réordonnancement / mise en avant — aucune
  compétence ou expérience inventée.

---

## ⬜ Tâche 5 — Workflow de recherche d'offres (01) : collecte → dédup → scoring → Postgres

**Objectif** : récupérer automatiquement les offres et les stocker dans Postgres.

**Étapes**
- [ ] Créer `workflows/01-recherche-offres.json`.
- [ ] Sources : France Travail (OAuth2 client credentials) + Adzuna + JobSpy
      (micro-service Python) + WTTJ (RSS). Détails dans `docs/reference.md`.
- [ ] Déclencheur : Schedule (ex. tous les jours à 8h). Mots-clés / filtres
      paramétrables en tête de workflow (Set node).
- [ ] **Déduplication** : calculer `hash = SHA256(title + company + location)`,
      ignorer si le hash existe déjà dans `offers`.
- [ ] **Scoring** : attribuer un score 0-100 (technos, adéquation profil,
      niveau junior, télétravail, localisation, salaire, contrat).
- [ ] Insérer les nouvelles offres dans `offers` (statut `new`).
- [ ] Logs techniques dans le canal Discord **jobs-log** (nb récupérées,
      doublons, retenues).

**Critères d'acceptation**
- Une exécution manuelle récupère des offres réelles et les insère dans Postgres.
- Les doublons sont filtrés via le hash.
- Chaque offre a un score 0-100.
- Un message de log arrive dans **jobs-log**.

---

## ⬜ Tâche 6 — Notification des offres pertinentes (Discord jobs-alerts)

**Objectif** : pousser les offres pertinentes vers l'utilisateur pour décision.

**Étapes**
- [ ] À la suite de la Tâche 5, sélectionner les offres au-dessus d'un seuil de
      score.
- [ ] Envoyer dans le canal **jobs-alerts** : score, titre, entreprise, lien,
      et actions « Générer candidature » / « Ignorer ».
- [ ] Une action « Générer candidature » fait passer l'offre en statut
      `selected` ; « Ignorer » → `ignored`.

**Critères d'acceptation**
- Une offre pertinente apparaît dans **jobs-alerts** avec son score.
- Choisir une action met à jour le `status` de l'offre dans Postgres.

---

## ⬜ Tâche 7 — Importer et fiabiliser le workflow agent (02)

**Objectif** : `workflows/02-agent-candidature.json` fonctionne dans n8n et
écrit dans Postgres.

**Étapes**
- [ ] Importer le workflow dans n8n.
- [ ] Déclencher l'agent quand une offre passe en statut `selected` (depuis la
      Tâche 6).
- [ ] L'agent évalue l'offre, génère les données CV + la lettre, et enregistre
      le résultat : création d'une ligne `applications` (statut `draft`) liée à
      l'offre et à l'entreprise.
- [ ] Corriger les expressions n8n si la version installée diffère.

**Critères d'acceptation**
- Une offre `selected` produit une lettre + des données CV + une ligne
  `applications` en statut `draft`.
- Réexporter le workflow corrigé dans `workflows/02-agent-candidature.json`.

---

## ⬜ Tâche 8 — Génération du CV (Astro → PDF) et de la lettre

**Objectif** : produire le CV PDF personnalisé et la lettre, à partir des
données structurées de l'agent.

**Étapes**
- [ ] Mettre en place le rendu Astro : `cv/template.astro` consomme
      `cv/*.json` + les `highlight_*` / `summary` produits par l'agent.
- [ ] Générer un PDF (export Astro / HTML→PDF). DeepSeek ne touche jamais au
      HTML/CSS.
- [ ] Choisir le template de lettre adapté dans `assets/letters/` et le remplir
      (profil + offre + infos entreprise réelles).
- [ ] Enregistrer les chemins dans `generated_documents` (`cv_path`,
      `letter_path`).

**Critères d'acceptation**
- Un PDF propre est généré, mise en page intacte.
- La lettre s'appuie sur un template existant, sans information inventée.
- Une ligne `generated_documents` référence les fichiers produits.

---

## ⬜ Tâche 9 — Brouillon Gmail + archivage Google Drive (garde-fou humain)

**Objectif** : préparer l'envoi sans jamais envoyer automatiquement.

**Étapes**
- [ ] Créer un **brouillon** Gmail avec CV + lettre en pièces jointes.
- [ ] IMPORTANT : ne JAMAIS envoyer automatiquement. Le brouillon attend une
      action humaine.
- [ ] Archiver `cv.pdf` et `lettre.pdf` sur Google Drive sous
      `Candidatures/<Entreprise>/`.

**Critères d'acceptation**
- L'email reste en **brouillon**, jamais envoyé sans action humaine.
- Les documents sont rangés dans le bon dossier Drive.

---

## ⬜ Tâche 10 — Orchestration de bout en bout

**Objectif** : pipeline complet recherche → notification → décision →
candidature.

**Étapes**
- [ ] Chaîner 01 (recherche) → jobs-alerts → décision → 02 (agent) → CV/lettre
      → brouillon Gmail + Drive.
- [ ] Mettre à jour les statuts Postgres à chaque étape
      (`new → selected → applied`, `applications.status`).

**Critères d'acceptation**
- Sélectionner une offre depuis Discord déclenche toute la chaîne jusqu'au
  brouillon Gmail.
- Les statuts en base reflètent l'avancement.

---

## ⬜ Tâche 11 — Documentation finale

**Étapes**
- [ ] Mettre à jour le README avec les workflows réellement créés.
- [ ] Documenter dans `docs/` toute déviation par rapport au plan.
- [ ] Vérifier une dernière fois qu'aucun secret n'est commité.

---

## 🔭 Évolutions (hors V1)

- **V2** : enrichissement entreprise (table `companies.ai_summary`), relances
  automatiques (détecter les `applications` sans `response_at`), dashboard
  Metabase.
- **V3** : historique intelligent, statistiques de réponse, priorisation
  automatique des entreprises, mémoire des candidatures.
- (Optionnel) Notion/Airtable comme interface de consultation en lecture seule
  au-dessus de Postgres.

---

## Principes à respecter pendant tout le build

- **KISS** : préférer une solution simple et lisible à une usine à gaz.
- **Source de vérité** : PostgreSQL. Ne pas réintroduire Notion comme stockage.
- **Secrets** : toujours via `.env`, jamais en dur.
- **Sources** : privilégier API/RSS officiels. Le scraping direct de LinkedIn
  est fragile et juridiquement gris — éviter.
- **Garde-fou humain** : aucune candidature n'est envoyée sans validation ;
  Gmail reste en brouillon.
- **CV** : DeepSeek produit des données, Astro fait le rendu — jamais d'invention.
- **Versionner** : chaque workflow validé est réexporté en JSON dans `workflows/`.
- **Demander avant d'inventer** : si une info perso manque, demander à
  l'utilisateur plutôt que d'inventer.
