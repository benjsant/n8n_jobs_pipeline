# 🖥️ Mini-interface web : candidature depuis une URL

Interface graphique légère pour générer un **CV + une lettre** à partir de l'**URL
d'une offre**, à la demande, **sans déployer de serveur**. Tu la lances sur ton PC
quand tu veux candidater, tu la coupes après.

> Elle n'a besoin que de **2 services** (`agent-langgraph` + `render`) : ni n8n, ni
> Postgres, ni collecte automatique. Empreinte ~200 Mo RAM.

## Prérequis (n'importe quel poste)

- **Docker** + **Docker Compose**.
- Le dépôt cloné, et un `.env` rempli au minimum avec :
  - `DEEPSEEK_API_KEY` (l'agent),
  - `DISCORD_WEBHOOK_ALERTS` (livraison des documents ; optionnel, sinon
    téléchargement direct depuis la page).

```bash
git clone https://github.com/benjsant/n8n_jobs_pipeline
cd n8n_jobs_pipeline
cp .env.example .env      # puis remplir DEEPSEEK_API_KEY (+ DISCORD_WEBHOOK_ALERTS)
```

## Lancer

```bash
just ui            # démarre agent + render, attend, affiche l'URL
# ou, sans just :
docker compose up -d agent-langgraph render
```

Puis ouvre **http://localhost:8901**.

Pour couper :

```bash
just ui-stop       # ou : docker compose down
```

## Utiliser

1. **Colle l'URL** d'une offre → « Extraire ». L'app récupère la page et en extrait
   `titre / entreprise / lieu / description`.
2. **Vérifie et corrige** ces champs (mémo éditable), utile si l'extraction est
   incomplète (pages très dynamiques).
3. **Génère** : l'agent produit un CV (ATS, titre adapté à l'offre) et une lettre,
   sans invention et sans signe IA (tirets nettoyés).
4. **Récupère** : téléchargement direct des PDF depuis la page **et** livraison sur
   Discord (2 pièces jointes) si le webhook est configuré. Relecture humaine avant
   tout envoi.

La page affiche aussi l'**état des services** (agent / rendu / Discord) et
l'**historique** des candidatures générées (avec liens de téléchargement).

> **Dossier de candidature** : chaque génération enregistre, à côté du CV et de
> la lettre, un `dossier.json` qui conserve le **lien de l'offre** (comme preuve /
> référence), le **bloc d'infos de l'offre** (missions collées) et le **bloc
> entreprise** (le « Qui sont-ils ? » que tu peux coller à l'étape 2, ou la fiche
> grounded en spontané). Le bouton **Dossier** de l'historique le déplie. Utile
> car les offres disparaissent des jobboards, et pour préparer l'entretien.

> **Pages dynamiques** (Welcome to the Jungle, LinkedIn…) : si « Extraire »
> revient vide, **colle directement** le texte du poste dans le champ description
> (et le « Qui sont-ils ? » dans le champ infos entreprise). L'URL n'a pas besoin
> de fonctionner ; elle est quand même conservée dans le dossier comme référence.

## Trier les offres collectées (postulé / ignoré)

La page liste aussi les **offres collectées en base**, filtrables par statut
(nouvelles / retenues / postulées / ignorées). Deux boutons par offre :

- **Postulé** : marque l'offre `applied` (tu as candidaté, par le système ou à la main).
- **Ignorer** : marque l'offre `ignored`.
- **Réanalyser** : relance le scoring de l'agent sur l'offre et met à jour son
  score en base (utile pour une offre ancienne ou après une évolution du profil).
