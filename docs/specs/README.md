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

## Implémenté ✅
1. Schéma §6 étendu (sous-scores + matching/missing_skills) + validateur
   `test_deepseek.py`. Scoring par profil (must_have/exclusions) dans
   `llm-scoring.mjs`.
2. `cv/*.json` étendu : `soft_skills`, `salary`, `strengths`, `achievements`
   (profile.json) + `certifications.json` + `languages.json`.
3. Sections Certifications + Langues + Savoir-être ajoutées au template Astro.
4. **Multi-profils** : table `search_profiles` + `offers.profile_id` + workflow
   `01` piloté par les profils actifs (cf. `modele-cible-multiprofils`).
5. Source **Google Jobs (SerpApi)** ajoutée.

## Reste (optionnel)
- ATS : `adaptation_cv` pourrait devenir un champ structuré (mots-clés).
- Format CV : on garde Astro HTML→PDF (vs « Markdown→PDF » de la spec).
