// Génère cv/cv-index.json : la liste COMPACTE des valeurs sélectionnables par
// l'agent (noms de compétences, ids de projets/expériences). Source unique =
// cv/*.json. Le workflow 02 injecte cet index dans le prompt pour que l'agent
// ne choisisse QUE des valeurs réelles (anti-invention sur la personnalisation).
//
// Usage : node cv/scripts/build-index.mjs   (ou : make cv-index)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const CV = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => JSON.parse(readFileSync(resolve(CV, f), "utf-8"));

const skills = read("skills.json");
const projects = read("projects.json");
const experiences = read("experiences.json");

const index = {
  skills: (skills.categories || [])
    .flatMap((c) => (c.items || []).map((i) => i.name))
    .filter(Boolean),
  projects: (projects.projects || [])
    .filter((p) => p.id)
    .map((p) => ({ id: p.id, name: p.name })),
  experiences: (experiences.experiences || [])
    .filter((e) => e.id)
    .map((e) => ({ id: e.id, role: e.role, company: e.company })),
};

const out = resolve(CV, "cv-index.json");
writeFileSync(out, JSON.stringify(index, null, 2) + "\n", "utf-8");
console.log(
  `cv-index.json écrit : ${index.skills.length} compétences, ` +
  `${index.projects.length} projets, ${index.experiences.length} expériences.`,
);
