-- =====================================================================
--  Profils de recherche RÉELS — Benjamin Santrisse.
--
--  DEUX ancres resserrées (préférence utilisateur 2026-07-09, remplace
--  l'ancre unique Valenciennes rayon 50 km) :
--    - Valenciennes (domicile : Marly), rayon 20 km ;
--    - Lille, gare Lille Flandres, rayon 5 km (accès direct en train).
--  Chaque profil « métier » est décliné sur les deux zones (cross join) ;
--  la déduplication (hash + sémantique) absorbe les recouvrements éventuels.
--
--  INSEE = param `commune` France Travail (+ `distance` = rayon).
--  location_label = nom de ville pour les sources texte (JobSpy).
--  latitude/longitude + rome_codes = La Bonne Alternance.
--  M1805 = études et développement informatique (tout le dev).
--  M1810 = production et exploitation de SI (support/exploitation, à affiner).
--
--  Recherche pilotée par les COMPÉTENCES du candidat (pas un titre étroit) :
--  IA/ML, backend Python, PHP/Symfony, web/fullstack JS, reconversion dev,
--  + élargissement « employé du numérique » (hors développement).
--  Idempotent (ON CONFLICT name DO NOTHING) : modifier une valeur d'un profil
--  existant se fait par UPDATE sur la base qui tourne, en plus de ce fichier.
--
--  Appliquer : docker compose exec -T postgres \
--    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/seed-profiles.sql
-- =====================================================================

WITH zones (zone, location_insee, location_label, latitude, longitude, radius_km) AS (
  VALUES
    ('Valenciennes', '59606', 'Valenciennes', 50.358,  3.523,  20),
    ('Lille',        '59350', 'Lille',        50.6366, 3.0709,  5)
),
profils (name, keywords, rome_codes, contract_types, seniority, must_have, exclusions, score_threshold) AS (
  VALUES
    ('Dev IA / ML junior',
     'développeur IA machine learning', 'M1805', 'CDI,Alternance', 'Junior',
     'Python obligatoire. Au moins un framework ML (PyTorch, TensorFlow, scikit-learn) ou de l''IA générative (LLM, RAG, agents). Niveau junior/débutant accepté.',
     'Data analyst/BI sans modélisation ; helpdesk ; support N1/N2 ; commercial ; postes 5 ans et plus ; senior ; lead.',
     60),
    ('Dev Backend Python junior',
     'développeur backend python', 'M1805', 'CDI,Alternance', 'Junior',
     'Python obligatoire. Un framework backend (FastAPI ou Django). API REST. Notions de bases de données (PostgreSQL). Niveau junior/débutant accepté.',
     'Uniquement front ; no-code ; helpdesk/support ; commercial ; postes 5 ans et plus ; senior ; lead.',
     60),
    ('Dev PHP / Symfony junior',
     'développeur PHP Symfony web', 'M1805', 'CDI,Alternance', 'Junior',
     'PHP, idéalement Symfony. Développement web back ou fullstack. Niveau junior/débutant accepté (XP Symfony réelle côté candidat).',
     'Intégrateur sans dev ; webdesign/UX sans code ; helpdesk/support ; commercial ; postes 5 ans et plus ; senior ; lead.',
     60),
    ('Dev web / Fullstack junior',
     'développeur web React Next.js JavaScript', 'M1805', 'CDI,Alternance', 'Junior',
     'Développement web. JavaScript/TypeScript, idéalement React ou Next.js (ou un back Python/PHP en fullstack). Niveau junior/débutant accepté.',
     'Webdesign/UX sans code ; intégrateur sans dev ; helpdesk ; commercial ; postes 5 ans et plus ; senior ; lead.',
     60),
    ('Reconversion / formation dev',
     'reconversion développeur formation développeur POEI alternance développeur débutant', 'M1805', 'CDI,Alternance', 'Junior',
     'Poste de développeur avec formation incluse ou reconversion (POEI, alternance, débutant accepté). Stack indifférente : la formation est fournie ; le candidat a des bases solides en dev.',
     'Commercial ; helpdesk/support ; postes exigeant plusieurs années d''expérience ; senior ; lead.',
     50),
    -- Élargissement 2026-07-09 : postes du numérique HORS développement.
    ('Employé du numérique (support, données, tests)',
     'technicien informatique support numérique', 'M1810', 'CDI,CDD,Alternance', 'Junior',
     'Poste du secteur numérique accessible à un profil technique junior : support/assistance utilisateur, technicien informatique, exploitation, traitement ou contrôle de données, tests logiciels, administration d''outils, back-office numérique. Toute base technique (Windows/Linux, bureautique, bases de données) valorisée.',
     'commercial pur ; centre d''appels sans dimension technique ; postes 5 ans et plus ; senior ; manager ; câblage/fibre terrain.',
     50)
)
INSERT INTO search_profiles
  (name, keywords, location_insee, location_label, latitude, longitude, rome_codes, radius_km, contract_types, seniority, must_have, exclusions, score_threshold, active)
SELECT
  p.name || ' (' || z.zone || ')',
  p.keywords, z.location_insee, z.location_label, z.latitude, z.longitude,
  p.rome_codes, z.radius_km, p.contract_types, p.seniority,
  p.must_have, p.exclusions, p.score_threshold, true
FROM profils p CROSS JOIN zones z
ON CONFLICT (name) DO NOTHING;
