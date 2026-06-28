// Tests de offer-utils — exécuter : node workflows/lib/offer-utils.test.mjs
import assert from "node:assert/strict";
import { computeHash, scoreOffer, annotate, norm,
  prefsFromProfile, matchesExclusions, canonTitle,
  cosineSim, embeddingText, semanticDupDecision, SEMANTIC_DUP_THRESHOLD } from "./offer-utils.mjs";

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

// --- Scoring piloté par le profil + exclusions + dédup canonicalisée ---

t("dédup canonicalisée : '(H/F)' et 'F/H' donnent le même hash", () => {
  const a = { title: "Développeur Python (H/F)", company: "NovaTech SAS", location: "59 - LILLE" };
  const b = { title: "Développeur Python F/H", company: "NovaTech", location: "Lille, France" };
  assert.equal(computeHash(a), computeHash(b));
});

t("prefsFromProfile : keywords/must_have/contrats/exclusions/seniority", () => {
  const p = prefsFromProfile({
    keywords: "dev python", must_have: "FastAPI, PostgreSQL",
    contract_types: "CDI, alternance", exclusions: "5 ans, php",
    seniority: "junior",
  });
  assert.ok(p.keywords.includes("python") && p.keywords.includes("fastapi"));
  assert.deepEqual(p.contractTypes, ["cdi", "alternance"]);
  assert.deepEqual(p.exclusions, ["5 ans", "php"]);
  assert.equal(p.seniority, "junior");
});

t("exclusions = filtre dur (matchesExclusions + annotate.excluded)", () => {
  const prefs = prefsFromProfile({ keywords: "python", exclusions: "php, 5 ans" });
  const phpOffer = { title: "Dev PHP Symfony", description: "Symfony 6", contract_type: "CDI", location: "Lille" };
  assert.equal(matchesExclusions(phpOffer, prefs.exclusions), true);
  assert.equal(annotate(phpOffer, prefs).excluded, true);
  const okOffer = { title: "Dev Python", description: "FastAPI", contract_type: "CDI", location: "Lille" };
  assert.equal(annotate(okOffer, prefs).excluded, false);
});

t("séniorité du profil oriente le score (senior demandé vs offre junior)", () => {
  const offerJunior = { title: "Développeur Python Junior", description: "python débutant", contract_type: "CDI", location: "Lille", salary: "" };
  const wantJunior = prefsFromProfile({ keywords: "python", seniority: "junior" });
  const wantSenior = prefsFromProfile({ keywords: "python", seniority: "senior" });
  assert.ok(scoreOffer(offerJunior, wantJunior) > scoreOffer(offerJunior, wantSenior),
    "une offre junior doit mieux scorer pour un profil junior que senior");
});

t("offre hors profil (Lille, Python) ne dépend plus de 'Lyon' en dur", () => {
  const prefs = prefsFromProfile({ keywords: "python, fastapi, ia", contract_types: "CDI", seniority: "" });
  const o = { title: "Développeur Python / IA", description: "FastAPI, RAG, télétravail", contract_type: "CDI", location: "Lille", salary: "40k" };
  assert.ok(scoreOffer(o, prefs) >= 80, "offre alignée profil à Lille doit bien scorer");
});

// ── Déduplication sémantique (cosineSim + semanticDupDecision) ────────────────
t("cosineSim : vecteurs identiques -> 1, orthogonaux -> 0, opposés -> -1", () => {
  assert.ok(Math.abs(cosineSim([1, 2, 3], [1, 2, 3]) - 1) < 1e-9);
  assert.ok(Math.abs(cosineSim([1, 0], [0, 1])) < 1e-9);
  assert.ok(Math.abs(cosineSim([1, 1], [-1, -1]) + 1) < 1e-9);
});

t("cosineSim : dimensions incompatibles ou vecteur nul -> 0", () => {
  assert.equal(cosineSim([1, 2], [1, 2, 3]), 0);
  assert.equal(cosineSim([0, 0], [1, 2]), 0);
  assert.equal(cosineSim("x", [1]), 0);
});

t("embeddingText : même texte pour des champs équivalents, borne la description", () => {
  const a = embeddingText({ title: "Dev Python", company: "Acme", location: "Lille", description: "x".repeat(2000) });
  assert.ok(a.startsWith("Dev Python \n Acme \n Lille"));
  assert.ok(a.length < 600); // description tronquée à 500
  // champs vides ignorés (pas de séparateurs orphelins)
  assert.equal(embeddingText({ title: "T", company: "", location: "", description: "" }), "T");
});

t("semanticDupDecision : forte similarité + même entreprise -> doublon", () => {
  const v1 = [1, 0.9, 0.2], v2 = [1, 0.92, 0.19];
  const sim = cosineSim(v1, v2);
  const d = semanticDupDecision(sim, { company: "NovaTech SAS" }, { company: "novatech" });
  assert.ok(sim >= SEMANTIC_DUP_THRESHOLD);
  assert.equal(d.isDup, true);
  assert.equal(d.sameCompany, true);
});

t("semanticDupDecision : forte similarité mais entreprise différente -> PAS doublon", () => {
  const d = semanticDupDecision(0.99, { company: "NovaTech" }, { company: "Capgemini" });
  assert.equal(d.isDup, false);
  assert.match(d.reason, /entreprise différente/);
});

t("semanticDupDecision : similarité sous le seuil -> distinct", () => {
  const d = semanticDupDecision(0.5, { company: "Acme" }, { company: "Acme" });
  assert.equal(d.isDup, false);
  assert.match(d.reason, /distinct/);
});

t("semanticDupDecision : entreprise manquante d'un côté -> ne bloque pas", () => {
  const d = semanticDupDecision(0.95, { company: "" }, { company: "Acme" });
  assert.equal(d.sameCompany, true);
  assert.equal(d.isDup, true);
});

console.log(`\n${passed} tests offer-utils OK`);
