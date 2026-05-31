# TASKS.md — Plan de build pour Claude Code

> Plan d'exécution ordonné. Chaque tâche est autonome, avec un objectif, des
> étapes, et des critères d'acceptation. Fais-les dans l'ordre. Coche `[x]` au
> fur et à mesure. Avant de commencer, lis `CLAUDE.md` et `docs/reference.md`.
>
> Règle d'or : après chaque tâche, vérifie les critères d'acceptation avant de
> passer à la suivante. Ne committe jamais `.env`.

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

## ⬜ Tâche 2 — Configurer le profil candidat dans le system prompt

**Objectif** : remplir la section 3 de `prompts/agent-system-prompt.md`.

**Étapes**
- [ ] Demander à l'utilisateur ses vraies infos (compétences, expérience,
      préférences) OU lui rappeler de remplir la section 3 lui-même.
- [ ] Ne RIEN inventer. Si une info manque, laisser un placeholder explicite.

**Critères d'acceptation**
- La section 3 ne contient plus de `[crochets]` non remplis (ou ils sont
  marqués « à compléter par l'utilisateur »).

---

## ⬜ Tâche 3 — Tester l'agent DeepSeek seul

**Objectif** : valider que l'appel DeepSeek + system prompt produit un JSON conforme.

**Étapes**
- [ ] Vérifier que `DEEPSEEK_API_KEY` est rempli dans `.env`.
- [ ] Écrire un petit script de test `scripts/test_deepseek.py` (ou commande
      curl) qui envoie le system prompt + une offre fictive et affiche la sortie.
      Détails API dans `docs/reference.md`.
- [ ] Vérifier que la réponse est un JSON valide respectant le schéma de la
      section 6 du system prompt.

**Critères d'acceptation**
- La sortie parse en JSON sans erreur et contient les clés `score`,
  `recommandation`, `lettre_motivation`, etc.

---

## ⬜ Tâche 4 — Importer et fiabiliser le workflow agent (02)

**Objectif** : `workflows/02-agent-candidature.json` fonctionne dans n8n.

**Étapes**
- [ ] Importer le workflow dans n8n.
- [ ] Tester via le formulaire avec une offre réelle copiée-collée.
- [ ] Corriger les expressions n8n si la version installée diffère (les nœuds
      `readWriteFile` / `httpRequest` peuvent avoir des champs légèrement
      différents selon la version).
- [ ] Vérifier que le nœud « Parser sortie agent » renvoie bien l'objet JSON.

**Critères d'acceptation**
- Soumettre le formulaire produit une lettre de motivation + un score.
- Réexporter le workflow corrigé dans `workflows/02-agent-candidature.json`.

---

## ⬜ Tâche 5 — Créer les bases Notion + workflow de suivi (03)

**Objectif** : stocker offres et candidatures dans Notion.

**Étapes**
- [ ] Guider l'utilisateur pour créer l'intégration Notion et 2 bases
      (« Offres », « Entreprises ») selon le schéma de `docs/reference.md`.
- [ ] Récupérer les IDs de bases et les mettre dans `.env`.
- [ ] Créer `workflows/03-sync-notion.json` : prend la sortie de l'agent et
      crée/met à jour une page dans la base « Offres » (titre, entreprise, lien,
      score, statut, lettre, date).

**Critères d'acceptation**
- Une exécution crée une page Notion correctement remplie.
- Pas de doublon si la même offre repasse (utiliser un identifiant unique).

---

## ⬜ Tâche 6 — Workflow de recherche d'offres (01)

**Objectif** : récupérer automatiquement les offres par mots-clés.

**Étapes**
- [ ] Créer `workflows/01-recherche-offres.json`.
- [ ] Source principale : API France Travail (OAuth2 client credentials +
      endpoint search). Détails complets dans `docs/reference.md`.
- [ ] Déclencheur : Schedule (ex. tous les jours à 8h).
- [ ] Mots-clés et filtres paramétrables en tête de workflow (Set node).
- [ ] Déduplication contre les offres déjà en base Notion.
- [ ] Pour chaque nouvelle offre pertinente → notification Telegram.
- [ ] (Optionnel) Ajouter JobSpy comme 2e source via un petit service Python
      ou un nœud Execute Command (voir reference.md).

**Critères d'acceptation**
- Une exécution manuelle récupère des offres réelles correspondant aux mots-clés.
- Les doublons sont filtrés.
- Une notification Telegram arrive pour une nouvelle offre.

---

## ⬜ Tâche 7 — Chaîner le tout (orchestration)

**Objectif** : pipeline complet recherche → suivi → candidature.

**Étapes**
- [ ] Relier 01 (recherche) → 03 (Notion) automatiquement.
- [ ] Déclencher 02 (agent) quand le statut d'une offre passe à « À postuler »
      dans Notion (Notion Trigger).
- [ ] La sortie de l'agent (lettre, score) remonte dans la page Notion de l'offre.

**Critères d'acceptation**
- Changer un statut dans Notion déclenche la génération de la candidature.
- La lettre apparaît dans la page Notion correspondante.

---

## ⬜ Tâche 8 — Génération PDF + envoi (optionnel, garde-fou humain)

**Objectif** : produire la lettre en PDF et préparer l'email (sans envoi auto).

**Étapes**
- [ ] Convertir la lettre en PDF (nœud HTML→PDF ou service).
- [ ] Préparer un brouillon d'email Gmail avec CV + lettre en pièces jointes.
- [ ] IMPORTANT : ne PAS envoyer automatiquement. Créer un brouillon ou exiger
      une validation manuelle (étape d'approbation).

**Critères d'acceptation**
- Un PDF propre est généré.
- L'email reste en brouillon / attente de validation, jamais envoyé sans
  action humaine.

---

## ⬜ Tâche 9 — Documentation finale

**Étapes**
- [ ] Mettre à jour le README avec les workflows réellement créés.
- [ ] Documenter dans `docs/` toute déviation par rapport au plan.
- [ ] Vérifier une dernière fois qu'aucun secret n'est commité.

---

## Principes à respecter pendant tout le build

- **KISS** : préférer une solution simple et lisible à une usine à gaz.
- **Secrets** : toujours via `.env`, jamais en dur.
- **Sources** : privilégier API/RSS officiels. Le scraping direct de LinkedIn
  est fragile et juridiquement gris — éviter.
- **Garde-fou humain** : aucune candidature n'est envoyée sans validation.
- **Versionner** : chaque workflow validé est réexporté en JSON dans `workflows/`.
- **Demander avant d'inventer** : si une info perso manque, demander à
  l'utilisateur plutôt que d'inventer.
