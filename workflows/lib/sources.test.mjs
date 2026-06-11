// Tests des normaliseurs — exécuter : node workflows/lib/sources.test.mjs
import assert from "node:assert/strict";
import {
  normalizeAdzuna,
  normalizeFranceTravail,
  normalizeJobSpy,
  normalizeWTTJ,
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
});

console.log(`\n${passed} tests sources OK`);
