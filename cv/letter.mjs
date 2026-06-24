// Rendu de la lettre de motivation -> HTML A4 (puis PDF via render-letter.mjs).
//
// La lettre TEXTE est assemblée de façon déterministe (cv/letter-template.mjs) :
// corps FIGÉ du template assets/letters/ + accroche de l'agent (§5/§6). Ici on ne
// fait QUE la mise en page : on n'invente ni ne reformule rien.

const escape = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** Découpe le corps en paragraphes (double saut = paragraphe, simple = <br>). */
function paragraphs(body) {
  const text = String(body ?? "").trim();
  if (!text) return "";
  const blocks = text.split(/\n\s*\n/);
  return blocks
    .map((b) => `<p>${escape(b).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

/**
 * Construit le document HTML complet de la lettre.
 * @param {object} data
 *   - candidate: { name, email, phone, location }
 *   - company:   string (destinataire)
 *   - date:      string (optionnel, ex. "Lyon, le 11 juin 2026")
 *   - subject:   string (objet)
 *   - body:      string (texte de la lettre, sauts de ligne en \n)
 */
export function buildLetterHtml(data = {}) {
  const c = data.candidate ?? {};
  // Bloc EXPÉDITEUR (haut-gauche) : nom en gras + lignes empilées.
  const senderLines = (data.senderLines ?? [
    c.title,
    c.email,
    c.phone,
    [c.residence, c.mobility].filter(Boolean).join(" · ") || c.location,
    c.remote,
  ]).filter(Boolean).map(escape);
  // Bloc DESTINATAIRE (haut-droite, aligné à droite) : entreprise en gras +
  // service + adresse (si connue) + date.
  const r = data.recipient ?? {};
  const service = r.service || (data.company ? "Service Recrutement" : "");
  const recipientLines = [
    service ? `À l'attention du ${service}` : "",
    r.address || "",
    data.date || "",
  ].filter(Boolean).map(escape);
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Lettre de motivation${c.name ? ` — ${escape(c.name)}` : ""}</title>
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body { font-family: "Inter","Helvetica Neue",Arial,sans-serif; color: #1f2329; font-size: 11pt; line-height: 1.5; }
      .page { width: 210mm; min-height: 297mm; padding: 22mm 24mm; margin: 0 auto; background: #fff; }
      .sender .sname { font-weight: 600; }
      .sender div { line-height: 1.45; }
      .recipient { margin-top: 30px; text-align: right; }
      .recipient .rname { font-weight: 600; }
      .subject { margin-top: 26px; font-weight: 600; }
      .body { margin-top: 16px; }
      .body p { margin: 0 0 11px; text-align: justify; }
      .sign { margin-top: 24px; }
      @page { size: A4; margin: 0; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style>
  </head>
  <body>
    <main class="page">
      <div class="sender">
        <div class="sname">${escape(c.name) || "[Nom]"}</div>
        ${senderLines.map((l) => `<div>${l}</div>`).join("\n        ")}
      </div>
      <div class="recipient">
        ${data.company ? `<div class="rname">${escape(data.company)}</div>` : ""}
        ${recipientLines.map((l) => `<div>${l}</div>`).join("\n        ")}
      </div>
      ${data.subject ? `<div class="subject">Objet : ${escape(data.subject)}</div>` : ""}
      <div class="body">
        ${paragraphs(data.body)}
      </div>
      <div class="sign">${escape(c.name) || ""}</div>
    </main>
  </body>
</html>`;
}
