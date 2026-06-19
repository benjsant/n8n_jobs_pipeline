-- =====================================================================
--  job-hunter — schéma métier PostgreSQL (source de vérité)
--  Tables distinctes de celles, internes, gérées par n8n.
--
--  Idempotent : réapplicable sans risque (IF NOT EXISTS partout).
--  - Au premier démarrage, Postgres exécute ce fichier automatiquement
--    (monté dans /docker-entrypoint-initdb.d via docker-compose).
--  - Si la base existe déjà, applique-le à la main :
--      docker compose exec -T postgres \
--        psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < db/schema.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- search_profiles : configs de recherche (multi-profils). Chaque profil pilote
-- une collecte (mots-clés, zone, contrat) et le scoring (must_have/exclusions).
-- Inspiré de la table Airtable « Profils » du pipeline Make.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS search_profiles (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,          -- nom_profil
    keywords        TEXT NOT NULL,                 -- mots_cles
    location_insee  TEXT,                          -- code INSEE de la commune
    radius_km       INTEGER,                       -- rayon de recherche
    contract_types  TEXT,                          -- ex. "CDI,CDD,Alternance"
    seniority       TEXT,                          -- ex. "Junior"
    must_have       TEXT,                          -- critères indispensables (scoring)
    exclusions      TEXT,                          -- critères d'exclusion (scoring)
    score_threshold INTEGER NOT NULL DEFAULT 60 CHECK (score_threshold BETWEEN 0 AND 100),
    active          BOOLEAN NOT NULL DEFAULT true, -- actif
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_active ON search_profiles (active);

-- ---------------------------------------------------------------------
-- offers : toutes les offres collectées (dédupliquées par hash)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS offers (
    id            SERIAL PRIMARY KEY,
    source        TEXT NOT NULL,                 -- france_travail | adzuna | jobspy | wttj
    source_id     TEXT,                          -- identifiant côté source
    hash          TEXT NOT NULL UNIQUE,          -- SHA256(title + company + location)
    title         TEXT NOT NULL,
    company       TEXT,
    location      TEXT,
    contract_type TEXT,
    salary        TEXT,
    description   TEXT,
    url           TEXT,
    score         INTEGER CHECK (score BETWEEN 0 AND 100),
    score_reason  TEXT,                          -- justification du score (scoring LLM)
    profile_id    INTEGER REFERENCES search_profiles (id) ON DELETE SET NULL,
    status        TEXT NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new', 'reviewed', 'selected', 'ignored', 'applied')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pour les bases déjà créées avant ces colonnes (idempotent).
ALTER TABLE offers ADD COLUMN IF NOT EXISTS score_reason TEXT;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS profile_id INTEGER REFERENCES search_profiles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_offers_status ON offers (status);
CREATE INDEX IF NOT EXISTS idx_offers_created_at ON offers (created_at DESC);

-- ---------------------------------------------------------------------
-- companies : infos enrichies sur les entreprises
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
    id           SERIAL PRIMARY KEY,
    name         TEXT NOT NULL UNIQUE,
    website      TEXT,
    sector       TEXT,
    description  TEXT,
    ai_summary   TEXT,                           -- résumé généré (V2)
    last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- applications : suivi des candidatures
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS applications (
    id          SERIAL PRIMARY KEY,
    offer_id    INTEGER NOT NULL REFERENCES offers (id) ON DELETE CASCADE,
    company_id  INTEGER REFERENCES companies (id) ON DELETE SET NULL,
    status      TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'sent', 'interview', 'rejected', 'accepted')),
    applied_at  TIMESTAMPTZ,
    response_at TIMESTAMPTZ,                      -- NULL tant que pas de réponse (relances V2)
    notes       TEXT
);

CREATE INDEX IF NOT EXISTS idx_applications_offer ON applications (offer_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications (status);

-- ---------------------------------------------------------------------
-- generated_documents : historique des CV / lettres générés
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS generated_documents (
    id             SERIAL PRIMARY KEY,
    application_id INTEGER NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
    cv_path        TEXT,                          -- chemin du CV PDF (Drive)
    letter_path    TEXT,                          -- chemin de la lettre
    generated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_application ON generated_documents (application_id);

-- ---------------------------------------------------------------------
-- profile : profil candidat (source unique et autorisée des
-- compétences/expériences — aucune invention).
-- Peut rester vide si le profil vit dans les fichiers cv/*.json.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profile (
    id         SERIAL PRIMARY KEY,
    data       JSONB NOT NULL,                    -- profil structuré
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
