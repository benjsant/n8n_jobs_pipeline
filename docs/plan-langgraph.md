# Plan d'évolution job-hunter : extraction de l'agent vers un service LangGraph

> Document autonome préparé le 2026-06-23 pour le repo `benjsant/n8n_jobs_pipeline`. À transporter vers la machine où la conversation Claude dédiée à ce projet est en cours. Le but : briefer le Claude qui pilote ce repo sur la stratégie d'évolution vers LangGraph **après finalisation du MVP n8n actuel**.

---

## 0. Mise à jour 2026-06-25 : état réel + design allégé

> Addendum ajouté après coup. Le plan d'origine (sections 1+) date du 2026-06-23 et
> reste valable dans l'esprit ; cette section corrige ce qui a évolué depuis et
> **dégraisse la Phase 1** à la lumière de ce qui est désormais construit.

### Phase 0 : quasi **verte**
Le MVP n8n tourne de bout en bout **sans dépendance Google** :
- Collecte **France Travail (réparé) + JobSpy** (cron 8h, actif) → scoring déterministe
  + affinage DeepSeek → **alertes Discord actionnables** (anti-spam : seules les
  nouvelles offres).
- Clic « Générer » → `03 → 02` → **CV (design portfolio) + lettre** → `04` = **livraison
  Discord** (CV + lettre en pièces jointes, prêts à envoyer, garde-fou humain).
- Maillon **candidature spontanée** (`05`) opérationnel (manque `LBA_API_KEY` pour de
  vraies entreprises).
- Le critère « une vraie candidature livrée, prête à l'envoi » est **atteint** (via
  Discord plutôt que brouillon Gmail). L'OAuth Google reste optionnel.

→ **Feu vert Phase 1** quand tu veux. Côté MVP, ne reste que de l'optionnel (clés
sources, harmonisation visuelle, OAuth si tu y tiens).

### Le graphe est plus PETIT que prévu (décisions prises depuis)
Plusieurs « nœuds » du plan d'origine sont devenus **déterministes** → moins de LLM :
- **Lettre = corps figé + accroche** (assemblage déterministe `cv/letter-template.mjs`).
  Le nœud `cover_letter_draft` ne produit donc **que l'accroche** (2-3 phrases), pas
  toute la lettre. Le corps n'est jamais touché par le LLM.
- **`cv_personalization`** = sélection **contrainte** (ids/noms exacts de `cv-index.json`),
  pas de la rédaction → quasi déterministe, juste un choix guidé.
- **Enrichissement entreprise** déjà **grounded** (résumé à partir du seul texte fourni).

→ Cœur LLM réel à porter : **`scoring_adequation`** (le vrai raisonnement), **`accroche`**
(ex-`cover_letter`, réduit), **`conseils` / `competences_a_ameliorer`**, et
**`cv_personalization`** (sélection). Soit ~4 nœuds, pas 6.

