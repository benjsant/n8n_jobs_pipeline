# docs/specs/ — specs fournies par l'utilisateur (réconciliation)

Specs brutes données par l'utilisateur, archivées telles quelles, à intégrer
dans la **source de vérité** (root `CLAUDE.md`, `prompts/agent-system-prompt.md`,
`cv/*.json`). Ce dossier garde la trace de l'origine ; les fichiers canoniques
restent la référence d'exécution.

| Spec | Fichier | Décision |
|---|---|---|
| Scoring agent (sous-scores + échelle) | `agent-scoring-spec.md` | **Fusionner** dans §6 ; clic humain conservé |
| Template profil candidat | `candidate-profile-template.md` | Étendre `cv/*.json` (champs nouveaux) |
| Règles génération CV | `cv-generation-rules.md` | Esprit déjà en place ; ajuster structure |

## Mapping → notre modèle

### Scoring (agent-scoring-spec) — FUSION décidée
Ajouter au schéma de sortie §6, **en plus** de l'existant (on garde
`lettre_motivation`, `personnalisation_cv`, etc.) :
- `skills_score`, `experience_score`, `location_score`, `salary_score` (sous-scores)
- `matching_skills`, `missing_skills` (≈ nos `points_forts`/`gaps`, à clarifier)
- `score` reste le score global (= `score_global`).
- Échelle 0-59 / 60-79 / 80-100 alignée sur la grille §4 ; **80+ = mise en
  avant**, la génération reste déclenchée par le clic « Générer » (garde-fou).

### Profil candidat (candidate-profile-template) — champs nouveaux
Non encore présents dans `cv/*.json`, à ajouter :
- **Compétences humaines** (soft skills) → `cv/profile.json` ou `cv/skills.json`.
- **Certifications** → `cv/certifications.json` (ou section dédiée).
- **Langues** → `cv/languages.json`.
- **Salaire** min/idéal, **points forts**, **réalisations notables** → `cv/profile.json`.
Déjà couverts : infos générales, localisation, compétences techniques, expériences,
projets, préférences.

### Génération CV (cv-generation-rules) — surtout déjà fait
- Réorganiser / mettre en avant / ne rien inventer → couvert par
  `personnalisation_cv` + moteur Astro + garde-fous.
- À ajuster : ajouter sections **Certifications** et **Langues** au template Astro.
- **ATS** : optimisation mots-clés → déjà via `adaptation_cv` ; pourrait devenir
  un champ structuré.
- Écart de format : la spec dit « Markdown puis PDF » ; on fait **Astro HTML →
  PDF** (rendu fixe, plus robuste). À garder sauf objection.

## Reste à implémenter (après validation)
1. Étendre le schéma §6 (sous-scores + matching/missing_skills) + le validateur
   `test_deepseek.py` + le scoring déterministe (`offer-utils.mjs`).
2. Étendre `cv/*.json` (soft skills, certifications, langues, salaire, points forts).
3. Ajouter sections Certifications + Langues au template Astro + `cv-index`.
