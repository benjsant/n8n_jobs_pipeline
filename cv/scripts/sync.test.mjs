// Tests du sync portfolio (fonctions pures) — node cv/scripts/sync.test.mjs
import assert from "node:assert/strict";
import { slugify, extractCvObject, mapCv, yearRange } from "./sync-from-portfolio.mjs";

let passed = 0;
const t = async (name, fn) => { await fn(); passed++; console.log(`  ✓ ${name}`); };

const FIXTURE = `
export interface CVData { header: any }
export const cv: CVData = {
  header: { name: 'Jane Doe', role: 'Dev', summary: "Résumé." },
  contact: [
    { label: 'Mail', value: 'jane@example.com', href: 'mailto:jane@example.com' },
    { label: 'GitHub', value: 'github.com/jane', href: 'https://github.com/jane' },
    { label: 'LinkedIn', value: 'in/jane', href: 'https://linkedin.com/in/jane' },
  ],
  details: [{ label: 'Mobilité', value: 'Lille' }],
  skills: [
    { category: 'Langages', value: 'Python, JavaScript' },
    { category: 'IA générative', value: 'RAG, Agents IA (ReAct, tool-calling), DeepSeek' },
    { category: 'Langues', value: 'Français courant, Anglais technique' },
  ],
  projects: [{ title: 'CoolApp – une appli', repo: 'https://github.com/jane/coolapp', period: '2026', stack: 'Python · FastAPI', description: 'Desc.' }],
  experiences: [{ org: 'ACME – Paris', role: 'Dev', date: 'Jan 2020 – Jan 2022', tasks: ['Tâche 1'], stack: 'PHP · Symfony' }],
  education: [{ date: '2019', title: 'BTS SIO, option SLAM', school: 'Lycée X' }],
  certifications: [{ date: '2025', title: 'Méthodes agiles' }],
};
`;

await t("slugify gère accents / segments", () => {
  assert.equal(slugify("InfiniDex – Pokédex"), "infinidex-pokedex");
  assert.equal(slugify("CAF du Nord"), "caf-du-nord");
});

await t("yearRange étend une plage abrégée (2025–26)", () => {
  assert.deepEqual(yearRange("2025–26"), ["2025", "2026"]);
  assert.deepEqual(yearRange("2015–17"), ["2015", "2017"]);
  assert.deepEqual(yearRange("Mai 2016 – Mai 2019"), ["2016", "2019"]);
});

await t("split compétences respecte les parenthèses", async () => {
  const out = mapCv(await extractCvObject(FIXTURE));
  const gen = out.skills.categories.find((c) => c.name === "IA générative");
  const names = gen.items.map((i) => i.name);
  assert.ok(names.includes("Agents IA (ReAct, tool-calling)"), names.join(" | "));
  assert.ok(!names.includes("tool-calling)"));
});

await t("extractCvObject lit l'objet du TS", async () => {
  const cv = await extractCvObject(FIXTURE);
  assert.equal(cv.header.name, "Jane Doe");
  assert.equal(cv.projects.length, 1);
});

await t("mapCv mappe vers le schéma cv/*.json", async () => {
  const cv = await extractCvObject(FIXTURE);
  const out = mapCv(cv);
  assert.equal(out.profile.name, "Jane Doe");
  assert.equal(out.profile.email, "jane@example.com");
  assert.equal(out.profile.links.github, "https://github.com/jane");
  assert.equal(out.profile.location, "Lille");
  assert.equal(out.projects.projects[0].id, "coolapp");
  assert.deepEqual(out.projects.projects[0].tech, ["Python", "FastAPI"]);
  assert.equal(out.experiences.experiences[0].id, "acme");
  assert.equal(out.experiences.experiences[0].start, "2020");
  assert.equal(out.experiences.experiences[0].end, "2022");
  assert.ok(out.experiences.experiences[0].bullets.includes("Stack : PHP, Symfony"));
  assert.equal(out.education.education[0].id, "bts-sio-option");
  // Langues sorties à part, pas dans skills
  assert.ok(!out.skills.categories.some((c) => /langue/i.test(c.name)));
  assert.deepEqual(out.languages.languages, [
    { name: "Français", level: "Courant" }, { name: "Anglais", level: "Technique" },
  ]);
});

await t("anti-invention : pas de téléphone => champ vide", async () => {
  const out = mapCv(await extractCvObject(FIXTURE));
  assert.equal(out.profile.phone, "");
  assert.deepEqual(out.profile.salary, { min: null, ideal: null });
  assert.deepEqual(out.profile.soft_skills, []);
});

await t("préserve les champs optionnels saisis à la main", async () => {
  const out = mapCv(await extractCvObject(FIXTURE), {
    salary: { min: 32000, ideal: 38000 }, soft_skills: ["Autonomie"],
  });
  assert.deepEqual(out.profile.salary, { min: 32000, ideal: 38000 });
  assert.deepEqual(out.profile.soft_skills, ["Autonomie"]);
});

await t("fusionne les compétences manuelles (préservées au sync)", async () => {
  const manual = { categories: [{ name: "Réseaux", items: [{ name: "DNS", level: "notions" }] }] };
  const out = mapCv(await extractCvObject(FIXTURE), {}, manual);
  const reseaux = out.skills.categories.find((c) => c.name === "Réseaux");
  assert.ok(reseaux, "la catégorie manuelle Réseaux doit être présente");
  assert.deepEqual(reseaux.items, [{ name: "DNS", level: "notions" }]);
  // catégories vides ignorées
  const out2 = mapCv(await extractCvObject(FIXTURE), {}, { categories: [{ name: "Vide", items: [] }] });
  assert.ok(!out2.skills.categories.some((c) => c.name === "Vide"));
});

console.log(`\n${passed} tests OK (sync portfolio)`);
