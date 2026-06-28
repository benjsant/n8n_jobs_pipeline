// Tests des normaliseurs — exécuter : node workflows/lib/sources.test.mjs
import assert from "node:assert/strict";
import {
  normalizeAdzuna,
  normalizeFranceTravail,
  normalizeJobSpy,
  normalizeWTTJ,
  normalizeGoogleJobs,
  normalizeJSearch,
  normalizeLaBonneAlternanceJobs,
  normalizeLBARecruiters,
} from "./sources.mjs";
import { annotate } from "./offer-utils.mjs";

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

const REQUIRED = ["source", "source_id", "title", "company", "location",
  "contract_type", "salary", "description", "url"];
const shapeOk = (o) => REQUIRED.every((k) => k in o);

t("Adzuna -> schéma commun", () => {
  const out = normalizeAdzuna({
    results: [{
      id: "42", title: "Dev IA", description: "python",
      company: { display_name: "NovaTech" },
      location: { display_name: "Lyon" },
      contract_time: "permanent", salary_min: 38000,
      redirect_url: "https://adzuna/x",
    }],
  });
  assert.equal(out.length, 1);
  assert.ok(shapeOk(out[0]));
  assert.equal(out[0].source, "adzuna");
  assert.equal(out[0].company, "NovaTech");
  assert.equal(out[0].salary, "38000");
});

t("France Travail -> schéma commun", () => {
  const out = normalizeFranceTravail({
    resultats: [{
      id: "FT1", intitule: "Ingénieur ML", description: "ml",
      entreprise: { nom: "Acme" },
      lieuTravail: { libelle: "75 - Paris" },
      typeContrat: "CDI", salaire: { libelle: "40k€" },
      origineOffre: { urlOrigine: "https://ft/x" },
    }],
  });
  assert.ok(shapeOk(out[0]));
  assert.equal(out[0].source, "france_travail");
  assert.equal(out[0].location, "75 - Paris");
  assert.equal(out[0].url, "https://ft/x");
});

t("France Travail -> payload RÉEL (forme vérifiée sur un workflow qui tourne)", () => {
  // Structure confirmée par un workflow n8n France Travail fonctionnel :
  // resultats[].{id, intitule, description, origineOffre.urlOrigine,
  // entreprise.nom, lieuTravail.libelle, dateCreation, typeContratLibelle, salaire.libelle}
  const out = normalizeFranceTravail({
    resultats: [{
      id: "189ABCD", intitule: "Développeur Python (H/F)",
      description: "Conception d'APIs FastAPI.",
      origineOffre: { urlOrigine: "https://candidat.francetravail.fr/offres/189ABCD" },
      entreprise: { nom: "NovaTech" },
      lieuTravail: { libelle: "59 - LILLE" },
      dateCreation: "2026-06-18T09:00:00.000Z",
      typeContratLibelle: "Contrat à durée indéterminée",
      salaire: { libelle: "Annuel de 38000,00 Euros à 42000,00 Euros" },
    }],
  });
  assert.ok(shapeOk(out[0]));
  assert.equal(out[0].source_id, "189ABCD");
  assert.equal(out[0].title, "Développeur Python (H/F)");
  assert.equal(out[0].company, "NovaTech");
  assert.equal(out[0].location, "59 - LILLE");
  assert.equal(out[0].contract_type, "Contrat à durée indéterminée"); // typeContratLibelle
  assert.equal(out[0].salary, "Annuel de 38000,00 Euros à 42000,00 Euros");
  assert.equal(out[0].url, "https://candidat.francetravail.fr/offres/189ABCD");
});

t("JobSpy (déjà normalisé) -> revalidé", () => {
  const out = normalizeJobSpy({
    count: 1,
    offers: [{ source: "jobspy:indeed", source_id: "abc", title: "ML Eng",
      company: "X", location: "Lyon", contract_type: "fulltime",
      salary: "30000-40000", description: "d", url: "https://j/1" }],
  });
  assert.ok(shapeOk(out[0]));
  assert.equal(out[0].source, "jobspy:indeed");
});

t("JobSpy : source_id retombe sur l'url si absent", () => {
  const out = normalizeJobSpy({ offers: [{ title: "X", url: "https://j/2" }] });
  assert.equal(out[0].source_id, "https://j/2");
});

