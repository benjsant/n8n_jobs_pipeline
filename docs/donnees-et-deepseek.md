# 📦 Données, modèle DeepSeek & génération CV/lettre : décisions

> Fiche de reprise (autre machine / autre session Claude). Répond à : « quelles
> données fournir ? quel modèle DeepSeek ? PDF/docx ou pas ? lettre en Astro ou
> page portfolio ? ». Mise à jour : 2026-06-22.

---

## 1. Principe central : entrée = texte/JSON, sortie = PDF

**DeepSeek ne lit jamais un PDF ni un docx.** Il consomme uniquement du
**texte / JSON** :

- le **system prompt** : `prompts/agent-system-prompt.md` ;
- les **données structurées du CV** : `cv/*.json` (déjà synchronisées depuis le
  portfolio, voir §4) ;
- l'**offre** (collectée par le `01`) + l'**index CV** : `cv/cv-index.json`.

Le **PDF est la sortie** : Astro génère le CV (`cv/template.astro`) et `cv/letter.mjs`
met en page la lettre, le tout en PDF via le service `render`. Le candidat ne
fournit donc **aucun document binaire** au pipeline.

## 2. Ce que l'utilisateur n'a PAS à fournir

- ❌ **Pas de CV ATS en PDF** comme *donnée* : la donnée structurée du portfolio
  (`cv.ts` → `cv/*.json`) est meilleure et suffit. Un PDF ATS ne servirait que
  de **référence visuelle** si on veut rendre le template Astro plus ATS-friendly
  (mise en page une colonne, vrai texte, pas d'images de texte). **Optionnel.**
- ❌ **Aucun fichier à préparer pour DeepSeek** : tout ce dont il a besoin est
  déjà dans le repo (prompt + JSON).

## 3. Ce qui EST utile à fournir

- ✅ **Le texte de 1-2 lettres de motivation** que l'utilisateur aime (peu importe
  docx/txt, seul le **texte** compte). Usage : **référence de style/structure**
  pour enrichir les modèles `assets/letters/*.md` (`ia-junior`, `backend`,
  `frontend`, `alternance`, `candidature-spontanee`) et la **section 5** du
  system prompt. ⚠️ Garde-fou : ça guide le **ton**, jamais les faits, l'agent
  rédige toujours à partir du vrai profil + de l'offre, sans rien inventer.
- ✅ (Optionnel) une **maquette/PDF ATS** uniquement comme *référence de mise en
  page* si on veut ajuster le template Astro.

## 4. CV : le portfolio est déjà la source (rien à refaire)

Le CV vient de `github.com/benjsant/astro-portfolio` (`src/data/cv.ts`),
synchronisé par `just cv-sync` → `cv/*.json` + `cv-index.json`. Donc le portfolio
**est déjà branché**. Pas besoin d'une page dédiée côté portfolio pour le CV.

## 5. Lettre : approche dynamique (pas une page portfolio)

- **Décision** : la lettre est rédigée **par l'agent, par offre** (champ
  `lettre_motivation` du §6), puis mise en page par `cv/letter.mjs` → PDF.
- **Pourquoi pas une « page cachée du portfolio »** : une page statique est figée,
  alors que la lettre doit être **différente pour chaque offre**. L'approche
  template + texte d'agent couvre ce besoin et reste autonome.
- Les modèles `assets/letters/*.md` donnent le squelette/ton ; l'agent choisit le
  plus adapté à l'offre.

## 6. Modèle DeepSeek : `deepseek-chat`

- **Choix par défaut du projet** : `deepseek-chat` (réglé dans `.env` /
  `docker-compose.yml` via `DEEPSEEK_MODEL`). Généraliste, **rapide, peu cher**,
  excellent en suivi d'instructions + sortie `json_object` → idéal pour le
  **scoring batch quotidien + rédaction des lettres**.
- `deepseek-reasoner` : raisonnement profond, **plus lent et plus cher**, inutile
  ici (et moins pratique pour le JSON strict). À réserver si la qualité du
  scoring déçoit.
- Variantes type « flash » / nœud DeepSeek **natif** de n8n
  (`@n8n/n8n-nodes-langchain.lmChatDeepSeek`) : alternatives possibles ; chez nous
  on appelle l'API en **HTTP brut** (plus portable). Changer de modèle = **une
  ligne** : `DEEPSEEK_MODEL=...` dans `.env`.
- Accès : API compatible OpenAI, base `https://api.deepseek.com`, clé
  `DEEPSEEK_API_KEY` (à créer sur platform.deepseek.com).

## 7. En attente de l'utilisateur (pour avancer sur ce volet)

- [x] **Lettres de référence fournies** : 6 vraies lettres du candidat
  (`astro-portfolio/lettres-motivation/*.docx`, offre/spontanée × emploi/alternance
  + CAF, Proxiad). Voix distillée encodée dans la **§5 du system prompt** (ton +
  bloc 3 projets + reconversion RNCP + clôture). Non committées (dépôt public).
  Reste optionnel : aligner aussi chaque `assets/letters/*.md` + trancher 2 faits
  (résidence « Marly (59) » ? email `…portfolio@gmail.com` vs `…@gmail.com` ?).
- [ ] (Optionnel) feu vert pour **générer un CV + lettre de démo en PDF** et
  juger la présentation / l'aspect ATS, puis ajuster le template Astro.
- [ ] `DEEPSEEK_API_KEY` (+ une source : `RAPIDAPI_KEY` ou Adzuna) pour un test réel.

---

> Voir aussi : `docs/contexte-claude.md` (mémoire portable), `cv/README.md`
> (données + rendu), `prompts/agent-system-prompt.md` (§5 lettre, §6 sortie).
