-- =====================================================================
--  Profils de recherche d'EXEMPLE (fictifs) pour démarrer / démontrer.
--  Idempotent (ON CONFLICT name DO NOTHING). Remplace par tes vrais profils.
--  Appliquer : docker compose exec -T postgres \
--    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/seed-profiles.sql
-- =====================================================================

INSERT INTO search_profiles
  (name, keywords, location_insee, radius_km, contract_types, seniority, must_have, exclusions, score_threshold, active)
VALUES
  ('Développeur IA / ML - junior',
   'développeur IA machine learning',
   '69123', 50, 'CDI,CDD,Alternance', 'Junior',
   'Python obligatoire. Au moins un framework ML (PyTorch, TensorFlow ou scikit-learn). Notions ML. Débutant accepté.',
   'Data analyst/BI sans modélisation ; helpdesk ; commercial ; postes 5 ans et plus.',
   60, true),
  ('Développeur full-stack JS - junior',
   'développeur full stack javascript',
   '69123', 30, 'CDI,CDD,Alternance', 'Junior',
   'JavaScript/TypeScript. Node.js côté serveur. Un framework front (React ou Vue). Débutant accepté.',
   'Uniquement front ou uniquement back ; no-code ; experts 5 ans et plus.',
   60, true)
ON CONFLICT (name) DO NOTHING;