t("WTTJ RSS : extrait l'entreprise d'un titre 'Poste - Entreprise'", () => {
  const out = normalizeWTTJ([
    { title: "Développeur IA - NovaTech", link: "https://wttj/1",
      contentSnippet: "desc", guid: "g1" },
    { title: "Sans entreprise", link: "https://wttj/2" },
  ]);
  assert.equal(out[0].title, "Développeur IA");
  assert.equal(out[0].company, "NovaTech");
  assert.equal(out[0].source, "wttj");
  assert.equal(out[1].company, ""); // pas de séparateur -> pas d'entreprise
});

t("Google Jobs (SerpApi) -> schéma commun", () => {
  const out = normalizeGoogleJobs({
    jobs_results: [{
      job_id: "gj1", title: "Dev IA", company_name: "NovaTech",
      location: "Lille, France", description: "python ml",
      detected_extensions: { schedule_type: "Full-time", salary: "40k€" },
      apply_options: [{ link: "https://g/apply" }],
    }],
  });
  assert.ok(shapeOk(out[0]));
  assert.equal(out[0].source, "google_jobs");
  assert.equal(out[0].company, "NovaTech");
  assert.equal(out[0].contract_type, "Full-time");
  assert.equal(out[0].url, "https://g/apply");
});

t("JSearch (RapidAPI) -> schéma commun (forme réelle)", () => {
  // Forme confirmée par un workflow n8n JSearch fonctionnel :
  // data[].{job_id, job_title, job_description, job_apply_link/job_google_link,
  // employer_name, job_city/job_location, job_employment_type, job_salary_string, job_publisher}
  const out = normalizeJSearch({
    data: [{
      job_id: "abc123", job_title: "Développeur Python", job_description: "FastAPI, RAG",
      job_apply_link: "https://apply/abc", job_google_link: "https://g/abc",
      employer_name: "NovaTech", job_city: "Lille", job_location: "Lille, France",
      job_employment_type: "FULLTIME", job_salary_string: "40k€-45k€",
      job_publisher: "LinkedIn",
    }],
  });
  assert.ok(shapeOk(out[0]));
  assert.equal(out[0].source, "jsearch:linkedin");
  assert.equal(out[0].source_id, "abc123");
  assert.equal(out[0].title, "Développeur Python");
  assert.equal(out[0].company, "NovaTech");
  assert.equal(out[0].location, "Lille");
  assert.equal(out[0].contract_type, "FULLTIME");
  assert.equal(out[0].url, "https://apply/abc"); // apply_link prioritaire
});

t("La Bonne Alternance (jobs) -> schéma commun", () => {
  const out = normalizeLaBonneAlternanceJobs({
    jobs: [{
      identifier: { id: "lba-1", partner_job_id: "p1" },
      workplace: { name: "NovaTech", brand: "NovaTech IA", siret: "123",
        location: { address: "59000 Lille" } },
      contract: { type: ["Apprentissage", "Professionnalisation"] },
      offer: { title: "Alternant Dev IA", description: "Python, ML" },
      apply: { url: "https://lba/apply/1" },
    }],
  });
  assert.equal(out.length, 1);
  assert.ok(shapeOk(out[0]));
  assert.equal(out[0].source, "la_bonne_alternance");
  assert.equal(out[0].source_id, "lba-1");
  assert.equal(out[0].company, "NovaTech IA"); // brand prioritaire
  assert.equal(out[0].location, "59000 Lille");
  assert.equal(out[0].contract_type, "Apprentissage, Professionnalisation");
  assert.equal(out[0].url, "https://lba/apply/1");
});

t("La Bonne Alternance (jobs) : contrat absent -> 'Alternance' par défaut", () => {
  const out = normalizeLaBonneAlternanceJobs({
    jobs: [{ identifier: { id: "x" }, offer: { title: "T" }, workplace: {} }],
  });
  assert.equal(out[0].contract_type, "Alternance");
});

t("La Bonne Alternance (recruteurs) -> fiche entreprise (candidature spontanée)", () => {
  const out = normalizeLBARecruiters({
    recruiters: [{
      identifier: { id: "r1" },
      workplace: { name: "Acme", siret: "98765", website: "https://acme.fr",
        domain: { naf: { label: "Programmation informatique" } },
        location: { address: "59300 Valenciennes" } },
      apply: { url: "https://lba/contact/r1", phone: "0102030405" },
    }],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].name, "Acme");
  assert.equal(out[0].siret, "98765");
  assert.equal(out[0].sector, "Programmation informatique");
  assert.equal(out[0].website, "https://acme.fr");
  assert.equal(out[0].location, "59300 Valenciennes");
  assert.equal(out[0].apply_url, "https://lba/contact/r1");
});

t("La Bonne Alternance : payloads vides -> tableaux vides", () => {
  assert.deepEqual(normalizeLaBonneAlternanceJobs({}), []);
  assert.deepEqual(normalizeLBARecruiters(undefined), []);
});

