# assets/letters/ — modèles de lettres de motivation

Squelettes **typés** servant de base à l'agent. L'agent choisit le plus adapté à
l'offre, puis rédige le texte final (`lettre_motivation`, 250-350 mots) en
suivant la structure et le ton du modèle. Il ne recopie pas le squelette tel
quel et **n'invente rien** (cf. `prompts/agent-system-prompt.md`, sections 5 et 7).

## Choisir le bon modèle

| Modèle | Quand |
|---|---|
| `ia-junior.md` | poste IA / ML / data / LLM, positionnement junior |
| `backend.md` | poste back-end (API, services, BDD, archi) |
| `frontend.md` | poste front-end (UI, frameworks JS, design system) |
| `alternance.md` | contrat d'alternance / apprentissage |
| `candidature-spontanee.md` | pas d'offre publiée, on vise l'entreprise |

En cas d'offre hybride, prendre le modèle dominant et adapter.

## Convention

- `{{placeholder}}` : variable à remplir depuis le profil / l'offre / l'entreprise.
- `[note entre crochets]` : consigne de rédaction — **ne doit pas** apparaître
  dans le texte final.
- Commentaire HTML en tête : mode d'emploi du modèle, non rendu.

### Placeholders communs
`{{candidat.nom}}`, `{{candidat.titre}}`, `{{candidat.email}}`,
`{{candidat.telephone}}`, `{{candidat.localisation}}`,
`{{entreprise.nom}}`, `{{entreprise.element_concret}}` (produit / mission / actu /
stack — l'élément concret qui justifie le choix de l'entreprise),
`{{poste.intitule}}`, `{{realisation_1}}`, `{{realisation_2}}`.

Placeholders spécifiques : `{{formation}}`, `{{rythme_alternance}}`,
`{{date_debut}}` (alternance).

## Règles de style (rappel)

Vouvoiement par défaut · ton professionnel mais humain · pas de jargon RH vide ·
montrer plutôt que déclarer · aucune mention de l'IA ayant rédigé la lettre.

Ces modèles sont génériques (aucune donnée perso) et peuvent être versionnés.
