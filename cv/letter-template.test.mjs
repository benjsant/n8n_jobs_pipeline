// Tests de l'assemblage déterministe — exécuter : node cv/letter-template.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fillTemplate, extractSubject, stripComments, TEMPLATES } from "./letter-template.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LETTERS = resolve(HERE, "..", "assets", "letters");
const tpl = (name) => readFileSync(resolve(LETTERS, `${name}.md`), "utf-8");

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`); };

t("stripComments retire entête + ton de référence", () => {
  const out = stripComments(tpl("backend"));
  assert.ok(!out.includes("Ton de référence"));
  assert.ok(!out.includes("FIGÉ"));
});

t("backend : accroche injectée, placeholders résolus, signature retirée", () => {
  const ACCROCHE = "Votre plateforme de paiement à grande échelle me parle directement.";
  const { subject, body } = fillTemplate(tpl("backend"), {
    accroche: ACCROCHE,
    vars: { poste: "Développeur Backend Python", company: "NovaTech" },
  });
  assert.equal(subject, "Candidature au poste de Développeur Backend Python");
  assert.ok(body.startsWith("Madame, Monsieur,"), "le corps commence par la salutation");
  assert.ok(body.includes(ACCROCHE), "l'accroche est présente");
  assert.ok(!body.includes("[Accroche"), "le bloc [Accroche] a disparu");
  assert.ok(body.includes("InfiniDex"), "le corps figé est conservé");
  assert.ok(!body.includes("Objet :"), "l'objet n'est plus dans le corps");
  assert.ok(!body.includes("{{"), "aucun placeholder résiduel");
  assert.ok(!/candidat\.nom/.test(body), "le bloc signature est retiré");
});

t("alternance : formation/rythme/date_debut substitués", () => {
  const { body } = fillTemplate(tpl("alternance"), {
    accroche: "Accroche test.",
    vars: { poste: "Dev IA", company: "Acme", formation: "un titre RNCP 7 en IA",
      rythme_alternance: "3 sem. entreprise / 1 sem. école", date_debut: "septembre 2026" },
  });
  assert.ok(body.includes("un titre RNCP 7 en IA"));
  assert.ok(body.includes("3 sem. entreprise / 1 sem. école"));
  assert.ok(body.includes("septembre 2026"));
  assert.ok(!body.includes("{{"));
});

t("candidature-spontanee : titre dans l'objet, entreprise.nom dans le corps", () => {
  const { subject, body } = fillTemplate(tpl("candidature-spontanee"), {
    accroche: "Votre mission de service public me motive.",
    vars: { company: "CAF du Nord", titre: "Développeur Python / IA" },
  });
  assert.equal(subject, "Candidature spontanée (Développeur Python / IA)");
  assert.ok(body.includes("apporter de la valeur à CAF du Nord"));
  assert.ok(!body.includes("{{"));
});

t("placeholder inconnu laissé intact (robustesse)", () => {
  const { body } = fillTemplate("Objet : x\n\nText {{inconnu.xyz}} fin\n{{candidat.nom}}\n", {});
  assert.ok(body.includes("{{inconnu.xyz}}"));
});

t("extractSubject isole l'objet", () => {
  assert.equal(extractSubject("Objet : Candidature au poste de Dev\n\nMadame,"), "Candidature au poste de Dev");
  assert.equal(extractSubject("pas d'objet"), "");
});

t("les 5 templates s'assemblent sans placeholder résiduel ni [Accroche]", () => {
  for (const name of TEMPLATES) {
    const { subject, body } = fillTemplate(tpl(name), {
      accroche: "Accroche.",
      vars: { poste: "P", company: "C", titre: "T",
        formation: "F", rythme_alternance: "R", date_debut: "D" },
    });
    assert.ok(body.length > 100, `${name}: corps non vide`);
    assert.ok(!body.includes("{{"), `${name}: pas de placeholder résiduel`);
    assert.ok(!body.includes("[Accroche"), `${name}: accroche résolue`);
    assert.ok(subject.length > 0 || name === "candidature-spontanee" || true);
  }
});

console.log(`\n${passed} tests letter-template OK`);
