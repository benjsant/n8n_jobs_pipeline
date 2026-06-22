<!--
Template : Développeur back-end.
Quand le choisir : offre orientée back-end (API, services, bases de données,
architecture serveur), avec ou sans composante IA.
L'agent s'appuie sur ce squelette pour rédiger `lettre_motivation` (250-350
mots). {{placeholders}} = à remplir ; [notes entre crochets] = consignes.
Vouvoiement. Aucune invention.
-->

Objet : Candidature au poste de {{poste.intitule}}

Madame, Monsieur,

[Accroche — 2-3 phrases. Pourquoi {{entreprise.nom}} : citer un élément concret
({{entreprise.element_concret}} — produit, échelle technique, stack back-end,
enjeux de fiabilité/performance).]

[Corps — 1-2 paragraphes. Relier 2-3 exigences de l'offre à des réalisations
back-end concrètes ({{realisation_1}}, {{realisation_2}}) : conception d'API,
modélisation de données, qualité/tests, performance. Montrer l'impact mesurable.]

[Projection — 1 paragraphe. Ce que le candidat apporterait à l'équipe technique
de {{entreprise.nom}} (robustesse, maintenabilité, montée en charge). Précis.]

[Clôture — 1-2 phrases. Disponibilité et ouverture à un échange.]

Je vous remercie de l'attention portée à ma candidature et reste à votre
disposition pour en échanger.

{{candidat.nom}}
{{candidat.email}} · {{candidat.telephone}}

<!--
Ton de référence (vraies lettres du candidat — guide le ton, jamais les faits ;
voir §5 du system prompt) :
- Projets en avant : InfiniDex (FastAPI, PostgreSQL, ETL Prefect) et PredictionDex
  (pipeline MLOps, API FastAPI). Insister : APIs robustes, modélisation de
  données, automatisation de pipelines, mise en production.
- Formule « du code jusqu'au déploiement » ; montrer l'impact mesurable.
- « Produits réellement déployés, pas des démos. » Reconversion RNCP 6 = socle.
-->

