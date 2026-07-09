-- =====================================================================
--  Profils de recherche RÉELS — Benjamin Santrisse.
--  UNE ancre = Valenciennes (domicile : Marly), rayon 50 km. France Travail et
--  La Bonne Alternance cherchent par rayon -> couvrent Valenciennes ET Lille
--  (~45 km). JobSpy/Adzuna cherchent par nom de ville -> priorisent la zone
--  Valenciennes. (Pour prioriser plutôt le marché lillois sur JobSpy, mettre
--  location_label='Lille' + l'INSEE/lat-long de Lille.)
--  Contrats : CDI ou alternance. Idempotent (ON CONFLICT name DO NOTHING).
--
--  INSEE Valenciennes = 59606 (param `commune` France Travail). location_label =
--  nom de ville pour les sources texte. latitude/longitude + rome_codes = LBA.
--  M1805 = "Études et développement informatique" (couvre tout le dev).
--
--  Recherche pilotée par les COMPÉTENCES du candidat (pas un titre étroit) :
--  IA/ML, backend Python, PHP/Symfony, web/fullstack JS, + reconversion/formation.
--
--  Appliquer : docker compose exec -T postgres \
--    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/seed-profiles.sql
-- =====================================================================

INSERT INTO search_profiles
  (name, keywords, location_insee, location_label, latitude, longitude, rome_codes, radius_km, contract_types, seniority, must_have, exclusions, score_threshold, active)
VALUES
  ('Dev IA / ML junior',
   'développeur IA machine learning',
   '59606', 'Valenciennes', 50.358, 3.523, 'M1805', 50, 'CDI,Alternance', 'Junior',
   'Python obligatoire. Au moins un framework ML (PyTorch, TensorFlow, scikit-learn) ou de l''IA générative (LLM, RAG, agents). Niveau junior/débutant accepté.',
   'Data analyst/BI sans modélisation ; helpdesk ; support N1/N2 ; commercial ; postes 5 ans et plus ; senior ; lead.',
   60, true),
  ('Dev Backend Python junior',
   'développeur backend python',
   '59606', 'Valenciennes', 50.358, 3.523, 'M1805', 50, 'CDI,Alternance', 'Junior',
   'Python obligatoire. Un framework backend (FastAPI ou Django). API REST. Notions de bases de données (PostgreSQL). Niveau junior/débutant accepté.',
   'Uniquement front ; no-code ; helpdesk/support ; commercial ; postes 5 ans et plus ; senior ; lead.',
   60, true),
  ('Dev PHP / Symfony junior',
   'développeur PHP Symfony web',
   '59606', 'Valenciennes', 50.358, 3.523, 'M1805', 50, 'CDI,Alternance', 'Junior',
   'PHP, idéalement Symfony. Développement web back ou fullstack. Niveau junior/débutant accepté (XP Symfony réelle côté candidat).',
   'Intégrateur sans dev ; webdesign/UX sans code ; helpdesk/support ; commercial ; postes 5 ans et plus ; senior ; lead.',
   60, true),
  ('Dev web / Fullstack junior',
   'développeur web React Next.js JavaScript',
   '59606', 'Valenciennes', 50.358, 3.523, 'M1805', 50, 'CDI,Alternance', 'Junior',
   'Développement web. JavaScript/TypeScript, idéalement React ou Next.js (ou un back Python/PHP en fullstack). Niveau junior/débutant accepté.',
   'Webdesign/UX sans code ; intégrateur sans dev ; helpdesk ; commercial ; postes 5 ans et plus ; senior ; lead.',
   60, true),
  ('Reconversion / formation dev',
   'reconversion développeur formation développeur POEI alternance développeur débutant',
   '59606', 'Valenciennes', 50.358, 3.523, 'M1805', 50, 'CDI,Alternance', 'Junior',
   'Poste de développeur avec formation incluse ou reconversion (POEI, alternance, débutant accepté). Stack indifférente : la formation est fournie ; le candidat a des bases solides en dev.',
   'Commercial ; helpdesk/support ; postes exigeant plusieurs années d''expérience ; senior ; lead.',
   50, true)
ON CONFLICT (name) DO NOTHING;

-- Élargissement 2026-07-09 : postes du numérique HORS développement (support,
-- technicien, exploitation, données, tests, outils). Seuil plus bas (50) et
-- CDD accepté. rome_codes M1810 = production/exploitation de SI (LBA ; à
-- affiner si besoin). Les profils dev restent actifs en parallèle.
INSERT INTO search_profiles
  (name, keywords, location_insee, location_label, latitude, longitude, rome_codes, radius_km, contract_types, seniority, must_have, exclusions, score_threshold, active)
VALUES
  ('Employé du numérique (support, données, tests)',
   'technicien informatique support numérique',
   '59606', 'Valenciennes', 50.358, 3.523, 'M1810', 50, 'CDI,CDD,Alternance', 'Junior',
   'Poste du secteur numérique accessible à un profil technique junior : support/assistance utilisateur, technicien informatique, exploitation, traitement ou contrôle de données, tests logiciels, administration d''outils, back-office numérique. Toute base technique (Windows/Linux, bureautique, bases de données) valorisée.',
   'commercial pur ; centre d''appels sans dimension technique ; postes 5 ans et plus ; senior ; manager ; câblage/fibre terrain.',
   50, true)
ON CONFLICT (name) DO NOTHING;
