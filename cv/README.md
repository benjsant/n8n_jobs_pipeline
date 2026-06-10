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

## Rendu (reste à faire — Tâche 8)

`template.astro` est prêt à être déposé dans un projet Astro. Il reçoit la
personnalisation via `Astro.props.personalization` (par défaut : CV maître brut).
Restent à câbler en Tâche 8 :

1. Initialiser le projet Astro (`package.json`, `astro.config.mjs`) et exposer
   `template.astro` comme page.
2. Injecter la sortie de l'agent dans `personalization`.
3. Générer le PDF (impression headless, ex. Playwright/Puppeteer, format A4 —
   le CSS `@page size: A4` est déjà en place).
4. Enregistrer le chemin du PDF dans `generated_documents.cv_path`.

## Aperçu rapide (sans projet Astro complet)

Tant que le projet Astro n'est pas initialisé, on peut visualiser la mise en
page en ouvrant le HTML rendu dans un navigateur (les styles sont inline). Le
rendu réel se fera via Astro en Tâche 8.
