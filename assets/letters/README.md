# assets/letters/ — modèles de lettres de motivation

Modèles **quasi-complets et typés** : le **corps est figé** (texte validé par le
candidat). L'agent ne fait que **choisir le bon modèle** et rédiger l'**accroche**
(2-3 phrases : « pourquoi cette entreprise ») — cf. `prompts/agent-system-prompt.md`
§5 et §6 (`lettre: { template, accroche }`).

L'assemblage est **déterministe**, fait par le service de rendu
(`cv/letter-template.mjs`) : il colle l'accroche dans le corps figé et résout les
`{{placeholders}}`. **Le LLM ne touche jamais au corps** → garanti verbatim, aucune
invention. (L'expéditeur, l'objet et la signature sont mis en page par
`cv/letter.mjs` depuis `cv/profile.json`.)

## Choisir le bon modèle

| Modèle | Quand |
|---|---|
| `ia-junior.md` | poste IA / ML / data / LLM, positionnement junior |
| `backend.md` | poste back-end (API, services, BDD, archi) |
| `frontend.md` | poste front-end (UI, frameworks JS, design system) |
| `alternance.md` | contrat d'alternance / apprentissage |
| `candidature-spontanee.md` | pas d'offre publiée, on vise l'entreprise |
| `employe-numerique.md` | poste du numérique hors développement (support, technicien, données, tests, outils, back-office) |
| `php-symfony.md` | poste dont le cœur est PHP/Symfony (+ MySQL, éventuellement JS front) |

En cas d'offre hybride, prendre le modèle dominant et adapter.

## Convention

- `[Accroche : …]` : **seule** zone rédigée par l'agent (remplacée par l'accroche).
- `{{placeholder}}` : variable résolue **déterministe** à l'assemblage.
- Commentaires HTML (en tête + « ton de référence ») : non rendus.

### Placeholders résolus à l'assemblage
- depuis l'**offre** : `{{poste.intitule}}`, `{{entreprise.nom}}` ;
- depuis le **profil** (`cv/profile.json`) : `{{candidat.titre}}`, `{{candidat.nom}}`,
  `{{candidat.email}}`, `{{candidat.telephone}}` (signature gérée par la mise en page) ;
- **alternance** (`profile.alternance`, défauts neutres si vides) : `{{formation}}`,
  `{{rythme_alternance}}`, `{{date_debut}}`.

> Le corps figé ne contient plus de `{{realisation_*}}` : les projets/expériences
> y sont écrits en dur (texte validé). Seule l'accroche reste dynamique.

## Règles de style (rappel)

Vouvoiement par défaut · ton professionnel mais humain · pas de jargon RH vide ·
montrer plutôt que déclarer · aucune mention de l'IA ayant rédigé la lettre.

Ces modèles sont génériques (aucune donnée perso) et peuvent être versionnés.
