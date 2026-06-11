# cv/ — CV maître Astro

Le CV est **fixe** (template + CSS). DeepSeek ne produit que des **données de
personnalisation** ; Astro fait le rendu déterministe → PDF. L'agent ne touche
jamais au HTML/CSS et **n'invente rien** : il ne peut que réordonner, mettre en
avant ou masquer ce qui existe déjà dans les fichiers ci-dessous.

## Fichiers (données — source unique et autorisée)

| Fichier | Contenu | Forme d'un élément |
|---|---|---|
| `profile.json` | identité, contact, liens, résumé par défaut | objet unique |
| `skills.json` | compétences par catégorie | `{ "name": "", "level": "" }` |
| `projects.json` | projets | `{ "id", "name", "description", "tech": [], "url" }` |
| `experiences.json` | expériences | `{ "id", "role", "company", "location", "start", "end", "bullets": [] }` |
| `education.json` | formations | `{ "id", "degree", "school", "location", "start", "end", "details" }` |

> Les `id` de `projects.json` / `experiences.json` servent de clés de référence
> pour la mise en avant (voir ci-dessous). Garde-les stables et uniques.

Ces fichiers sont actuellement des **squelettes vides** : à remplir en Tâche 3
(avec les vraies infos de l'utilisateur — ne rien inventer). Ils sont aussi la
source du profil candidat côté system prompt.

## Contrat de sortie de l'agent

Voir `personalization.example.json`. Pour chaque offre, l'agent renvoie :

```json
{
  "summary": "",               // remplace le résumé par défaut (optionnel)
  "highlight_skills": [],      // noms de compétences à mettre en avant / remonter
  "highlight_projects": [],    // ids de projets à remonter en premier
  "highlight_experiences": [], // ids d'expériences à remonter
  "hidden_sections": []        // sections à masquer : summary|skills|experiences|projects|education
}
```

Tous les `id` / noms référencés **doivent exister** dans les fichiers de
données. Le template applique simplement : réordonnancement (éléments mis en
avant en premier), surlignage des compétences, masquage de sections.

## Rendu (en place)

Le projet Astro est initialisé ici même (`package.json`, `astro.config.mjs`,
`src/pages/index.astro`). `index.astro` charge la personnalisation de l'agent
via la variable d'env `CV_PERSONALIZATION` (chemin d'un JSON) et la passe au
template maître ; sans elle, le CV maître brut est rendu.

### Aperçu HTML (dev, sur l'hôte)
```bash
cd cv
npm install
CV_PERSONALIZATION=$PWD/personalization.sample.json npm run build   # -> dist/index.html
npm run preview                                                     # serveur local
```

### Export PDF (conteneurisé — Chromium inclus, rien à installer sur l'hôte)
```bash
cd cv
docker build -t cv-render .
# le JSON de l'agent est monté en /perso.json ; le PDF ressort dans ./dist
docker run --rm \
  -e CV_PERSONALIZATION=/perso.json \
  -v "$PWD/personalization.sample.json:/perso.json:ro" \
  -v "$PWD/dist:/app/dist" \
  cv-render
# -> cv/dist/cv.pdf
```

Format A4 (`@page size: A4` + `page.pdf({format:'A4'})`). Le chemin du PDF est
ensuite enregistré dans `generated_documents.cv_path` (Tâche 8/9).

### Lettre de motivation → PDF
Le **texte** de la lettre est produit par l'agent (champ `lettre_motivation`)
à partir d'un modèle de `assets/letters/`. `cv/letter.mjs` ne fait que la **mise
en page A4** (aucune invention). Données attendues : `candidate`, `company`,
`date`, `subject`, `body` (cf. `letter-data.sample.json`).

```bash
# aperçu HTML (hôte)
node -e "import('./letter.mjs').then(m=>console.log(m.buildLetterHtml(require('./letter-data.sample.json'))))"
# PDF (conteneurisé)
make letter-pdf LETTER=cv/letter-data.sample.json   # -> cv/dist/lettre.pdf
```
Le chemin est enregistré dans `generated_documents.letter_path` et alimente le
`letter_path` du workflow `04`.

> Statut de vérif : le **rendu HTML** est validé (données du profil + réordon-
> nancement / surlignage issus de `personalization.sample.json`). L'**export
> PDF** est conteneurisé mais l'image Playwright (~1,5 Go) n'a pas été buildée
> ici — à lancer dans ton environnement.
