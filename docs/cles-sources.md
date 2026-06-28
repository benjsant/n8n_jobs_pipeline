# 🔑 Clés des sources d'offres — où les créer, comment les coller

> Toutes les clés vont dans le fichier **`.env`** (jamais commité). Après les
> avoir collées, relance n8n : `docker compose up -d n8n`. Tu peux n'en faire
> qu'une partie : chaque source manquante renvoie 0 offre **sans bloquer** le run.

## Vue d'ensemble

| Source | Compte / site | Coût | Variables `.env` |
|---|---|---|---|
| **DeepSeek** (agent) | platform.deepseek.com | payant (petit crédit) | `DEEPSEEK_API_KEY` ✅ déjà |
| **France Travail** | francetravail.io | **gratuit** | `FRANCE_TRAVAIL_CLIENT_ID` / `_SECRET` |
| **Adzuna** | developer.adzuna.com | **gratuit** | `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` |
| **JSearch** (LinkedIn/Indeed…) | rapidapi.com | gratuit (offre free) | `RAPIDAPI_KEY` |
| **Google Jobs** | serpapi.com | gratuit (quota limité) | `SERPAPI_KEY` |
| **La Bonne Alternance** | api.apprentissage.beta.gouv.fr | **gratuit** | `LBA_API_KEY` |
| **Welcome to the Jungle** | (pas de compte) | gratuit | `WTTJ_RSS_URL` |
| **JobSpy** | — | gratuit | aucune clé (conteneur) |
| **Discord** (notifs) | ton serveur Discord | gratuit | `DISCORD_WEBHOOK_ALERTS` ✅ déjà |

> Le minimum pour des offres : **une seule** source suffit (JobSpy marche déjà
> sans clé). France Travail + Adzuna donnent la meilleure couverture FR gratuite.

---

## 1. France Travail (gratuit, officiel) — + dépannage `invalid_client`

1. Va sur **https://francetravail.io** → connecte-toi → **« Mes applications »**.
2. **Crée une application** (ou ouvre l'existante).
3. **⚠️ Étape clé : abonne l'application à l'API** « **Offres d'emploi v2** »
   (dans l'app → « Ajouter une API » / liste des API → coche *Offres d'emploi v2*).
   Sans cet abonnement, les clés existent mais sont **refusées** (`invalid_client`).
4. Récupère le **`client_id`** et le **`client_secret`** de l'application.
5. Colle-les dans `.env` :
   ```
   FRANCE_TRAVAIL_CLIENT_ID=...
   FRANCE_TRAVAIL_CLIENT_SECRET=...
   ```
6. `docker compose up -d n8n`, puis demande à Claude de **re-tester le token**.

### 🩺 Si tu as déjà `invalid_client` (notre cas)
Les clés sont bien formées mais **pas reconnues** par le serveur FT. Causes
classiques, dans l'ordre à vérifier :
- l'application **n'est pas abonnée** à *Offres d'emploi v2* → ajoute l'API ;
- le `client_secret` a été **régénéré** depuis → recopie le bon (ou régénère-le) ;
- tu as **inversé** id et secret, ou copié un espace en trop ;
- l'application est encore en **création/validation** → attends qu'elle soit active.
Après correction, mets à jour `.env` et relance le test.

---

## 2. Adzuna (gratuit)

1. **https://developer.adzuna.com** → crée un compte → « Sign up » pour une app.
2. Récupère **`Application ID`** et **`Application Key`**.
3. `.env` :
   ```
   ADZUNA_APP_ID=...
   ADZUNA_APP_KEY=...
   ```

## 3. JSearch via RapidAPI (gratuit, agrège LinkedIn/Indeed/Glassdoor)

1. **https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch** → crée un compte RapidAPI.
2. **Subscribe** au plan **Basic (free)** de l'API JSearch.
3. Copie ta clé **`X-RapidAPI-Key`** (onglet « Endpoints » → header d'exemple).
4. `.env` : `RAPIDAPI_KEY=...`

## 4. Google Jobs via SerpApi (gratuit, quota limité)

1. **https://serpapi.com** → crée un compte → tableau de bord → **API Key**.
2. `.env` : `SERPAPI_KEY=...`
   > Quota gratuit modeste (~100 recherches/mois) : à réserver si tu veux Google Jobs.

## 5. La Bonne Alternance (gratuit) — alternance + entreprises à contacter

1. **https://api.apprentissage.beta.gouv.fr** → « Espace développeurs » → demande
   une **clé API**.
2. `.env` : `LBA_API_KEY=...`
   > Débloque le maillon **candidature spontanée** (`05`) avec de vraies entreprises
   > + des offres d'alternance. ✅ Auth `Bearer` + forme de réponse **vérifiées** le
   > 2026-06-28 (cf. `reference.md §3d`).

## 6. Welcome to the Jungle (RSS, pas de compte)

1. Fais une recherche sur **welcometothejungle.com** avec tes filtres.
2. Récupère l'**URL du flux RSS** correspondant (si proposé).
3. `.env` : `WTTJ_RSS_URL=...`
   > ⚠️ La dispo des flux RSS WTTJ peut varier. Optionnel.

---

## Après avoir collé des clés
```bash
docker compose up -d n8n           # recharge les variables
# puis, run manuel du 01 (ou attends le cron 8h) — demande à Claude de le déclencher
```
Le `01` repassera sur toutes les sources : celles avec clé répondront, les autres
resteront vides sans bloquer. Plus tu en ajoutes, plus la couverture est large.
