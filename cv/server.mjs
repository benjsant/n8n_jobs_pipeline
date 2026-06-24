// Micro-service de rendu HTTP — expose le rendu CV (Astro) et lettre en PDF
// pour n8n (workflow 02). Même rôle que services/jobspy, côté documents.
//
//   POST /cv      { application_id, personalization }  -> { cv_path }
//   POST /letter  { application_id, company, template, accroche, vars? } -> { letter_path }
//                 (ou { …, subject, body } en direct pour test/rétro-compat)
//   GET  /health  -> { status: "ok" }
//
// Les PDF sont écrits dans OUTPUT_DIR (/output, volume partagé avec n8n) sous
// app-<application_id>/. n8n récupère le chemin renvoyé et le lit (workflow 04).
//
// Garde-fous :
//  - le CV reste le template Astro FIXE ; on ne fait qu'appliquer la
//    personnalisation (réordonner / mettre en avant / masquer). Aucune invention.
//  - le TEXTE de la lettre vient de l'agent ; ici, mise en page seulement.
//  - l'expéditeur de la lettre est lu depuis profile.json (profil réel), jamais inventé.
import http from "node:http";
import { execFile } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { buildLetterHtml } from "./letter.mjs";
import { assembleLetter } from "./letter-template.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = process.env.OUTPUT_DIR || "/output";
const PORT = Number(process.env.PORT || 8000);
const DIST_HTML = resolve(HERE, "dist", "index.html");

// --- Navigateur partagé (lancé paresseusement, réutilisé) ---
let browserPromise = null;
const getBrowser = () => (browserPromise ??= chromium.launch());

// --- Sérialisation : Astro build mute dist/, on évite les builds concurrents ---
let queue = Promise.resolve();
const serialize = (fn) => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {}); // la file ne casse pas si une requête échoue
  return run;
};

const appDir = (id) => {
  const safe = String(id).replace(/[^A-Za-z0-9_-]/g, "_") || "sans-id";
  return join(OUTPUT_DIR, `app-${safe}`);
};

function buildAstro(personalizationPath) {
  return new Promise((ok, ko) => {
    execFile(
      "npm", ["run", "build"],
      { cwd: HERE, env: { ...process.env, CV_PERSONALIZATION: personalizationPath } },
      (err, stdout, stderr) => (err ? ko(new Error(stderr || err.message)) : ok(stdout)),
    );
  });
}

async function htmlToPdf({ url, html, outPath }) {
  const page = await (await getBrowser()).newPage();
  try {
    if (url) await page.goto(url, { waitUntil: "networkidle" });
    else await page.setContent(html, { waitUntil: "networkidle" });
    await page.pdf({
      path: outPath, format: "A4", printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
  } finally {
    await page.close();
  }
}

async function renderCv({ application_id, personalization }) {
  return serialize(async () => {
    const dir = appDir(application_id);
    await mkdir(dir, { recursive: true });
    const persoPath = join(dir, "personalization.json");
    await writeFile(persoPath, JSON.stringify(personalization ?? {}, null, 2), "utf-8");
    await buildAstro(persoPath);
    if (!existsSync(DIST_HTML)) throw new Error(`build Astro absent : ${DIST_HTML}`);
    const outPath = join(dir, "cv.pdf");
    await htmlToPdf({ url: pathToFileURL(DIST_HTML).href, outPath });
    return { cv_path: outPath };
  });
}

async function defaultCandidate() {
  try {
    const p = JSON.parse(await readFile(resolve(HERE, "profile.json"), "utf-8"));
    // Découpe le libellé de mobilité : "Mobilité … · Télétravail possible"
    // -> mobilité (1 ligne) + télétravail (1 ligne séparée, comme le modèle).
    const parts = String(p.mobility_label || "").split(/\s*·\s*/).filter(Boolean);
    const remote = parts.find((x) => /télétravail|teletravail|remote/i.test(x)) || "";
    const mobility = parts.filter((x) => x !== remote).join(" · ") || p.location || "";
    // Ville pour la date ("Marly, le …") : la résidence prime, sans le code dpt.
    const city = String(p.residence || p.location || "").replace(/\s*\(.*?\)/, "").split(/[·,]/)[0].trim();
    return {
      name: p.name, title: p.title, email: p.email, phone: p.phone,
      residence: p.residence || "", mobility, remote,
      location: p.location, city,
    };
  } catch {
    return {};
  }
}

function frenchDate(city) {
  const d = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const c = String(city || "").split(",")[0].trim();
  return c ? `${c}, le ${d}` : `Le ${d}`;
}

async function loadProfile() {
  try { return JSON.parse(await readFile(resolve(HERE, "profile.json"), "utf-8")); }
  catch { return {}; }
}

async function renderLetter({ application_id, company, subject, body, date, candidate, template, accroche, vars }) {
  const dir = appDir(application_id);
  await mkdir(dir, { recursive: true });
  const c = { ...(await defaultCandidate()), ...(candidate || {}) };
  // Assemblage déterministe : si un template est fourni, le corps FIGÉ vient de
  // assets/letters/<template>.md ; le LLM n'a produit que l'accroche. Sinon, on
  // utilise subject/body tels quels (chemin de test / rétro-compat).
  if (template) {
    const prof = await loadProfile();
    const alt = prof.alternance || {};
    const v = {
      company,
      poste: (vars && vars.poste) || "",
      titre: (vars && vars.titre) || prof.title || "",
      formation: (vars && vars.formation) || alt.formation_visee || "une formation de niveau supérieur en développement / IA",
      rythme_alternance: (vars && vars.rythme_alternance) || alt.rythme || "à convenir selon votre organisation",
      date_debut: (vars && vars.date_debut) || alt.date_debut || "immédiatement",
    };
    const asm = await assembleLetter({ template, accroche: accroche || "", vars: v });
    subject = asm.subject;
    body = asm.body;
  }
  const html = buildLetterHtml({ candidate: c, company, subject, body, date: date || frenchDate(c.city || c.location) });
  const outPath = join(dir, "lettre.pdf");
  await serialize(() => htmlToPdf({ html, outPath }));
  return { letter_path: outPath };
}

// --- HTTP ---
const readJson = (req) =>
  new Promise((ok, ko) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => { try { ok(raw ? JSON.parse(raw) : {}); } catch (e) { ko(e); } });
    req.on("error", ko);
  });

const send = (res, code, obj) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") return send(res, 200, { status: "ok" });
    if (req.method === "POST" && req.url === "/cv") return send(res, 200, await renderCv(await readJson(req)));
    if (req.method === "POST" && req.url === "/letter") return send(res, 200, await renderLetter(await readJson(req)));
    return send(res, 404, { error: "route inconnue" });
  } catch (e) {
    return send(res, 500, { error: String(e?.message || e) });
  }
});

server.listen(PORT, () => console.log(`render-service en écoute sur :${PORT} (sortie ${OUTPUT_DIR})`));
