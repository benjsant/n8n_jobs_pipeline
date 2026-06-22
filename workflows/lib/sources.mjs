// Normaliseurs par source : réponse brute d'une API/flux -> offres au schéma
// commun (champs de la table `offers`, hors hash/score qui sont ajoutés ensuite
// par annotate() de offer-utils.mjs).
//
// Source de vérité de ce mapping. Dans n8n, chaque source a un nœud Code qui
// colle le corps du normaliseur correspondant. Testé par sources.test.mjs.
import { norm } from "./offer-utils.mjs";

const s = (v) => String(v ?? "").trim();

/** Adzuna : { results: [...] } — GET /v1/api/jobs/fr/search/{page}. */
export function normalizeAdzuna(payload) {
  const results = payload?.results ?? [];
  return results.map((r) => ({
    source: "adzuna",
    source_id: s(r.id),
    title: s(r.title),
    company: s(r.company?.display_name),
    location: s(r.location?.display_name),
    contract_type: s(r.contract_time || r.contract_type),
    salary: r.salary_min ? s(r.salary_min) : "",
    description: s(r.description),
    url: s(r.redirect_url),
  }));
}

/** France Travail : { resultats: [...] } — Offres d'emploi v2 /offres/search. */
export function normalizeFranceTravail(payload) {
  const results = payload?.resultats ?? [];
  return results.map((r) => ({
    source: "france_travail",
    source_id: s(r.id),
    title: s(r.intitule),
    company: s(r.entreprise?.nom),
    location: s(r.lieuTravail?.libelle),
    contract_type: s(r.typeContrat || r.typeContratLibelle),
    salary: s(r.salaire?.libelle),
    description: s(r.description),
    url: s(r.origineOffre?.urlOrigine),
  }));
}

/**
 * JobSpy : déjà normalisé par le micro-service (services/jobspy) sous
 * { count, offers: [...] }. On revalide juste la forme et on force la source.
 */
export function normalizeJobSpy(payload) {
  const offers = payload?.offers ?? [];
  return offers.map((o) => ({
    source: s(o.source) || "jobspy",
    source_id: s(o.source_id || o.url),
    title: s(o.title),
    company: s(o.company),
    location: s(o.location),
    contract_type: s(o.contract_type),
    salary: s(o.salary),
    description: s(o.description),
    url: s(o.url),
  }));
}

/**
 * Welcome to the Jungle (RSS) : liste d'items { title, link, contentSnippet,
 * content, isoDate }. Pas d'entreprise fiable dans le flux ; on tente de
 * l'extraire d'un titre au format "Poste - Entreprise".
 */
export function normalizeWTTJ(items) {
  const list = items ?? [];
  return list.map((it) => {
    const rawTitle = s(it.title);
    let title = rawTitle;
    let company = "";
    const dash = rawTitle.split(/\s[-–|]\s/);
    if (dash.length >= 2) {
      title = s(dash[0]);
      company = s(dash[dash.length - 1]);
    }
    return {
      source: "wttj",
      source_id: s(it.guid || it.id || it.link),
      title,
      company,
      location: s(it.location),
      contract_type: "",
      salary: "",
      description: s(it.contentSnippet || it.content || it.description),
      url: s(it.link),
    };
  });
}

/**
 * Google Jobs via SerpApi : { jobs_results: [...] }. Source principale du
 * pipeline Make réel. URL : on prend le 1er lien de candidature / partage dispo.
 */
export function normalizeGoogleJobs(payload) {
  const results = payload?.jobs_results ?? [];
  return results.map((r) => {
    const ext = r.detected_extensions ?? {};
    const url =
      r.share_link ||
      (Array.isArray(r.apply_options) && r.apply_options[0]?.link) ||
      (Array.isArray(r.related_links) && r.related_links[0]?.link) ||
      "";
    return {
      source: "google_jobs",
      source_id: s(r.job_id),
      title: s(r.title),
      company: s(r.company_name),
      location: s(r.location),
      contract_type: s(ext.schedule_type),
      salary: s(ext.salary),
      description: s(r.description),
      url: s(url),
    };
  });
}

/**
 * JSearch (RapidAPI) : { data: [...] } — agrégateur LinkedIn/Indeed/Glassdoor
 * via API officielle (alternative fiable au scraping JobSpy). Forme de réponse
 * vérifiée sur un workflow n8n fonctionnel. `source` = jsearch:<publisher>.
 */
export function normalizeJSearch(payload) {
  const results = payload?.data ?? [];
  return results.map((r) => {
    const publisher = s(r.job_publisher).toLowerCase().replace(/\s+/g, "-");
    return {
      source: publisher ? `jsearch:${publisher}` : "jsearch",
      source_id: s(r.job_id),
      title: s(r.job_title),
      company: s(r.employer_name),
      location: s(r.job_city || r.job_location),
      contract_type: s(r.job_employment_type),
      salary: s(r.job_salary_string),
      description: s(r.job_description),
      url: s(r.job_apply_link || r.job_google_link),
    };
  });
}

export const NORMALIZERS = {
  adzuna: normalizeAdzuna,
  france_travail: normalizeFranceTravail,
  jobspy: normalizeJobSpy,
  wttj: normalizeWTTJ,
  google_jobs: normalizeGoogleJobs,
  jsearch: normalizeJSearch,
};
