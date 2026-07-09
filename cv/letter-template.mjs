// Assemblage DÉTERMINISTE d'une lettre à partir d'un template "quasi-complet"
// de assets/letters/. Le corps est FIGÉ (validé par le candidat) : le LLM ne
// produit QUE l'accroche (cf. system prompt §5/§6). Ici on ne fait que coller
// l'accroche dans le template et résoudre les {{placeholders}} — jamais le LLM.
//
// Garde-fou : le corps n'est jamais réécrit. Le seul texte libre est `accroche`.
// La logique de substitution est pure et testée (cv/letter-template.test.mjs).

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const TEMPLATES = [
  "ia-junior",
  "backend",
  "frontend",
  "alternance",
  "candidature-spontanee",
  "employe-numerique",
];

const LETTERS_DIR = process.env.LETTERS_DIR || "/assets/letters";

/** Retire les blocs de commentaire HTML (entête + "ton de référence"). */
export function stripComments(md) {
  return String(md ?? "").replace(/<!--[\s\S]*?-->/g, "");
}

/** Extrait l'objet ("Objet : …") après résolution des {{placeholders}}. */
export function extractSubject(text) {
  const m = String(text ?? "").match(/^\s*Objet\s*:\s*(.+)$/m);
  return m ? m[1].trim() : "";
}

/** Substitue les {{placeholders}} connus ; laisse intacts les inconnus. */
function substitute(text, vars = {}) {
  const map = {
    "poste.intitule": vars.poste ?? "",
    "entreprise.nom": vars.company ?? "",
    "candidat.titre": vars.titre ?? "",
    "candidat.nom": vars.nom ?? "",
    "candidat.email": vars.email ?? "",
    "candidat.telephone": vars.telephone ?? "",
    formation: vars.formation ?? "",
    rythme_alternance: vars.rythme_alternance ?? "",
    date_debut: vars.date_debut ?? "",
  };
  return String(text).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k) =>
    k in map ? map[k] : m,
  );
}

/**
 * Assemble le template en { subject, body } prêts pour buildLetterHtml.
 * - remplace le bloc [Accroche …] (multi-ligne) par l'accroche de l'agent ;
 * - extrait la ligne "Objet : …" comme `subject` ;
 * - retire le bloc signature final ({{candidat.nom}}…) car la mise en page
 *   (letter.mjs) ajoute déjà l'expéditeur et la signature depuis profile.json.
 * @param {string} md  contenu brut du template (.md)
 * @param {{accroche?:string, vars?:object}} opts
 */
export function fillTemplate(md, { accroche = "", vars = {} } = {}) {
  let t = stripComments(md);
  // 1. Retire le bloc signature final ({{candidat.nom}} … {{candidat.telephone}}) :
  //    la mise en page (letter.mjs) régénère expéditeur + signature depuis le profil.
  t = t.replace(/\n*\{\{\s*candidat\.nom\s*\}\}[\s\S]*$/, "\n");
  // 2. L'accroche (seule zone rédigée par l'agent) remplace le bloc [Accroche …].
  t = t.replace(/\[Accroche[\s\S]*?\]/, String(accroche).trim());
  // 3. Résolution des placeholders restants.
  t = substitute(t, vars);
  // 4. Sujet = la ligne "Objet : …" (retirée ensuite du corps).
  const subject = extractSubject(t);
  t = t.replace(/^\s*Objet\s*:.*$/m, "");
  // 5. Garde-fou déterministe : retire les tirets cadratin (—) / demi-cadratin (–)
  //    — marqueur de rédaction IA, banni (cf. §5). On NE touche PAS au trait
  //    d'union "-" (bout-en-bout, etc.). Puis on compacte les lignes vides.
  const noDash = (s) => String(s).replace(/\s*[—–]\s*/g, ", ");
  const body = noDash(t).replace(/\n{3,}/g, "\n\n").trim();
  return { subject: noDash(subject).trim(), body };
}

/** Charge le template depuis LETTERS_DIR et l'assemble. */
export async function assembleLetter({ template, accroche, vars } = {}) {
  if (!TEMPLATES.includes(template)) {
    throw new Error(`template inconnu: ${template} (attendu: ${TEMPLATES.join(", ")})`);
  }
  const md = await readFile(resolve(LETTERS_DIR, `${template}.md`), "utf-8");
  return fillTemplate(md, { accroche, vars });
}
