// Synchronise le profil candidat depuis le portfolio (source de vérité).
//
//   make cv-sync            # récupère src/data/cv.ts sur GitHub et régénère cv/*.json
//   node cv/scripts/sync-from-portfolio.mjs [--file chemin/cv.ts]
//
// Le portfolio (https://github.com/benjsant/astro-portfolio, src/data/cv.ts) est
// la SEULE source du CV. Ce script mappe son objet `cv` vers le schéma cv/*.json
// du projet, puis régénère cv-index.json. Garde-fous :
//  - aucune invention : un champ absent du portfolio reste vide ;
//  - les champs optionnels saisis à la main (soft_skills, strengths, achievements,
//    salary) sont PRÉSERVÉS s'ils sont déjà remplis dans cv/profile.json.
import { writeFile, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const CV_DIR = resolve(HERE, "..");
const RAW_URL =
  "https://raw.githubusercontent.com/benjsant/astro-portfolio/main/src/data/cv.ts";

// ── Helpers purs ─────────────────────────────────────────────────────────────
export const slugify = (s) =>
  String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const firstSegment = (s) => String(s ?? "").split(/[–—-]/)[0].trim();
const splitList = (s, sep = /[·•]/) =>
  String(s ?? "").split(sep).map((x) => x.trim()).filter(Boolean);
// Split sur virgules SAUF celles à l'intérieur de parenthèses (ex. "Agents IA (ReAct, tool-calling)").
const splitSkills = (s) =>
  String(s ?? "").split(/,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean);
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Renvoie [start, end] en années. Gère "2025–26" -> ["2025","2026"]. */
export function yearRange(s) {
  const m = String(s ?? "").match(/(\d{4})\s*[–—-]\s*(\d{2,4})/);
  if (m) {
    let end = m[2];
    if (end.length === 2) end = m[1].slice(0, 2) + end;
    return [m[1], end];
  }
  const ys = String(s ?? "").match(/(19|20)\d{2}/g) ?? [];
  return [ys[0] ?? "", ys[ys.length - 1] ?? ys[0] ?? ""];
}

/** Extrait l'objet `cv` du source TypeScript (le littéral est du JS pur). */
export async function extractCvObject(tsSource) {
  const i = tsSource.indexOf("export const cv");
  if (i === -1) throw new Error("`export const cv` introuvable dans cv.ts");
  const afterEq = tsSource.slice(tsSource.indexOf("=", i) + 1);
  const mod = "export default " + afterEq; // `export default { ... };`
  const url = "data:text/javascript," + encodeURIComponent(mod);
  return (await import(url)).default;
}

const findContact = (cv, re) =>
  (cv.contact ?? []).find((c) => re.test(c.label))?.value ?? "";
const findContactHref = (cv, re) =>
  (cv.contact ?? []).find((c) => re.test(c.label))?.href ?? "";

/** Mappe l'objet `cv` du portfolio vers les fichiers cv/*.json (objets JS). */
export function mapCv(cv, existingProfile = {}) {
  const langRow = (cv.skills ?? []).find((s) => /langue/i.test(s.category));
  const languages = splitSkills(langRow?.value).map((entry) => {
    const [name, ...rest] = entry.split(/\s+/);
    return { name, level: cap(rest.join(" ")) };
  });

  const skills = {
    categories: (cv.skills ?? [])
      .filter((s) => !/langue/i.test(s.category))
      .map((s) => ({
        name: s.category,
        items: splitSkills(s.value).map((name) => ({ name, level: "" })),
      })),
  };

  const projects = {
    projects: (cv.projects ?? []).map((p) => ({
      id: slugify(firstSegment(p.title)),
      name: p.title,
      ...(p.period ? { period: p.period } : {}),
      description: p.description,
      tech: splitList(p.stack),
      url: p.repo ?? "",
    })),
  };

  const experiences = {
    experiences: (cv.experiences ?? []).map((e) => {
      const [start, end] = yearRange(e.date);
      const bullets = [...(e.tasks ?? [])];
      if (e.stack) bullets.push(`Stack : ${splitList(e.stack).join(", ")}`);
      return {
        id: slugify(firstSegment(e.org)),
        role: e.role,
        company: e.org,
        location: "",
        start,
        end,
        date: e.date ?? "",
        bullets,
      };
    }),
  };

  const education = {
    education: (cv.education ?? []).map((ed) => {
      const [start, end] = yearRange(ed.date);
      return {
        id: slugify(firstSegment(ed.title)).split("-").slice(0, 3).join("-"),
        degree: ed.title,
        school: ed.school,
        location: "",
        start: start || String(ed.date ?? ""),
        end,
        date: String(ed.date ?? ""),
        details: "",
      };
    }),
  };

  const certifications = {
    certifications: (cv.certifications ?? []).map((c) => ({
      name: c.title,
      issuer: "",
      year: String(c.date ?? ""),
    })),
  };

  // Préserve les champs optionnels saisis à la main (jamais écrasés par du vide).
  const keepIfFilled = (v, fallback) =>
    Array.isArray(v) ? (v.length ? v : fallback)
    : v && typeof v === "object" ? (Object.values(v).some((x) => x != null) ? v : fallback)
    : v || fallback;

  const profile = {
    name: cv.header?.name ?? "",
    title: cv.header?.role ?? "",
    email: findContact(cv, /mail|email/i),
    phone: findContact(cv, /t[ée]l|phone|mobile/i),
    location:
      (cv.details ?? []).find((d) => /mobilit|localisation|adresse/i.test(d.label))?.value ?? "",
    links: {
      github: findContactHref(cv, /github/i),
      linkedin: findContactHref(cv, /linkedin/i),
      portfolio: findContactHref(cv, /portfolio|site/i),
    },
    summary: cv.header?.summary ?? "",
    // Champs manuels (absents du portfolio) : préservés d'un sync à l'autre.
    residence: keepIfFilled(existingProfile.residence, ""),
    permis: keepIfFilled(existingProfile.permis, ""),
    mobility_label: keepIfFilled(existingProfile.mobility_label, ""),
    alternance: keepIfFilled(existingProfile.alternance, { formation_visee: "", rythme: "", date_debut: "" }),
    salary: keepIfFilled(existingProfile.salary, { min: null, ideal: null }),
    soft_skills: keepIfFilled(existingProfile.soft_skills, []),
    strengths: keepIfFilled(existingProfile.strengths, []),
    achievements: keepIfFilled(existingProfile.achievements, []),
  };

  return { profile, skills, projects, experiences, education, certifications, languages: { languages } };
}

// ── Exécution ────────────────────────────────────────────────────────────────
const writeJson = (name, obj) =>
  writeFile(resolve(CV_DIR, name), JSON.stringify(obj, null, 2) + "\n", "utf-8");

async function main() {
  const fileArg = process.argv.indexOf("--file");
  let tsSource;
  if (fileArg !== -1) {
    tsSource = await readFile(process.argv[fileArg + 1], "utf-8");
    console.log(`Lecture locale : ${process.argv[fileArg + 1]}`);
  } else {
    console.log(`Récupération : ${RAW_URL}`);
    const res = await fetch(RAW_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status} en récupérant cv.ts`);
    tsSource = await res.text();
  }

  const cv = await extractCvObject(tsSource);
  const existingProfile = existsSync(resolve(CV_DIR, "profile.json"))
    ? JSON.parse(await readFile(resolve(CV_DIR, "profile.json"), "utf-8"))
    : {};
  const out = mapCv(cv, existingProfile);

  await writeJson("profile.json", out.profile);
  await writeJson("skills.json", out.skills);
  await writeJson("projects.json", out.projects);
  await writeJson("experiences.json", out.experiences);
  await writeJson("education.json", out.education);
  await writeJson("certifications.json", out.certifications);
  await writeJson("languages.json", out.languages);

  // Régénère l'index injecté à l'agent.
  await new Promise((ok, ko) =>
    execFile("node", [resolve(HERE, "build-index.mjs")], (e, so) =>
      e ? ko(e) : (process.stdout.write(so), ok())),
  );

  console.log(
    `✓ Profil synchronisé : ${out.profile.name} — ` +
    `${out.skills.categories.length} catégories, ${out.projects.projects.length} projets, ` +
    `${out.experiences.experiences.length} exp, ${out.education.education.length} formations.`,
  );
  if (!out.profile.phone) console.log("  (aucun téléphone dans le portfolio → champ laissé vide)");
}

// N'exécute main() que si lancé directement (pas à l'import par les tests).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error("✗", e.message); process.exit(1); });
}
