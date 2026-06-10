// Tests de offer-utils — exécuter : node workflows/lib/offer-utils.test.mjs
import assert from "node:assert/strict";
import { computeHash, scoreOffer, annotate, norm } from "./offer-utils.mjs";

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

t("hash identique pour title/company/location équivalents (casse/espaces)", () => {
  const a = { title: "Dev IA", company: "NovaTech", location: "Lyon" };
  const b = { title: "  dev   ia ", company: "novatech", location: "LYON" };
  assert.equal(computeHash(a), computeHash(b));
});

t("hash différent si l'entreprise change", () => {
  const a = { title: "Dev IA", company: "NovaTech", location: "Lyon" };
  const b = { title: "Dev IA", company: "Autre", location: "Lyon" };
  assert.notEqual(computeHash(a), computeHash(b));
});

t("offre IA junior remote CDI à Lyon = score élevé", () => {
  const o = {
    title: "Développeur IA Junior",
    description: "Python, machine learning, LLM. Télétravail possible.",
    contract_type: "CDI",
    location: "Lyon",
    salary: "35000-42000",
  };
  const s = scoreOffer(o);
  assert.ok(s >= 80, `attendu >=80, reçu ${s}`);
});

t("offre senior hors sujet = score faible", () => {
  const o = {
    title: "Senior Sales Manager",
    description: "5 ans d'expérience en vente B2B.",
    contract_type: "CDI",
    location: "Paris",
    salary: "",
  };
  const s = scoreOffer(o);
  assert.ok(s <= 35, `attendu <=35, reçu ${s}`);
});

t("score borné 0-100", () => {
  const o = {
    title: "IA machine learning data LLM python développeur junior alternance",
    description: "intelligence artificielle ml data llm python remote télétravail",
    contract_type: "CDI alternance CDD",
    location: "Lyon remote",
    salary: "40000",
  };
  const s = scoreOffer(o);
  assert.ok(s >= 0 && s <= 100, `hors bornes: ${s}`);
});

t("annotate ajoute hash + score", () => {
  const o = { title: "Dev IA", company: "X", location: "Lyon", description: "python" };
  const a = annotate(o);
  assert.ok(a.hash && typeof a.score === "number");
});

t("norm gère null/undefined", () => {
  assert.equal(norm(null), "");
  assert.equal(norm(undefined), "");
});

console.log(`\n${passed} tests offer-utils OK`);