// ── Échantillons RÉELS de l'API (capturés le 2026-06-28, auth Bearer, zone
//    Valenciennes/Lille, rome M1805). Verrouillent la forme vérifiée contre
//    une régression du normaliseur (comme FT/JSearch). ────────────────────────
t("La Bonne Alternance (recruteurs) : forme réelle de l'API verrouillée", () => {
  const real = {
    jobs: [], warnings: [],
    recruiters: [{
      identifier: { id: "6a003c7c9a6be614e48e332b" },
      workplace: {
        siret: "52171530000054", brand: "BUSINESS APTITUDE",
        legal_name: "BUSINESS APTITUDE", website: null, name: "BUSINESS APTITUDE",
        description: null, size: "6-9",
        location: { address: "133 rue de Lille 59300 VALENCIENNES",
          geopoint: { coordinates: [3.5215, 50.3619], type: "Point" } },
        domain: { idcc: 1486, opco: "ATLAS",
          naf: { code: "6201Z", label: "Programmation informatique" } },
      },
      apply: { url: "https://labonnealternance.apprentissage.beta.gouv.fr/emploi/recruteurs_lba/52171530000054/business-aptitude",
        phone: "0366597000", recipient_id: "partners_6a003c7c9a6be614e48e332b" },
    }],
  };
  const out = normalizeLBARecruiters(real);
  assert.equal(out.length, 1);
  assert.equal(out[0].source_id, "6a003c7c9a6be614e48e332b");
  assert.equal(out[0].name, "BUSINESS APTITUDE");
  assert.equal(out[0].siret, "52171530000054");
  assert.equal(out[0].sector, "Programmation informatique"); // domain.naf.label
  assert.equal(out[0].website, ""); // null -> chaîne vide (défensif)
  assert.equal(out[0].location, "133 rue de Lille 59300 VALENCIENNES");
  assert.ok(out[0].apply_url.includes("recruteurs_lba"));
  assert.equal(out[0].phone, "0366597000");
});

t("La Bonne Alternance (jobs) : forme réelle (job partenaire FT) verrouillée", () => {
  const real = {
    recruiters: [], warnings: [],
    jobs: [{
      identifier: { id: "6a40507d1f2518e8d1c3bded", partner_label: "France Travail", partner_job_id: "4307479" },
      workplace: { siret: null, brand: null, legal_name: null, website: null, name: null,
        description: "ONE EDUCATION, école…", size: null,
        location: { address: "59100 Roubaix" }, domain: { idcc: null, opco: null, naf: null } },
      apply: { url: "https://www.meteojob.com/jobs/51409157", phone: null, recipient_id: null },
      contract: { start: null, duration: 12, type: ["Apprentissage"], remote: null },
      offer: { title: "Développeur / Développeuse informatique (H/F)", rome_codes: ["M1805"],
        description: "Description du poste : …", status: "Active" },
    }],
  };
  const out = normalizeLaBonneAlternanceJobs(real);
  assert.equal(out.length, 1);
  assert.ok(shapeOk(out[0]));
  assert.equal(out[0].source_id, "6a40507d1f2518e8d1c3bded");
  assert.equal(out[0].title, "Développeur / Développeuse informatique (H/F)");
  assert.equal(out[0].contract_type, "Apprentissage");
  assert.equal(out[0].location, "59100 Roubaix");
  assert.ok(out[0].url.includes("meteojob"));
  // ⚠️ Jobs partenaires (FT) : brand/name/legal_name null -> company vide.
  // Dégradation propre (pas de crash) ; pas d'invention de nom d'entreprise.
  assert.equal(out[0].company, "");
});

t("sorties normalisées sont annotables (hash + score)", () => {
  const out = normalizeAdzuna({
    results: [{ id: "1", title: "Dev IA junior", description: "python remote",
      company: { display_name: "X" }, location: { display_name: "Lyon" },
      redirect_url: "u" }],
  });
  const a = annotate(out[0]);
  assert.ok(a.hash && typeof a.score === "number");
});

t("payload vide -> tableau vide (robustesse)", () => {
  assert.deepEqual(normalizeAdzuna({}), []);
  assert.deepEqual(normalizeFranceTravail(undefined), []);
  assert.deepEqual(normalizeJobSpy({}), []);
  assert.deepEqual(normalizeWTTJ(undefined), []);
  assert.deepEqual(normalizeGoogleJobs({}), []);
});

console.log(`\n${passed} tests sources OK`);
