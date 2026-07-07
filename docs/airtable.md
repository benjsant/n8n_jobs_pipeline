# Historique Airtable (suivi des candidatures)

Intégration **optionnelle**. Quand tu marques une offre « Postulé » dans la
mini-interface, une ligne est ajoutée dans une base Airtable, et son statut y est
répercuté quand tu fais avancer la candidature (Entretien, Refusé, Accepté).

> PostgreSQL reste la **source de vérité**. Airtable n'est qu'une vue d'historique
> pratique (consultable sur mobile, partageable). Rien ne casse si Airtable est
> absent : la fonctionnalité est simplement inactive tant que les clés sont vides.

## Ce dont tu as besoin

| Élément | Où | Variable `.env` |
|---|---|---|
| Jeton d'accès personnel | airtable.com/create/tokens | `AIRTABLE_TOKEN` |
| Identifiant de base | URL de la base (commence par `app…`) | `AIRTABLE_BASE_ID` |
| Table (nom) | ta base Airtable | `AIRTABLE_TABLE` (défaut `Candidatures`) |

## 1. Créer le jeton d'accès

1. Va sur **https://airtable.com/create/tokens** puis « Create new token ».
2. **Scopes** :
   - `data.records:write` (obligatoire, l'app écrit les lignes) ;
   - `schema.bases:read` + `schema.bases:write` (seulement si tu veux créer la
     table automatiquement avec `just airtable-setup`, voir l'étape 3).
3. **Access** : ajoute la **base** qui contiendra le suivi.
4. Crée le jeton, copie-le (il commence par `pat…`). C'est `AIRTABLE_TOKEN`.

> Le jeton n'est affiché qu'une fois. Garde-le hors de Git (il va dans `.env`).

## 2. Récupérer l'identifiant de base

Ouvre ta base dans le navigateur. L'URL ressemble à
`https://airtable.com/appXXXXXXXXXXXXXX/...`. La partie qui commence par
`app…` est ton `AIRTABLE_BASE_ID`.

## 3. Créer la table et ses colonnes

Deux options.

### Option A : automatique (recommandé)

Renseigne d'abord `.env` (étape 4), puis lance :

```bash
just airtable-setup
```

Le script crée la table et toutes les colonnes au bon type (idempotent : s'il
manque juste une colonne, il l'ajoute). Nécessite les scopes
`schema.bases:read` + `schema.bases:write` sur le jeton.

### Option B : manuelle

Crée une table nommée **`Candidatures`** (ou un autre nom, à reporter dans
`AIRTABLE_TABLE`) avec **exactement** ces colonnes :

| Colonne | Type Airtable | Rempli avec |
|---|---|---|
| `Poste` | Single line text | intitulé de l'offre |
| `Entreprise` | Single line text | nom de l'entreprise |
| `Lieu` | Single line text | localisation |
| `Lien` | URL | lien vers l'offre |
| `Score` | Number (integer) | score de l'offre |
| `Statut` | Single line text (ou Single select) | Postulé / Entretien / Refusé / Accepté |
| `Date` | Date | date de la candidature |

> Les **noms de colonnes doivent correspondre**. Le service envoie l'option
> `typecast`, donc Airtable convertit tout seul les chaînes en nombre/date et crée
> les options d'un champ « Single select » au besoin.

## 4. Renseigner `.env` et redémarrer

```bash
AIRTABLE_TOKEN=pat_ton_jeton
AIRTABLE_BASE_ID=appTonIdDeBase
AIRTABLE_TABLE=Candidatures
```

Puis reconstruis le service qui parle à Airtable :

```bash
docker compose up -d --build agent-langgraph
```

## Comment ça marche

- Tu marques une offre **« Postulé »** dans la page « Offres » : une ligne est
  créée dans Airtable, et l'id de cette ligne est mémorisé côté base.
- Tu fais avancer la candidature dans **« Mes candidatures »** (Entretien, Refusé,
  Accepté) : la colonne `Statut` de la même ligne est mise à jour.
- Statuts renvoyés : `Postulé`, `Entretien`, `Refusé`, `Accepté`, `Brouillon`.

## Vérifier

1. Dans la mini-interface, marque une offre « Postulé ».
2. Une ligne apparaît dans ta table Airtable (Poste, Entreprise, Date…).
3. Passe la candidature en « Entretien » : la colonne `Statut` de la ligne suit.

## Dépannage

| Symptôme | Piste |
|---|---|
| Aucune ligne créée | `AIRTABLE_TOKEN` **et** `AIRTABLE_BASE_ID` renseignés ? service rebuild ? |
| `403` / rien ne se passe | le jeton a-t-il le scope `data.records:write` **et** accès à cette base ? |
| `422` (champ inconnu) | un nom de colonne ne correspond pas (respecte la casse) |
| Statut non mis à jour | la ligne doit exister (créée au « Postulé ») pour être suivie |

> L'écriture Airtable est **best-effort** : une erreur côté Airtable n'interrompt
> jamais l'usage de l'interface (Postgres reste la référence).
