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

-- Déduplication sémantique : l'extension pgvector stocke les embeddings des
-- offres (cf. table offers). ⚠️ Requiert l'image Postgres `pgvector/pgvector:pg16`
-- (l'extension `vector` n'est PAS incluse dans `postgres:alpine`). Sans elle,
-- ce CREATE EXTENSION échoue ; le reste du pipeline (hash exact) marche quand même.
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------
-- search_profiles : configs de recherche (multi-profils). Chaque profil pilote
-- une collecte (mots-clés, zone, contrat) et le scoring (must_have/exclusions).
-- Inspiré de la table Airtable « Profils » du pipeline Make.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS search_profiles (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,          -- nom_profil
    keywords        TEXT NOT NULL,                 -- mots_cles
    location_insee  TEXT,                          -- code INSEE (France Travail : param commune)
    location_label  TEXT,                          -- nom de ville pour les sources texte (Adzuna/SerpApi/JobSpy/JSearch)
    latitude        DOUBLE PRECISION,              -- La Bonne Alternance (recherche géo lat/long)
    longitude       DOUBLE PRECISION,              -- La Bonne Alternance
    rome_codes      TEXT,                          -- codes ROME pour La Bonne Alternance (ex. "M1805")
    radius_km       INTEGER,                       -- rayon de recherche
    contract_types  TEXT,                          -- ex. "CDI,CDD,Alternance"
    seniority       TEXT,                          -- ex. "Junior"
    must_have       TEXT,                          -- critères indispensables (scoring)
    exclusions      TEXT,                          -- critères d'exclusion (scoring)
    score_threshold INTEGER NOT NULL DEFAULT 60 CHECK (score_threshold BETWEEN 0 AND 100),
    active          BOOLEAN NOT NULL DEFAULT true, -- actif
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pour les bases déjà créées avant ces colonnes (idempotent).
ALTER TABLE search_profiles ADD COLUMN IF NOT EXISTS location_label TEXT;
ALTER TABLE search_profiles ADD COLUMN IF NOT EXISTS latitude   DOUBLE PRECISION;
ALTER TABLE search_profiles ADD COLUMN IF NOT EXISTS longitude  DOUBLE PRECISION;
ALTER TABLE search_profiles ADD COLUMN IF NOT EXISTS rome_codes TEXT;

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
-- Embedding pour la dédup sémantique (384 dims = modèle
-- paraphrase-multilingual-MiniLM-L12-v2 du service `embeddings`).
ALTER TABLE offers ADD COLUMN IF NOT EXISTS embedding vector(384);
-- Entreprise canonicalisée (canonCompany d'offer-utils.mjs), écrite par l'INSERT
-- du workflow 01 : garde-fou de la dédup sémantique INTER-RUNS (un quasi-doublon
-- déjà en base n'est écarté que si l'entreprise canonique correspond).
ALTER TABLE offers ADD COLUMN IF NOT EXISTS company_canon TEXT;

CREATE INDEX IF NOT EXISTS idx_offers_status ON offers (status);
CREATE INDEX IF NOT EXISTS idx_offers_created_at ON offers (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offers_company_canon ON offers (company_canon);
-- Index ANN cosinus (HNSW) : recherche du plus proche voisin pour la dédup
-- sémantique (ORDER BY embedding <=> $1). Ne couvre que les lignes embedded.
CREATE INDEX IF NOT EXISTS idx_offers_embedding ON offers USING hnsw (embedding vector_cosine_ops);

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
    apply_url    TEXT,                            -- lien de contact LBA (candidature spontanée)
    phone        TEXT,                            -- téléphone de contact (LBA, si fourni)
    email        TEXT,                            -- email de contact (source officielle, si fourni)
    last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pour les bases déjà créées avant ces colonnes (idempotent).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS apply_url TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS email TEXT;

-- ---------------------------------------------------------------------
-- applications : suivi des candidatures
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS applications (
    id          SERIAL PRIMARY KEY,
    -- offer_id NULL = candidature SPONTANÉE (entreprise visée sans offre publiée).
    offer_id    INTEGER REFERENCES offers (id) ON DELETE CASCADE,
    company_id  INTEGER REFERENCES companies (id) ON DELETE SET NULL,
    kind        TEXT NOT NULL DEFAULT 'offer'
                CHECK (kind IN ('offer', 'spontaneous')),
    status      TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'sent', 'interview', 'rejected', 'accepted')),
    applied_at  TIMESTAMPTZ,
    response_at TIMESTAMPTZ,                      -- NULL tant que pas de réponse (relances V2)
    notes       TEXT
);

-- Pour les bases déjà créées (idempotent) : autoriser la candidature spontanée.
ALTER TABLE applications ALTER COLUMN offer_id DROP NOT NULL;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'offer';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applications_kind_check') THEN
    ALTER TABLE applications ADD CONSTRAINT applications_kind_check CHECK (kind IN ('offer', 'spontaneous'));
  END IF;
END $$;

-- Suivi des réponses (page « Mes candidatures ») : champs dénormalisés pour que
-- la candidature survive à la suppression d'une offre périmée, + relance + sync.
ALTER TABLE applications ADD COLUMN IF NOT EXISTS poste       TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS entreprise  TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS lien        TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS score       INTEGER;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ;   -- « relancée »
ALTER TABLE applications ADD COLUMN IF NOT EXISTS airtable_id TEXT;          -- id de ligne Airtable (sync)

-- Ne pas perdre l'historique quand on supprime une offre : SET NULL au lieu de CASCADE.
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname FROM pg_constraint
   WHERE conrelid = 'applications'::regclass AND contype = 'f'
     AND pg_get_constraintdef(oid) LIKE '%offer_id%REFERENCES offers%';
  IF cname IS NOT NULL AND pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = cname)) LIKE '%CASCADE%' THEN
    EXECUTE 'ALTER TABLE applications DROP CONSTRAINT ' || quote_ident(cname);
    ALTER TABLE applications ADD CONSTRAINT applications_offer_id_fkey
      FOREIGN KEY (offer_id) REFERENCES offers (id) ON DELETE SET NULL;
  END IF;
END $$;

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