- **Supprimer** : retire définitivement l'offre de la base (offres périmées).
- **Purge en masse** : en haut de la liste, « supprimer les offres de plus de N
  jours » retire d'un coup toutes les offres trop anciennes (avec confirmation).
  Les candidatures liées ne sont pas perdues (l'offre est déliée, pas la candidature).

Une offre `applied` ou `ignored` ne réapparaît plus dans les **alertes Discord**
du workflow `01` (qui n'alerte que les offres `new`). C'est le moyen d'éviter de
revoir une offre à laquelle tu as déjà répondu.

> **Historique Airtable (optionnel)** : si `AIRTABLE_TOKEN` + `AIRTABLE_BASE_ID`
> sont renseignés dans `.env`, marquer une offre « Postulé » ajoute une ligne dans
> ta base Airtable (Poste, Entreprise, Lieu, Lien, Score, Statut, Date). Postgres
> reste la source de vérité ; Airtable n'est qu'une vue d'historique.

> Cette section a besoin de la **base Postgres**, donc de la stack complète
> (`just up`). En mode léger (`just ui`, sans base), elle affiche simplement un
> message « base non lancée » : le reste de la page (génération CV + lettre)
> fonctionne quand même.

## Mes candidatures (suivi des réponses)

Quand tu marques une offre « Postulé », une **candidature** est créée et apparaît
dans la section « Mes candidatures ». Tu la fais avancer dans le temps :

- **À relancer** : un badge signale les candidatures « Postulé » sans réponse
  depuis plus de 7 jours (compteur en tête de section). Le bouton **Relancée**
  note la relance et retire le badge.
- **Relancée** : note une relance (date du jour).
- **Entretien** / **Accepté** / **Refusé** : change le statut ; la date de réponse
  est enregistrée automatiquement au premier passage.
- **Note** : champ libre (entretien prévu, contact, etc.).
- **Préparer entretien** : génère un dossier de préparation directement sous la
  candidature (résumé entreprise grounded, tes atouts, points à anticiper,
  questions probables avec angles de réponse, questions à poser). Même moteur que
  `/interview/prep`, sans invention.

Les candidatures sont **dénormalisées** (poste, entreprise, lien, score copiés) :
elles **survivent à la suppression de l'offre** périmée, tu gardes ton historique.
Si Airtable est configuré, le statut y est répercuté.

## Statistiques de réponse

La page affiche aussi un tableau de bord des **taux de réponse** sur les
candidatures parties (hors brouillons) : par type (sur offre / spontanée, avec
délai moyen de réponse), par **tranche de score** de l'offre et par **source de
collecte**. Objectif : calibrer le scoring sur des résultats réels (si les
offres 60-79 répondent mieux que les 80-100, le barème mérite un ajustement).
Nécessite la base Postgres (503 explicite sinon).

## Protéger l'accès (réseau local ou VPS)

Par défaut l'interface écoute sur `127.0.0.1` **sans authentification**. Pour
l'ouvrir au réseau (`BIND_HOST`), renseigne d'abord `UI_TOKEN` dans `.env`
(`openssl rand -hex 16`) : toutes les routes (sauf `/health`) exigent alors le
jeton. Première visite : `http://<hôte>:8901/?token=<valeur>` (un cookie prend
le relais ensuite). Les workflows n8n `02`/`06` envoient automatiquement le
jeton en header `X-UI-Token`. Vide = comportement historique sans auth.

## Entreprises à contacter (candidature spontanée)

La page liste aussi les **entreprises à démarcher** (collectées via La Bonne
Alternance, celles pour lesquelles un contact a été récupéré), façon *La Bonne
Boîte* : nom, secteur, site, téléphone, email, lien de contact.

Le bouton **Générer candidature spontanée** lance l'agent en mode spontané
(template `candidature-spontanee`) : il produit un **CV + une lettre spontanée**
et **envoie le tout sur Discord** avec les **infos de contact** de l'entreprise,
prêt à relire puis à envoyer toi-même. Même base Postgres requise.

La candidature spontanée est aussi **enregistrée dans « Mes candidatures »**
(marquée « spontanée ») et **poussée dans Airtable** si configuré, exactement
comme une candidature sur offre. Régénérer pour la même entreprise ne crée pas
de doublon.

**Démarcher une entreprise précise** (hors liste LBA) : en haut de la section, un
champ « Nom (+ site optionnel) » permet de générer une candidature spontanée pour
**n'importe quelle entreprise** que tu saisis (ex. une ESN que tu vises).
L'agent la grounde sur les infos réelles (registre INSEE + web) et le suivi se
crée comme d'habitude.

## Mini-interface vs stack complète

| Besoin | À lancer |
|---|---|
| **Candidature ponctuelle depuis une URL** | `just ui` (agent + render) |
| **Collecte automatique** (offres → alertes Discord, suivi) | `just up` (toute la stack : n8n, Postgres, sources…) |

## Endpoints (pour référence)

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/` | la page (Alpine.js) |
| GET | `/status` | état agent / render / Discord |
| POST | `/offer/extract` `{ url }` | extraction des champs de l'offre |
| POST | `/offer/generate` | génère CV + lettre, livre sur Discord |
| GET | `/history` | candidatures générées (+ présence d'un dossier) |
| GET | `/files/{app_id}/{cv.pdf\|lettre.pdf}` | télécharge un PDF |
| GET | `/dossier/{app_id}` | dossier de la candidature : lien (preuve), bloc offre, bloc entreprise, analyse |
| GET | `/offers` `?status=&limit=` | offres en base + compteurs par statut (503 si base absente) |
| POST | `/offers/status` `{ hash, status }` | bascule le statut (`ignored`, `applied`, `selected`, `reviewed`) |
| POST | `/offers/reanalyze` `{ hash }` | relance le scoring de l'agent et met à jour le score |
| POST | `/offers/delete` `{ hash }` | supprime définitivement une offre |
| POST | `/offers/purge` `{ days?, status? }` | supprime en masse par âge et/ou statut |
| GET | `/applications` | candidatures suivies (statut, dates, notes) |
| POST | `/applications/update` `{ id, status?, notes?, remind? }` | fait avancer une candidature (+ sync Airtable) |
| GET | `/stats` | taux de réponse par type, tranche de score et source (hors brouillons) |
| GET | `/companies` `?limit=` | entreprises à contacter (avec moyen de contact) |
| POST | `/companies/apply` `{ name }` | génère la candidature spontanée et la livre sur Discord |
| POST | `/companies/manual` `{ name, website?, sector? }` | candidature spontanée pour une entreprise saisie à la main |

## Notes

- Les PDF sont aussi dans `./output/app-<entreprise>/` (volume partagé).
- Discord = livraison/notification, **pas archivage** (les liens de pièces jointes
  expirent) : garde les PDF locaux si besoin.
- Aucun déploiement requis : c'est un usage **local à la demande**.
