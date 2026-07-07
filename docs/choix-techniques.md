# Choix technologiques

Pourquoi chaque brique a été retenue, et ce qui a été écarté. Le fil directeur :
un outil **personnel**, **local à la demande**, **honnête** (aucune invention) et
**pas cher**, où PostgreSQL reste la seule source de vérité.

## Vue d'ensemble

| Couche | Techno | En un mot |
|---|---|---|
| Conteneurisation | Docker + Compose | tout reproductible, rien à installer sur l'hôte |
| Orchestration | n8n | cron, webhooks, connecteurs, auto-hébergé |
| Source de vérité | PostgreSQL (+ pgvector) | relationnel robuste, sert aussi n8n et la dédup vectorielle |
| Intelligence | LangGraph + FastAPI | agent en graphe, testable, séparé de l'orchestration |
| LLM | DeepSeek | compatible OpenAI, très bon marché |
| Embeddings | fastembed | vecteurs locaux, sans coût API |
| Rendu CV/lettre | Astro + Playwright | gabarit HTML/CSS fixe vers PDF fidèle |
| Mini-interface | Alpine.js | une page, sans build |
| Dashboards | Metabase (opt-in) | exploration visuelle de la base |
| Historique | Airtable (option) | vue tableur, jamais la source de vérité |
| Notifications | Discord (webhooks) | gratuit, livraison de fichiers |
| Documentation | MkDocs Material | Markdown vers site statique |
| Automatisation | just + GitHub Actions | commandes courtes, CI et Pages |

## Infrastructure

### Docker + Docker Compose
Tout le système tourne en conteneurs : Postgres, n8n, les micro-services et le
rendu. Avantage : on clone le dépôt, on remplit un `.env`, on lance, et
l'environnement est identique partout, sans polluer la machine. Compose décrit la
stack en un fichier et gère le réseau interne entre services. Le profil `metabase`
laisse un service lourd optionnel hors du démarrage par défaut.

### just
Un simple lanceur de commandes (`just ui`, `just up`, `just airtable-setup`…).
Plus lisible qu'un `Makefile` pour des recettes shell, et il charge le `.env`
automatiquement. Alternative écartée : des scripts éparpillés, moins découvrables.

## Orchestration : n8n

n8n déclenche la collecte (cron quotidien), appelle les sources, écrit dans
Postgres, poste sur Discord et expose les webhooks d'action (« Générer »,
« Ignorer »). C'est du low-code auto-hébergé : on garde la main sur les données,
sans abonnement SaaS. Il gère nativement le planning, les credentials chiffrées et
les appels HTTP.

Pourquoi ne pas tout coder en Python ? Parce que n8n fait très bien la
**plomberie** (planification, retries de requêtes, connecteurs Gmail/Drive) et se
modifie visuellement. En revanche il est mauvais pour une logique décisionnelle à
plusieurs étapes : cette partie a justement été sortie vers LangGraph (voir plus
bas).

## Source de vérité : PostgreSQL (+ pgvector)

PostgreSQL stocke les offres, entreprises, candidatures et documents. Choix d'un
**relationnel** parce que les données sont structurées et liées (une candidature
référence une offre et une entreprise), et qu'on veut des contraintes fortes
(statuts validés, unicité par hash). Bonus : le **même** Postgres sert la
persistance interne de n8n, donc un seul moteur de base à opérer.

**pgvector** ajoute la recherche vectorielle directement dans Postgres pour la
déduplication **sémantique** (repérer deux annonces quasi identiques entre
sources). Intérêt : pas de base vectorielle séparée (Pinecone, Qdrant, Weaviate) à
héberger et synchroniser ; le vecteur vit à côté de l'offre.

Pourquoi pas Notion ou Airtable comme base principale ? Ce sont des outils de
consultation, pas des bases transactionnelles : pas de contraintes fortes, API
limitée, dépendance à un service tiers. Ils restent au mieux une **vue** (voir
Airtable plus bas).

## Intelligence : LangGraph + FastAPI

L'agent (scoring, accroche, personnalisation CV, prépa entretien) est un
micro-service Python séparé, construit avec **LangGraph** (graphe d'états) exposé
via **FastAPI**.

Pourquoi un graphe plutôt qu'un gros prompt unique ?

- chaque étape (analyse, recherche entreprise, accroche, jugement, validation) est
  un **nœud testable** en isolation ;
- on peut **régénérer** seulement l'étape qui échoue (l'accroche est auto-évaluée
  puis recommencée si elle contient des clichés ou des signes IA) ;
- le flux décisionnel est explicite et documenté, pas noyé dans un prompt.

Pourquoi FastAPI ? Léger, typé (Pydantic valide les entrées/sorties), asynchrone,
idéal pour un service HTTP interne. Il sert aussi la **mini-interface**.

Pourquoi pas LangChain seul ? LangChain enchaîne des étapes linéaires ; LangGraph
gère un **graphe** avec état, boucles de reprise et validation, ce qui correspond
exactement à un agent avec relecture.

## LLM : DeepSeek

