-- =====================================================================
--  job-hunter — requêtes paramétrées de la couche candidature.
--  Source de vérité des requêtes utilisées par les nœuds Postgres n8n
--  (workflows 02 / 03 / 04). Paramètres en $1, $2, … (requêtes préparées).
--  Testées par db/queries.test.sh contre db/schema.sql.
-- =====================================================================

-- 1) Passage de statut d'une offre (workflow 03 : actions Discord).
--    $1 = statut cible (selected | ignored | applied), $2 = hash.
-- name: set_offer_status
UPDATE offers SET status = $1 WHERE hash = $2
RETURNING id, title, status;

-- 2) Récupérer une offre sélectionnée (orchestration : avant l'agent).
-- name: get_offer_by_hash
SELECT id, source, title, company, location, contract_type, salary,
       description, url, score, status
FROM offers WHERE hash = $1;

-- 3) Upsert d'une entreprise (avant de créer la candidature).
--    $1 = name, $2 = website, $3 = sector, $4 = description, $5 = ai_summary.
--    Renvoie l'id (existant ou créé).
-- name: upsert_company
INSERT INTO companies (name, website, sector, description, ai_summary, last_updated)
VALUES ($1, NULLIF($2,''), NULLIF($3,''), NULLIF($4,''), NULLIF($5,''), now())
ON CONFLICT (name) DO UPDATE SET
  website      = COALESCE(NULLIF(EXCLUDED.website,''), companies.website),
  sector       = COALESCE(NULLIF(EXCLUDED.sector,''), companies.sector),
  description  = COALESCE(NULLIF(EXCLUDED.description,''), companies.description),
  ai_summary   = COALESCE(NULLIF(EXCLUDED.ai_summary,''), companies.ai_summary),
  last_updated = now()
RETURNING id;

-- 4) Créer la candidature (statut draft) liée à l'offre et l'entreprise.
--    $1 = offer_id, $2 = company_id, $3 = notes (justification/score agent).
-- name: insert_application
INSERT INTO applications (offer_id, company_id, status, notes)
VALUES ($1, $2, 'draft', $3)
RETURNING id;

-- 5) Enregistrer les documents générés (CV/lettre).
--    $1 = application_id, $2 = cv_path, $3 = letter_path.
-- name: insert_generated_documents
INSERT INTO generated_documents (application_id, cv_path, letter_path)
VALUES ($1, NULLIF($2,''), NULLIF($3,''))
RETURNING id;

-- 6) Faire avancer le statut de la candidature (ex. draft -> sent).
--    $1 = statut cible, $2 = application_id.
-- name: set_application_status
UPDATE applications SET status = $1,
  applied_at = CASE WHEN $1 = 'sent' THEN now() ELSE applied_at END
WHERE id = $2
RETURNING id, status;
