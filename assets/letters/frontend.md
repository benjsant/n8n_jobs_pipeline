<!--
Template : Développeur front-end.
Quand le choisir : offre orientée front-end (UI, frameworks JS, accessibilité,
performance perçue, design system).
L'agent s'appuie sur ce squelette pour rédiger `lettre_motivation` (250-350
mots). {{placeholders}} = à remplir ; [notes entre crochets] = consignes.
Vouvoiement. Aucune invention.
-->

Objet : Candidature au poste de {{poste.intitule}}

Madame, Monsieur,

[Accroche — 2-3 phrases. Pourquoi {{entreprise.nom}} : citer un élément concret
({{entreprise.element_concret}} — produit, expérience utilisateur, stack
front-end, soin du design).]

[Corps — 1-2 paragraphes. Relier 2-3 exigences de l'offre à des réalisations
front-end concrètes ({{realisation_1}}, {{realisation_2}}) : interfaces livrées,
composants réutilisables, accessibilité, performance perçue. Montrer le rendu et
l'impact utilisateur.]

[Projection — 1 paragraphe. Ce que le candidat apporterait à l'équipe produit de
{{entreprise.nom}} (qualité d'interface, cohérence, attention au détail).]

[Clôture — 1-2 phrases. Disponibilité et ouverture à un échange.]

Je vous remercie de l'attention portée à ma candidature et reste à votre
disposition pour en échanger.

{{candidat.nom}}
{{candidat.email}} · {{candidat.telephone}}

<!--
Ton de référence (vraies lettres du candidat — guide le ton, jamais les faits ;
voir §5 du system prompt) :
- Le front n'est pas le cœur du profil : rester honnête. S'appuyer sur du React /
  Next.js réel (InfiniDex et Audiomancy ont un front Next.js) sans surjouer.
- Jouer la polyvalence (PHP/Symfony, JavaScript/React) comme atout d'adaptation
  rapide à une stack ; calibrer le vocabulaire sur le niveau réel.
- « Produits réellement déployés, pas des démos. »
-->

