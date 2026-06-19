// Tests des payloads de rendu — exécuter : node workflows/lib/render-payloads.test.mjs
import assert from "node:assert/strict";
import { buildCvPayload, buildLetterPayload, buildFinalisationInput } from "./render-payloads.mjs";

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

const AGENT = {
  score: 82,
  lettre_motivation: "Madame, Monsieur,\n\nBonjour.\n\nAlex Martin",
  objet_email: "Candidature — Dev IA Junior",
  personnalisation_cv: {
    summary: "Dev IA junior orienté RAG.",
    highlight_skills: ["Python", "RAG / LLM"],
    highlight_projects: ["rag-assistant"],
    highlight_experiences: ["stage-data"],
    hidden_sections: [],
  },
};

t("buildCvPayload recopie la personnalisation, application_id en string", () => {
  const out = buildCvPayload({ application_id: 7, personnalisation_cv: AGENT.personnalisation_cv });
  assert.equal(out.application_id, "7");
  assert.deepEqual(out.personalization.highlight_skills, ["Python", "RAG / LLM"]);
  assert.equal(out.personalization.summary, "Dev IA junior orienté RAG.");
});

t("buildCvPayload tolère une personnalisation absente/partielle", () => {
  const out = buildCvPayload({ application_id: 1 });
  assert.deepEqual(out.personalization, {
    summary: "", highlight_skills: [], highlight_projects: [],
    highlight_experiences: [], hidden_sections: [],
  });
});

t("buildCvPayload n'invente rien : aucune clé hors contrat", () => {
  const out = buildCvPayload({ application_id: 1, personnalisation_cv: { foo: "bar", highlight_skills: ["X"] } });
  assert.deepEqual(Object.keys(out.personalization).sort(), [
    "hidden_sections", "highlight_experiences", "highlight_projects", "highlight_skills", "summary",
  ]);
});

t("buildLetterPayload prend le texte de l'agent tel quel", () => {
  const out = buildLetterPayload({
    application_id: 7, company: "NovaTech",
    subject: AGENT.objet_email, body: AGENT.lettre_motivation,
  });
  assert.equal(out.application_id, "7");
  assert.equal(out.company, "NovaTech");
  assert.equal(out.subject, "Candidature — Dev IA Junior");
  assert.equal(out.body, AGENT.lettre_motivation);
  assert.ok(!("date" in out), "date omise si non fournie");
});

t("buildLetterPayload inclut date si fournie", () => {
  const out = buildLetterPayload({ application_id: 1, date: "Lyon, le 19 juin 2026" });
  assert.equal(out.date, "Lyon, le 19 juin 2026");
});

t("buildFinalisationInput mappe les chemins PDF vers l'entrée du workflow 04", () => {
  const out = buildFinalisationInput({
    company: "NovaTech",
    cv_path: "/output/app-7/cv.pdf",
    letter_path: "/output/app-7/lettre.pdf",
    subject: "Candidature", body: "…",
  });
  assert.equal(out.cv_path, "/output/app-7/cv.pdf");
  assert.equal(out.letter_path, "/output/app-7/lettre.pdf");
  assert.equal(out.to_email, "");
});

console.log(`\n${passed} tests OK (render-payloads)`);
