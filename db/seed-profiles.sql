-- =====================================================================
--  Profils de recherche RÉELS — Benjamin Santrisse.
--  Zone : métropole de Valenciennes + Lille (2 ancres pour couvrir le
--  corridor ~50 km ; la dédup canonicalisée gère le recouvrement).
--  Contrats : CDI ou alternance (préférence candidat).
--  Idempotent (ON CONFLICT name DO NOTHING).
--
--  Codes INSEE : Valenciennes = 59606, Lille = 59350 (param `commune` de
--  France Travail). `location_label` = nom de ville pour les sources texte
--  (Adzuna / SerpApi / JobSpy / JSearch). Vérifier l'INSEE via le
--  référentiel France Travail (.../referentiel/communes) en cas de doute.
--
--  latitude/longitude + rome_codes : pour La Bonne Alternance (recherche géo +
--  ROME). M1805 = "Études et développement informatique" (couvre dev/IA/backend).
--  Coords approx. : Valenciennes (50.358, 3.523), Lille (50.629, 3.057).
--
--  Appliquer : docker compose exec -T postgres \
--    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/seed-profiles.sql
-- =====================================================================

INSERT INTO search_profiles
  (name, keywords, location_insee, location_label, latitude, longitude, rome_codes, radius_km, contract_types, seniority, must_have, exclusions, score_threshold, active)
VALUES
  -- ---- Dev IA / ML junior ----
  ('Dev IA / ML junior - Valenciennes',
   'développeur IA machine learning',
   '59606', 'Valenciennes', 50.358, 3.523, 'M1805', 30, 'CDI,Alternance', 'Junior',
   'Python obligatoire. Au moins un framework ML (PyTorch, TensorFlow, scikit-learn) ou de l''IA générative (LLM, RAG, agents). Niveau junior/débutant accepté.',
   'Data analyst/BI sans modélisation ; helpdesk ; support N1/N2 ; commercial ; postes 5 ans et plus ; senior ; lead.',
   60, true),
  ('Dev IA / ML junior - Lille',
   'développeur IA machine learning',
   '59350', 'Lille', 50.629, 3.057, 'M1805', 30, 'CDI,Alternance', 'Junior',
   'Python obligatoire. Au moins un framework ML (PyTorch, TensorFlow, scikit-learn) ou de l''IA générative (LLM, RAG, agents). Niveau junior/débutant accepté.',
   'Data analyst/BI sans modélisation ; helpdesk ; support N1/N2 ; commercial ; postes 5 ans et plus ; senior ; lead.',
   60, true),
  -- ---- Dev Backend Python junior ----
  ('Dev Backend Python junior - Valenciennes',
   'développeur backend python',
   '59606', 'Valenciennes', 50.358, 3.523, 'M1805', 30, 'CDI,Alternance', 'Junior',
   'Python obligatoire. Un framework backend (FastAPI ou Django). API REST. Notions de bases de données (PostgreSQL). Niveau junior/débutant accepté.',
   'Uniquement front ; no-code ; helpdesk/support ; commercial ; postes 5 ans et plus ; senior ; lead.',
   60, true),
  ('Dev Backend Python junior - Lille',
   'développeur backend python',
   '59350', 'Lille', 50.629, 3.057, 'M1805', 30, 'CDI,Alternance', 'Junior',
   'Python obligatoire. Un framework backend (FastAPI ou Django). API REST. Notions de bases de données (PostgreSQL). Niveau junior/débutant accepté.',
   'Uniquement front ; no-code ; helpdesk/support ; commercial ; postes 5 ans et plus ; senior ; lead.',
   60, true)
ON CONFLICT (name) DO NOTHING;
