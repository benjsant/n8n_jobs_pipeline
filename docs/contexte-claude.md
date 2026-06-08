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

- Développeur en recherche d'emploi dans l'**IA / le développement**, niveau
  **junior / débutant**.
- Prose et échanges **en français** ; identifiants techniques en anglais.
- Travaille seul sur le projet, directement sur la branche `main`.
- Tient à la **sécurité des secrets** : demande systématiquement de vérifier
  qu'aucune donnée sensible ne part avant un push.

## 🎯 Préférences candidat (déjà fixées)

- Niveau visé : **junior / débutant**.
- Types de contrat acceptés : **CDI, alternance, CDD**.
- Mode de travail : **flexible** (remote / hybride / sur site).
- → déjà reportées dans la section 3 de `prompts/agent-system-prompt.md`.

## 🧱 Décisions structurantes (et pourquoi)

1. **Racine canonique = `n8n_jobs_pipeline/`.** Un doublon complet `job-hunter/`
   existait ; il a été supprimé et la structure remontée à la racine
   (`workflows/`, `prompts/`, `docs/`, `assets/`). Raison : docker-compose monte
   `./workflows` et `./prompts`, qui doivent exister à la racine.
2. **Notifications : Discord uniquement.** Telegram (prévu à l'origine) a été
   **retiré** car il faisait doublon avec le webhook Discord choisi par l'utilisateur.
3. **Sources d'offres retenues** : France Travail (base, API officielle) +
   **Adzuna** (API gratuite) + **JobSpy** (micro-service Python, Tâche 6) +
   **Welcome to the Jungle** (RSS). Écartées pour l'instant : Jooble, Remotive
   (réactivables). Règle : privilégier API/RSS officiels, éviter le scraping direct.
4. **Secrets** : `.env` jamais commité (gitignoré, vérifié). Les secrets locaux
   (clé de chiffrement, mots de passe) sont **générés** dans `.env`, pas inventés.
   Les clés externes restent vides tant que l'utilisateur ne les fournit pas.
5. **Dépôt public** : `github.com/benjsant/n8n_jobs_pipeline`. Donc vigilance
   accrue : rien de sensible dans les fichiers suivis.
6. **`assets/`** prévu pour de futurs **CV + modèles de lettre**, qui seront
   exploités par l'agent DeepSeek (évolution voulue, pas encore implémentée).

## ⏳ En attente de l'utilisateur

- **Infos profil (Tâche 2)** : section 3 du system prompt contient encore des
  champs `[À COMPLÉTER]` (identité, compétences+niveaux, expérience, formation,
  secteurs, valeurs). Ne **rien inventer** — attendre que l'utilisateur les fournisse.
- **Clés externes** (DeepSeek, Adzuna, France Travail, Notion, Discord) à coller
  dans `.env` — voir le tableau dans `reste-a-faire.md`.

## 🚧 État d'avancement

Synthèse vivante dans **`reste-a-faire.md`**. En résumé : squelette + config
faits ; Tâches 1→9 du `TASKS.md` restent à dérouler (la plupart bloquées par une
clé manquante ou par le signal de l'utilisateur). Le seul workflow présent,
`02-agent-candidature.json`, reste à fiabiliser (Tâche 4).

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
- `TASKS.md` — plan de build ordonné.
