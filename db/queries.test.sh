#!/usr/bin/env bash
# Test d'intégration de la couche candidature : applique db/schema.sql dans un
# conteneur Postgres jetable, puis exerce le parcours complet d'une candidature
# (new -> selected -> applied) avec assertions. Aucune dépendance sur la stack.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

CT="jh-queries-test-$$"
cleanup() { docker rm -f "$CT" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "── démarrage Postgres jetable"
docker run --rm -d --name "$CT" -e POSTGRES_PASSWORD=test -e POSTGRES_DB=testdb \
  postgres:16-alpine >/dev/null
for _ in $(seq 1 20); do
  docker exec "$CT" pg_isready -U postgres -d testdb >/dev/null 2>&1 && break; sleep 1
done

echo "── application du schéma"
docker exec -i "$CT" psql -q -U postgres -d testdb -v ON_ERROR_STOP=1 < db/schema.sql >/dev/null

echo "── parcours candidature + assertions"
docker exec -i "$CT" psql -q -U postgres -d testdb -v ON_ERROR_STOP=1 <<'SQL'
-- 1) une offre arrive (status new)
INSERT INTO offers (source, hash, title, company, location, score)
VALUES ('adzuna', 'hash-abc', 'Dev IA Junior', 'NovaTech', 'Lyon', 82);

-- 2) action Discord "selected" (set_offer_status)
UPDATE offers SET status = 'selected' WHERE hash = 'hash-abc';

-- 3) upsert company (deux fois -> doit rester une seule ligne, même id)
INSERT INTO companies (name, website, last_updated)
VALUES ('NovaTech', 'https://nova.tech', now())
ON CONFLICT (name) DO UPDATE SET last_updated = now();
INSERT INTO companies (name, website, last_updated)
VALUES ('NovaTech', '', now())
ON CONFLICT (name) DO UPDATE SET last_updated = now();

-- 4) créer la candidature (draft), liée à l'offre + l'entreprise
INSERT INTO applications (offer_id, company_id, status, notes)
SELECT o.id, c.id, 'draft', 'score 82, bon match'
FROM offers o, companies c
WHERE o.hash = 'hash-abc' AND c.name = 'NovaTech';

-- 5) documents générés
INSERT INTO generated_documents (application_id, cv_path, letter_path)
SELECT id, '/drive/NovaTech/cv.pdf', '/drive/NovaTech/lettre.pdf'
FROM applications LIMIT 1;

-- 6) transitions : candidature draft -> sent, offre selected -> applied
UPDATE applications SET status = 'sent', applied_at = now();
UPDATE offers SET status = 'applied' WHERE hash = 'hash-abc';

-- ---- assertions (lèvent une exception si faux) ----
DO $$
DECLARE n int; s text;
BEGIN
  SELECT count(*) INTO n FROM companies WHERE name = 'NovaTech';
  IF n <> 1 THEN RAISE EXCEPTION 'upsert: % entreprises (attendu 1)', n; END IF;

  SELECT count(*) INTO n FROM applications;
  IF n <> 1 THEN RAISE EXCEPTION 'applications: % (attendu 1)', n; END IF;

  SELECT count(*) INTO n FROM generated_documents;
  IF n <> 1 THEN RAISE EXCEPTION 'documents: % (attendu 1)', n; END IF;

  SELECT status INTO s FROM offers WHERE hash = 'hash-abc';
  IF s <> 'applied' THEN RAISE EXCEPTION 'offre status=% (attendu applied)', s; END IF;

  SELECT status INTO s FROM applications LIMIT 1;
  IF s <> 'sent' THEN RAISE EXCEPTION 'candidature status=% (attendu sent)', s; END IF;

  -- intégrité référentielle : la candidature pointe bien sur offre + entreprise
  PERFORM 1 FROM applications a
    JOIN offers o ON o.id = a.offer_id
    JOIN companies c ON c.id = a.company_id
    WHERE o.hash = 'hash-abc' AND c.name = 'NovaTech';
  IF NOT FOUND THEN RAISE EXCEPTION 'jointures application/offre/entreprise KO'; END IF;

  RAISE NOTICE 'OK: parcours new->selected->applied conforme';
END $$;
SQL

echo "✅ Test d'intégration candidature : OK"
