# 🔐 OAuth Google (Gmail brouillon + Drive archivage) : guide pas à pas

> Pour le workflow `04` : créer un **brouillon Gmail** (jamais d'envoi auto) avec
> CV + lettre en pièces jointes, et **archiver** les PDF sur Google Drive
> (`Candidatures/<Entreprise>/`). C'est la **dernière pièce** pour une chaîne 100 %.

## 💸 C'est gratuit
Gmail API et Google Drive API sont **gratuites** pour un usage personnel (quotas
très larges). **Pas besoin d'activer la facturation** sur le projet Google Cloud.
Aucun nouveau compte payant : tu utilises **ton compte Google existant**.

## 🧩 Qui fait quoi
- **Toi** (navigateur) : créer le projet Google Cloud + l'OAuth client, et **te
  connecter avec le compte voulu** (le consentement, que Claude ne peut pas faire
  à ta place).
- **Claude** : une fois les 2 credentials « Connected » dans n8n, **relie
  automatiquement les 4 nœuds Google du `04`** et teste un brouillon réel.

## ⚠️ Contrainte
L'API Gmail ne marche **qu'avec un compte Google** (Gmail / Google Workspace).
L'adresse qui portera les brouillons doit donc être une **adresse Gmail**.
Le brouillon est créé dans **le compte avec lequel tu te connectes** à l'étape B.

---

## A. Google Cloud Console : https://console.cloud.google.com

1. **Nouveau projet** : menu en haut → « Nouveau projet » (ex. `job-hunter`) → Créer.
2. **Activer les API** : « APIs & Services » → « Bibliothèque » → active **Gmail API**,
   puis **Google Drive API**.
3. **Écran de consentement OAuth** : « APIs & Services » → « OAuth consent screen » :
   - Type **External** → Create.
   - Nom de l'app, email de support, email développeur → Save and continue.
   - **Scopes** : laisse vide (n8n demande les bons scopes à la connexion) → continue.
   - **Test users** → **ajoute l'adresse Gmail** que tu utiliseras. ⚠️ **Crucial** :
     en mode *Testing*, seuls les test users peuvent se connecter, mais **sans
     validation Google** (parfait pour un usage perso).
4. **Identifiants OAuth** : « Credentials » → « Create Credentials » → **OAuth client ID** :
   - Type d'application : **Web application**.
   - **Authorized redirect URIs** → ajoute **exactement** :
     ```
     http://localhost:8978/rest/oauth2-credential/callback
     ```
     *(Si tu déploies sur VPS/WireGuard, remplace `localhost:8978` par l'URL
     d'éditeur n8n correspondante, celle que n8n affiche dans la credential.)*
   - Create → **copie le `Client ID` et le `Client secret`**.

## B. n8n (http://localhost:8978) : 2 credentials

> Tu peux réutiliser **le même** Client ID/secret pour les deux credentials.

5. **Credentials → New → « Gmail OAuth2 API »** :
   - Colle `Client ID` + `Client Secret`.
   - Vérifie que la « OAuth Redirect URL » affichée correspond à celle autorisée.
   - **« Sign in with Google » → choisis LE compte voulu** → accepte (écran « app
     non vérifiée » → « Continuer »). → doit passer **Connected ✓**.
6. **Credentials → New → « Google Drive OAuth2 API »** : pareil (mêmes id/secret),
   **même compte** → Connect.

## C. Relier au workflow `04` (Claude peut le faire)

7. Les 4 nœuds Google du `04` portent `REMPLACER` : 1 nœud **Gmail** → credential
   Gmail OAuth2 ; 3 nœuds **Google Drive** → credential Drive OAuth2.
8. Dis à Claude « les 2 credentials Google sont Connected » : il relie les nœuds
   automatiquement (comme la credential Postgres) et lance un test (clic
   « Générer » → brouillon Gmail à 2 pièces jointes + PDF archivés sur Drive).

---

## Dépannage
- **« redirect_uri_mismatch »** : l'URI autorisée ne correspond pas exactement à
  celle affichée par n8n. Recopie celle de n8n, à l'identique (slash final compris).
- **« accès bloqué / app non vérifiée »** : normal en mode *Testing*. Clique
  « Paramètres avancés » → « Continuer vers … ». Vérifie que ton adresse est bien
  **test user**.
- **« access_denied »** : tu t'es connecté avec un compte qui n'est pas test user.
- Rappel garde-fou : Gmail crée un **BROUILLON**, jamais d'envoi automatique.