### Le **vrai** gain à viser : le tool `company_research`
Seule capacité vraiment nouvelle que LangGraph apporte ici : **ancrer l'accroche sur des
infos entreprise réelles** (recherche web légère). Bénéfice double : meilleures accroches
**et** renforcement du garde-fou anti-invention. *(Incident réel : une accroche
« Ponera = ESN » inventée, qu'un nœud de recherche aurait évitée.)* Si tu ne gardes
qu'une idée du plan, c'est **celle-là**.

### `interrupt` / validation humaine : déjà couvert
n8n fait déjà le human-in-the-loop (clic Discord `selected/ignored`). L'`interrupt`
LangGraph est une **vitrine** sympa mais **redondante** fonctionnellement → à garder
pour la démo (Phase 3), pas comme priorité.

### Contrat de sortie à respecter (a changé)
Le service LangGraph doit produire le **même format que le `02` actuel** (§6 du system
prompt), qui a évolué : `lettre: { template, accroche }` (plus `lettre_motivation`),
`personnalisation_cv`, `score` + sous-scores, `conseils`, `competences_a_ameliorer`,
`objet_email`. Le `02` poste ensuite vers le service de rendu (PDF) puis la livraison
Discord (`04`).

### Ordre d'attaque révisé
1. Squelette `services/agent-langgraph/` qui **réplique l'actuel** (~4 nœuds) et se
   branche au `02` (POST), sortie au format §6 ci-dessus.
2. **+1 tool `company_research`** (DuckDuckGo léger) → grounding de l'accroche.
3. **Mesure** : 5 lettres v1 (monolithique) vs v2 (graphe) avant de tagger v0.2.
4. Streaming + interrupt **en dernier**, pour la démo.

---

## 1. Contexte (à lire avant tout)

`job-hunter` est un assistant de recherche d'emploi semi-automatique pour développeur IA junior. Source de vérité PostgreSQL. Orchestration n8n. Agent LLM DeepSeek. Génération CV Astro→PDF + lettre. Validation humaine obligatoire avant envoi.

**État au 2026-06-22 :**

- Squelette docker-compose + .env.example + .gitignore + CLAUDE.md en place
- 4 workflows n8n définis : `01-recherche-offres`, `02-agent-candidature`, `03-statut-offre`, `04-candidature-finalisation`
- Sources d'offres : France Travail, Adzuna, JobSpy, WTTJ, JSearch RapidAPI (LinkedIn/Indeed/Glassdoor)
- Scoring 0-100 piloté par profil + exclusions (filtre dur) + dédup canonicalisée
- Agent candidature = **un seul appel HTTP DeepSeek** dans le workflow 02 avec un system prompt monolithique de 11 KB (`prompts/agent-system-prompt.md`)
- Doc déploiement VPS WireGuard + SSH durci en place
- TASKS.md décrit le plan de build, plusieurs tâches encore non cochées

**Garde-fous non négociables (rappel du CLAUDE.md du repo) :**

- Ne jamais inventer compétence, expérience, certification
- Ne jamais envoyer automatiquement une candidature ou un email
- Validation humaine obligatoire avant chaque envoi
- Ne jamais commiter `.env`

---

## 2. Pourquoi LangGraph ici, pourquoi pas tout de suite

### Pourquoi LangGraph est le bon outil pour ce projet

Le workflow `02-agent-candidature.json` fait actuellement un appel HTTP unique à DeepSeek avec un prompt qui doit tout faire en un seul tour. C'est suffisant pour un MVP, mais ça a 5 limites concrètes qui justifient un refactor en graphe :

| # | Limite n8n + prompt monolithique | Solution LangGraph |
|---|---|---|
| 1 | Si DeepSeek timeout au milieu, on perd tout le travail | Checkpointing natif : reprise au dernier nœud OK |
| 2 | Retry global = relance tout le prompt | Retry granulaire par nœud |
| 3 | Impossible de tester unitairement une sous-tâche (ex: extraction skills) | Chaque nœud = fonction Python testable |
| 4 | Ajouter un outil = éditer le JSON workflow n8n | Tool calling Python natif via `bind_tools()` |
| 5 | Pas de visualisation du flow décisionnel | Graphe Mermaid auto-généré dans le README |

### Pourquoi PAS tout de suite (avant de finir le MVP n8n)

Choix stratégique acté : **finir d'abord le MVP n8n** pour valider la pipeline end-to-end avec une vraie candidature avant de refactorer l'agent. Raisons :

1. Tu prouves que le pipeline marche (TASKS.md complété)
2. Tu peux candidater immédiatement (utilité concrète pendant la recherche d'emploi)
3. Tu disposes d'un baseline pour mesurer ce que LangGraph améliore concrètement (latence, retry, qualité des lettres)
4. Tu évites le piège classique "j'over-engineer avant d'avoir validé la valeur"

### Pourquoi LangGraph et pas LangChain seul

LangChain seul = chaînes linéaires. LangGraph = graphes avec state + interrupts. Le cas d'usage agentique avec validation humaine en cours de flux est exactement ce pour quoi LangGraph existe. Aussi : LangGraph est devenu en 2025-2026 le standard de fait pour les agents production - signal recruteur clair.

---

## 3. Architecture cible

```
n8n (orchestration : trigger, scheduling, Postgres, Discord, Gmail, Drive)
    │
    ├── 01-recherche-offres.json       (inchangé)
    ├── 02-agent-candidature.json      (simplifié : juste POST HTTP)
    │       │
    │       ▼
    │   FastAPI + LangGraph (NOUVEAU service Python, conteneur séparé)
    │   ┌──────────────────────────────────────────────────────────┐
    │   │  IN: { offer_id, profile_id }                            │
    │   │                                                          │
    │   │  ┌─ company_research ─┐                                  │
    │   │  │  (search_web tool)  │                                 │
    │   │  └─────────┬──────────┘                                  │
    │   │            ▼                                             │
    │   │  ┌─ skills_extraction ─┐                                 │
    │   │  │  (parse offer text)  │                                │
    │   │  └─────────┬───────────┘                                 │
    │   │            ▼                                             │
    │   │  ┌─ gap_analysis ─┐                                      │
    │   │  │  (vs profile)   │                                     │
    │   │  └────────┬───────┘                                      │
    │   │           ▼                                              │
    │   │  ┌─ scoring_adequation ─┐                                │
    │   │  │  (rationale + score)  │                               │
    │   │  └─────────┬────────────┘                                │
    │   │            ▼                                             │
    │   │  ┌─ cv_personalization ─┐    ┌─ cover_letter_draft ─┐    │
    │   │  │  (which bullets)      │   │  (tone + structure)   │   │
    │   │  └─────────┬────────────┘    └────────┬─────────────┘   │
    │   │            ▼                          ▼                  │
    │   │  ┌─ tone_validation ─┐                                   │
    │   │  │  (Pydantic + guards) │                                │
    │   │  └─────────┬───────────┘                                 │
    │   │            ▼                                             │
    │   │  ┌─ INTERRUPT: requires_human_review ─┐                  │
    │   │  │  (pause, attendre validation n8n)   │                 │
    │   │  └──────────────────┬─────────────────┘                  │
    │   │                     ▼                                    │
    │   │  OUT: { score, rationale, cv_data, cover_text, status }  │
    │   └──────────────────────────────────────────────────────────┘
    │
    ├── 03-statut-offre.json           (inchangé)
    └── 04-candidature-finalisation    (CV Astro→PDF + Gmail + Drive, inchangé)
```

**Division des responsabilités :**

| Concern | Outil |
|---|---|
| Scheduling, RSS/API polling, Postgres CRUD, Gmail, Drive, Discord | n8n (ce qu'il fait bien) |
| Décisions LLM, état multi-étapes, retry granulaire, tool calling, interrupts | LangGraph service (ce qu'il fait beaucoup mieux que n8n) |

---

## 4. Plan d'exécution en 4 phases

### Phase 0 - Finir le MVP n8n (1-2 semaines, à faire AVANT LangGraph)

**Objectif** : pipeline complète qui tourne sur une vraie candidature.

Critères d'acceptation :
- [ ] Toutes les tâches `[ ]` de `TASKS.md` cochées
- [ ] Une vraie candidature envoyée via le pipeline (offre récupérée → scorée → CV généré → lettre rédigée → brouillon Gmail créé → toi tu envoies)
- [ ] Logs propres dans Postgres pour chaque étape (table `application_runs` ou équivalent)
- [ ] Discord notifications fonctionnelles sur les 2 canaux (`jobs-alerts` + `jobs-log`)
- [ ] `prompts/agent-system-prompt.md` toujours en charge mais documenté comme "version monolithique v1"

### Phase 1 - Service LangGraph minimal viable (2 semaines)

**Objectif** : remplacer l'appel DeepSeek direct du workflow 02 par un POST vers un service LangGraph qui implémente le MÊME comportement, sans nouvelle feature.

Sous-tâches :

- [ ] **1.1** Nouveau dossier `services/agent-langgraph/` avec FastAPI + LangGraph 0.2+
  - Stack : Python 3.12, `uv`, `fastapi`, `langgraph`, `langchain-openai` (pour pointer vers DeepSeek)
  - Endpoint : `POST /agent/run` payload `{ offer_id, profile_id }` → réponse identique au format actuel du workflow 02
- [ ] **1.2** Découper le system prompt monolithique 11 KB en 6 nœuds distincts :
  1. `company_research` (lookup web sur l'entreprise)
  2. `skills_extraction` (parse offer text)
  3. `gap_analysis` (skills vs profile candidate)
  4. `scoring_adequation` (score 0-100 avec rationale)
  5. `cv_personalization` (sélection de bullets du CV maître)
  6. `cover_letter_draft` (lettre en français, ton recadré)
- [ ] **1.3** Définir le `State` Pydantic (offer, profile, intermediate results, errors)
- [ ] **1.4** Implémenter chaque nœud comme une fonction Python pure (input state, output state)
- [ ] **1.5** Ajouter au moins **1 tool** : `search_company_web` (DuckDuckGo Lite via httpx, pas de scraping lourd)
- [ ] **1.6** Persistance des graphes via `MemorySaver` au début (in-process), upgrade vers `PostgresSaver` en Phase 3
- [ ] **1.7** Tests unitaires : chaque nœud testable en isolation avec un state mock
- [ ] **1.8** Modifier `workflows/02-agent-candidature.json` pour appeler `POST http://agent-langgraph:8001/agent/run` au lieu de DeepSeek direct
- [ ] **1.9** Ajouter le service `agent-langgraph` au `docker-compose.yml` (réseau interne n8n)
- [ ] **1.10** Documenter dans `services/agent-langgraph/README.md` : démarrage, env vars, endpoints

Critères d'acceptation :
- Une candidature passe par le service LangGraph et produit le même output que la v1 monolithique
- Tests unitaires verts pour chaque nœud
- `docker compose up` démarre n8n + Postgres + agent-langgraph ensemble
- Logs LangGraph visibles dans le terminal et persistés en Postgres (table `langgraph_runs`)

### Phase 2 - Enrichissement et interrupts (1-2 semaines)

**Objectif** : exploiter les capacités LangGraph qui n'existent pas dans n8n.

Sous-tâches :

- [ ] **2.1** Ajouter `tone_validation` : un nœud qui valide la lettre via Pydantic schema (longueur, présence de garde-fous, absence de mots interdits comme `j'invente`, `passionné par`, etc.)
- [ ] **2.2** Ajouter `interrupt` après `tone_validation` : pause le graphe et expose un endpoint `POST /agent/resume/{run_id}` pour reprendre après validation humaine
- [ ] **2.3** Workflow n8n 02 modifié pour : appeler `/agent/run` (qui s'arrête à l'interrupt), notifier Discord avec un bouton "Approuver / Modifier / Rejeter", puis sur clic appeler `/agent/resume/{run_id}` avec la décision
- [ ] **2.4** Streaming : exposer `/agent/stream/{run_id}` qui renvoie SSE des updates de state (utile pour debug et UI future)
- [ ] **2.5** Retry granulaire : chaque nœud a sa propre policy (3 tentatives avec backoff exponentiel sur les nœuds LLM, 1 seule sur les nœuds purement Python)
- [ ] **2.6** Bascule `MemorySaver` → `PostgresSaver` pour la persistance des graphes (utilise le même Postgres que n8n)

Critères d'acceptation :
- Un graphe peut être interrompu, persisté, repris quelques heures plus tard sans perte de state
- Une lettre rejetée par `tone_validation` est régénérée automatiquement (3 tentatives max) avec un message d'erreur explicite si toutes échouent
- La validation humaine via Discord déclenche bien le `resume` depuis n8n

### Phase 3 - Polish + dévoilement (1 semaine)

**Objectif** : présentable en portfolio.

Sous-tâches :

- [ ] **3.1** README.md du repo enrichi :
  - Diagramme Mermaid de l'architecture cible
  - Diagramme Mermaid du graphe LangGraph auto-généré (via `graph.get_graph().draw_mermaid()`)
  - Section "Why LangGraph" qui justifie le choix par rapport à n8n seul
  - Section "Pre-LangGraph baseline" qui documente la v1 monolithique pour comparaison
- [ ] **3.2** Décisions documentées dans `docs/adr/000X-langgraph-evolution.md` (ADR style)
- [ ] **3.3** Démo vidéo 60-90 secondes : recherche d'offre → notification Discord → validation → lettre générée
- [ ] **3.4** Post LinkedIn : "j'ai bâti l'agent qui m'aide à candidater et voici comment je l'ai évolué de monolithique vers LangGraph"
- [ ] **3.5** Tag `v0.2.0` du repo, public release

Critères d'acceptation :
- README clair, un recruteur comprend le projet en 2 min
- Vidéo postée sur LinkedIn avec narratif honnête
- ADR signé et daté

---

## 5. Décisions techniques à acter avant Phase 1

À soumettre au Claude qui pilote le repo, ou à toi directement :

| Décision | Options | Reco par défaut |
|---|---|---|
| Version LangGraph | 0.2.x (stable) ou 0.3.x (préversion) | 0.2.x |
| Wrapper LLM | `langchain-openai` (pointe vers DeepSeek), `langchain-deepseek`, ou client HTTP nu | `langchain-openai` (compat OpenAI suffit pour DeepSeek) |
| Modèle DeepSeek | `deepseek-chat` ou `deepseek-reasoner` | `deepseek-chat` partout sauf `scoring_adequation` qui pourrait bénéficier de `reasoner` |
| Persistance graphe | `MemorySaver` (in-process) ou `PostgresSaver` | MemorySaver en Phase 1, switch en Phase 2 |
| Container Python | Python 3.12 + uv (cohérent avec InfiniDex) ou Python 3.11 standard | Python 3.12 + uv |
| Tests | pytest + responses (HTTP mock) | pytest + responses |
| Logging | structlog ou logging stdlib | logging stdlib pour démarrer, structlog si besoin |

---

## 6. Risques et mitigations

| Risque | Probabilité | Mitigation |
|---|---|---|
| L'extraction du prompt monolithique en 6 nœuds dégrade la qualité des lettres | Moyenne | Garder la v1 monolithique comme baseline + comparer 5 lettres v1 vs v2 avant de tagger Phase 1 stable |
| LangGraph 0.2.x a des breaking changes en mid-2026 | Moyenne | Pinner précisément la version dans pyproject.toml + tests de non-régression |
| DeepSeek rate limit sur les 6 appels par nœud | Faible | Ajouter caching agressif sur `company_research` (clé = nom entreprise, TTL 24h) + retry exponentiel |
| Le coût DeepSeek explose | Faible | DeepSeek est très peu cher mais ajouter un compteur de tokens par run dans la table `langgraph_runs` |
| L'interrupt Discord se perd (utilisateur ne valide pas) | Élevée | Auto-timeout après 7 jours + email rappel sur les runs en attente |

---

## 7. Ce que ce projet apporte au portfolio Benjamin

Storytelling cible :

> *"J'ai bâti un assistant de recherche d'emploi pendant ma recherche d'emploi de dev IA junior. Démarré comme un pipeline n8n classique avec un agent monolithique DeepSeek (v0.1). Quand j'ai vu que le retry, le checkpointing et la validation humaine étaient durs à gérer côté n8n, j'ai extrait l'agent dans un service Python LangGraph (v0.2). Le résultat : graphe explicite avec 6 nœuds testables, interrupts natifs pour la validation humaine, retry granulaire. n8n reste l'orchestrateur de la pipeline (collecte, Discord, Gmail), LangGraph porte l'intelligence agentique."*

Signaux recruteurs :
- Capacité à **shipper un MVP** (v0.1 n8n) avant de sur-architecturer
- **Refactor justifié** par des limites concrètes mesurées
- **Choix d'outils** : n8n pour l'orchestration, LangGraph pour l'agent (pas n8n partout, pas LangGraph partout)
- **Garde-fous explicites** : tone_validation, jamais inventer, validation humaine obligatoire
- **Méta-utilité** : c'est le système qu'utilise Benjamin pour trouver son job
- **Diversification** : premier projet non-Pokémon majeur du portfolio

---

## 8. Pour le Claude qui pilote ce repo

À toi qui prends ce brief : **ne saute pas la Phase 0**. Le réflexe LLM est de commencer par la partie élégante (LangGraph). C'est exactement ce qu'il faut éviter ici. La valeur portfolio vient de la démarche : MVP → mesure → refactor justifié → polish. Pas de la techno seule.

Ordre strict :
1. Demande à Benjamin où en est `TASKS.md` du repo
2. Termine ce qui reste de la Phase 0
3. Ne touche pas à LangGraph tant que Phase 0 n'est pas verte (une vraie candidature envoyée via le pipeline)
4. Quand Phase 0 est verte, propose à Benjamin de démarrer Phase 1 avec le sous-plan 1.1 → 1.10 de ce document
5. Documente chaque décision technique dans `docs/adr/`

Ressources externes utiles :
- LangGraph docs : https://langchain-ai.github.io/langgraph/
- DeepSeek API : https://api-docs.deepseek.com/
- Le system prompt actuel à découper : `prompts/agent-system-prompt.md` (11 KB)
- Repo : https://github.com/benjsant/n8n_jobs_pipeline

---

## 9. Hors-scope de ce plan

Pour mémoire, ce qui **n'est pas** dans ce plan d'évolution :

- Notion / Airtable comme stockage (la décision PostgreSQL = source de vérité est actée)
- Auto-envoi sans validation humaine (garde-fou non négociable)
- Frontend web custom (pas avant v1.0+)
- Mobile app (focus InfiniDex pour le mobile, pas job-hunter)
- Multi-utilisateur / SaaS (c'est un outil personnel de Benjamin)
- Migration de toute la pipeline n8n vers LangGraph (n8n garde son rôle d'orchestrateur)
