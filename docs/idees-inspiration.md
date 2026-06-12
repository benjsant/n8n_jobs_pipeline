# 💡 Idées d'inspiration — deck « Job Radar IA »

> Source : `Deck_Hackathon_JobRadar_IA.pdf` (TNE APEC), **non versionné** (ignoré
> par `.gitignore`) — c'est un brief d'inspiration, **rien à rendre de ce côté**.
> Ce fichier capitalise les idées qu'on en a tirées et leur état dans le projet.

## Pipeline attendu par le brief vs le nôtre

| Étape du brief | Chez nous | État |
|---|---|---|
| Collecte (≥2 sources) | France Travail, Adzuna, JobSpy, WTTJ | ✅ (workflow `01`) |
| Filtrage IA (scorer par profil) | scoring **hybride** : déterministe + DeepSeek top-N | ✅ `lib/llm-scoring.mjs` |
| Traitement : dédupliquer | hash `SHA256(title+company+location)` | ✅ |
| Traitement : **enrichir** | fiche entreprise **grounded** (sans invention) | ✅ `lib/company-enrichment.mjs` |
| Restitution | Discord (alerts + log), Gmail brouillon, Drive | ✅ ; **Sheets** = idée ouverte |

## Idées retenues et faites ✅

1. **Filtrage = LLM, pas juste mots-clés.** On a gardé le score déterministe
   comme pré-filtre cheap et on fait affiner DeepSeek sur le top-N (score +
   `score_reason` visible dans l'alerte). → pertinence nettement meilleure.
2. **Enrichissement entreprise.** Résumé `sector` + `ai_summary` produit
   uniquement à partir du texte réel de l'offre (garde-fou anti-invention),
   stocké dans `companies`, pour des lettres mieux ancrées.
3. **Matching CV / offre (bonus du deck).** Le system prompt §6 produit
   désormais `personnalisation_cv` (`highlight_skills/projects/experiences`,
   `hidden_sections`, `summary`) ; les valeurs sont **vérifiées** contre
   `cv/cv-index.json` (pas d'invention). Le moteur Astro réordonne/masque.
4. **Score de pertinence visible.** Score + justification poussés dans Discord.

## Idées ouvertes (pas encore faites)

- **Restitution Google Sheets** (lecture seule depuis Postgres) : « tableau de
  bord » des offres/score/statut, sans réintroduire Notion comme stockage.
  Faible effort, très démontrable.
- **Source APEC** : jobboard cadres/jeunes diplômés cité par le deck, pas encore
  branché (on a FT/Adzuna/JobSpy/WTTJ). Ajouter un normaliseur dans
  `lib/sources.mjs` + une branche dans `01`.
- **Alertes « temps réel »** : aujourd'hui cron quotidien 8h ; on pourrait
  augmenter la fréquence ou passer en événementiel.
- **Multi-profils** : la table `profile` + `cv/*.json` pourraient porter
  plusieurs profils, avec un scoring par profil. Stretch.
- **Interface utilisateur** : aucune pour l'instant (la vue Sheets ferait office
  de tableau de bord léger).
- **Boutons Discord natifs** (vs liens) : nécessiterait une application/bot
  Discord avec endpoint d'interactions (aujourd'hui : liens vers le webhook `03`).

## Règles du brief qu'on respecte déjà

- « Documenter ce que l'IA a fait vs ce que l'humain a décidé » → garde-fous
  + relecture humaine obligatoire avant envoi (Gmail reste en brouillon).
- « Prototype qui tourne en live > vidéo parfaite » → priorité à un run réel ;
  les limites connues sont tracées dans `reste-a-faire.md` (statuts 🟡).
