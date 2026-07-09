// Construit les corps de requête envoyés au micro-service de rendu (services
// render / cv/server.mjs) à partir de la sortie de l'agent DeepSeek (§6) et de
// l'entrée normalisée du workflow 02.
//
// Logique PURE (aucune dépendance n8n) : le nœud Code « Préparer rendu » du
// workflow 02 reprend cette logique, et ce module la teste hors stack.
//
// Garde-fou : on ne fait que RECOPIER ce que l'agent a produit (highlight_*,
// summary, lettre, objet). On n'invente rien et on ne reformule rien.

const asArray = (v) => (Array.isArray(v) ? v : []);
const asString = (v) => (v == null ? "" : String(v));

/**
 * Corps de POST /cv : id de candidature + bloc de personnalisation structuré.
 * @param {{application_id:(string|number), personnalisation_cv?:object}} input
 */
export function buildCvPayload({ application_id, personnalisation_cv } = {}) {
  const p = personnalisation_cv && typeof personnalisation_cv === "object" ? personnalisation_cv : {};
  return {
    application_id: asString(application_id),
    personalization: {
      summary: asString(p.summary),
      highlight_skills: asArray(p.highlight_skills),
      highlight_projects: asArray(p.highlight_projects),
      highlight_experiences: asArray(p.highlight_experiences),
      hidden_sections: asArray(p.hidden_sections),
      hidden_skills: asArray(p.hidden_skills),
      hidden_projects: asArray(p.hidden_projects),
    },
  };
}

/**
 * Corps de POST /letter (assemblage DÉTERMINISTE) : id + destinataire + template
 * choisi + accroche (seul texte de l'agent) + variables de substitution. Le
 * service charge le corps FIGÉ du template, y colle l'accroche et résout les
 * placeholders ; l'expéditeur vient de cv/profile.json. `date` optionnel.
 * Rétro-compat : si `subject`/`body` sont fournis (test), ils sont transmis tels quels.
 * @param {{application_id:(string|number), company?:string, template?:string, accroche?:string, vars?:object, subject?:string, body?:string, date?:string}} input
 */
export function buildLetterPayload({ application_id, company, template, accroche, vars, subject, body, date } = {}) {
  const payload = {
    application_id: asString(application_id),
    company: asString(company),
  };
  if (template) {
    payload.template = asString(template);
    payload.accroche = asString(accroche);
    payload.vars = vars && typeof vars === "object" ? vars : {};
  } else {
    payload.subject = asString(subject);
    payload.body = asString(body);
  }
  if (date) payload.date = asString(date);
  return payload;
}

/**
 * Entrée passée au workflow 04 (finalisation : Drive + brouillon Gmail).
 * Reprend les chemins PDF renvoyés par le service de rendu.
 * @param {object} input
 */
export function buildFinalisationInput({ company, cv_path, letter_path, to_email, subject, body } = {}) {
  return {
    company: asString(company),
    cv_path: asString(cv_path),
    letter_path: asString(letter_path),
    to_email: asString(to_email),
    subject: asString(subject),
    body: asString(body),
  };
}