DeepSeek expose une API **compatible OpenAI** (on réutilise les clients
existants), pour un coût très inférieur aux modèles américains, avec une qualité
correcte en français. Comme l'agent peut faire plusieurs appels par candidature,
le prix compte : ici le coût mensuel reste de l'ordre de quelques centimes.

Garde-fou : le LLM **ne produit que des données** (choix de sections, reformulation
du résumé, accroche courte). Il ne touche jamais au HTML/CSS du CV ni au corps de
la lettre, et n'invente aucun fait (compétence, expérience, entreprise).

## Embeddings : fastembed

Pour la dédup sémantique, les vecteurs sont calculés **localement** par un
micro-service `fastembed` (modèle MiniLM multilingue, 384 dimensions). Aucun appel
d'API payant, aucune donnée envoyée à un tiers, et c'est assez rapide sur CPU. Le
vecteur est ensuite stocké dans Postgres via pgvector.

## Rendu du CV et de la lettre : Astro + Playwright

Le CV maître est un gabarit **Astro** (HTML/CSS fixe). L'agent fournit seulement
des **données** ; Astro produit la page, puis **Playwright** (Chromium) l'imprime
en PDF fidèle au rendu navigateur.

Pourquoi cette séparation ? Pour garantir un rendu **stable et maîtrisé** : le LLM
ne peut pas casser la mise en page puisqu'il ne génère pas le document. Deux styles
sont fournis (ATS sobre par défaut, ou design). Alternatives écartées : générer un
PDF côté LLM (rendu imprévisible) ou LaTeX (surdimensionné, moins web).

## Mini-interface : Alpine.js

L'interface (une seule page servie par l'agent) utilise **Alpine.js** : de la
réactivité déclarative directement dans le HTML, **sans étape de build** ni bundler.
Pour un tableau de bord personnel de quelques écrans (générer, trier, suivre), un
framework lourd (React, Vue) et sa chaîne d'outils seraient disproportionnés.

## Dashboards : Metabase (optionnel)

**Metabase** offre des tableaux de bord visuels sur la base (offres par source,
taux de réponse, etc.). Il est **opt-in** (profil Compose séparé, `just metabase`)
car il est lourd : on ne le lance qu'au besoin. Ses données applicatives vivent
dans une base Postgres dédiée, la base métier restant sa source de données.

## Historique : Airtable (optionnel)

Quand on marque une candidature « Postulé », une ligne est **miroir** dans Airtable
(tableur en ligne, consultable sur mobile, partageable). C'est **uniquement une
vue** : Postgres reste la source de vérité. Airtable a été préféré à Notion parce
que c'est un vrai tableur/base avec une API REST propre et structurée, mieux adapté
à un suivi ligne par ligne. Authentification par **Personal Access Token** (les
anciennes API keys ont été supprimées par Airtable en 2024), avec les portées
minimales.

## Sources d'offres : API officielles d'abord

Priorité aux **API et flux officiels**, plus fiables et juridiquement sains que le
scraping :

- **France Travail**, **Adzuna**, **SerpApi (Google Jobs)**, **JSearch** (RapidAPI),
  **La Bonne Alternance** (alternance + entreprises à contacter) : des API ;
- **Welcome to the Jungle** : flux **RSS** ;
- **JobSpy** : micro-service qui agrège LinkedIn/Indeed, utilisé en complément là
  où il n'y a pas d'API. Le scraping direct de sites (LinkedIn) est fragile et gris,
  donc évité au maximum.

Chaque source manquante renvoie zéro offre sans bloquer le reste : on branche ce
qu'on a.

## Notifications et livraison : Discord

Un **webhook Discord** est gratuit, immédiat, et accepte des **pièces jointes** :
on l'utilise pour les alertes d'offres **et** pour livrer le CV + la lettre en PDF,
prêts à relire. Deux canaux : alertes actionnables et logs techniques. Limite
connue : les liens de pièces jointes expirent, donc Discord sert de
notification/livraison, pas d'archivage (les PDF restent en local, l'archivage
durable passe par Drive).

## Email et archivage : Google (Gmail + Drive)

Pour la finalisation, n8n peut créer un **brouillon Gmail** (jamais d'envoi
automatique, garde-fou) et archiver les documents sur **Google Drive**.
L'authentification passe par les **credentials OAuth** du nœud Google dans n8n, pas
par une clé en clair. C'est optionnel : la livraison Discord suffit à l'usage
courant.

## Documentation et automatisation

- **MkDocs Material** : la doc est écrite en Markdown et publiée en site statique
  sur **GitHub Pages**. Léger, versionné avec le code, joli par défaut.
- **GitHub Actions** : CI (tests, garde-fou de parité des nœuds) à chaque push, et
  déploiement du site docs. Gratuit sur un dépôt public.

## Ce que le projet refuse volontairement

- **Aucune invention** : le LLM ne produit que des données à partir du profil réel.
- **Aucun envoi automatique** : relecture humaine obligatoire avant toute
  candidature.
- **Pas de stockage principal hors Postgres** : Notion/Airtable ne sont que des
  vues.
- **Pas de scraping fragile** quand une API officielle existe.
