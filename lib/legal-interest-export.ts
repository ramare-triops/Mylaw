/**
 * Exports du calculateur d'intérêts au taux légal — XLSX (via SheetJS,
 * dépendance déjà présente dans le projet) et « PDF » via une fenêtre
 * d'impression stylée que l'utilisateur enregistre via la boîte de
 * dialogue d'impression de son navigateur.
 *
 * Cette approche évite d'embarquer un moteur PDF (jsPDF/autotable) et
 * produit un rendu propre et imprimable en respectant la mise en page
 * Mylaw. Le navigateur convertit en PDF via « Enregistrer au format
 * PDF » → exactement ce que l'utilisateur attend.
 */
import * as XLSX from 'xlsx';
import type { InterestComputationResult } from '@/lib/legal-interest-calc';

const fmtMoney = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
});

const fmtPercent = (rate: number) =>
  `${rate.toFixed(2).replace('.', ',')} %`;

const fmtDate = (d: Date | string) =>
  new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(typeof d === 'string' ? new Date(d) : d);

function safeFilename(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ─── XLSX ────────────────────────────────────────────────────────────────
export function exportInterestXlsx(args: {
  name: string;
  result: InterestComputationResult;
  dossierLabel?: string;
}) {
  const { name, result, dossierLabel } = args;
  const wb = XLSX.utils.book_new();

  // Feuille 1 : récapitulatif
  const recap: (string | number)[][] = [
    ['Calcul des intérêts au taux légal'],
    [],
    ['Nom du calcul', name],
    ['Dossier', dossierLabel ?? '—'],
    ['Profil créancier', result.creditorType === 'particulier' ? 'Particulier' : 'Professionnel'],
    ['Capitalisation des intérêts',
      result.capitalize
        ? `Oui — à compter du ${result.capitalizationStartDate ? fmtDate(result.capitalizationStartDate) : '—'}`
        : 'Non',
    ],
    ['Calculé le', fmtDate(result.computedAt)],
    [],
    ['Capital total (€)', result.totalCapital],
    ['Intérêts totaux (€)', result.totalInterest],
    ['Total dû (€)', result.totalAmount],
  ];
  if (result.hasExtrapolation) {
    recap.push([], ['⚠', 'Au moins un segment utilise un taux extrapolé (date postérieure au dernier taux officiel publié).']);
  }
  const ws1 = XLSX.utils.aoa_to_sheet(recap);
  ws1['!cols'] = [{ wch: 28 }, { wch: 32 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Récapitulatif');

  // Feuille 2 : lignes par poste
  const itemsHeader = [
    'Poste', 'Capital (€)', 'Du', 'Au', 'Intérêts (€)', 'Total (€)',
  ];
  const itemsRows: (string | number)[][] = result.items.map((it) => [
    it.label,
    it.amount,
    fmtDate(it.startDate),
    fmtDate(it.endDate),
    it.interest,
    it.total,
  ]);
  const ws2 = XLSX.utils.aoa_to_sheet([itemsHeader, ...itemsRows]);
  ws2['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Postes');

  // Feuille 3 : détail des segments (par taux)
  const segHeader = [
    'Poste', 'Du', 'Au', 'Année', 'Sem.', 'Jours', 'Capital base (€)', 'Taux', 'Intérêts (€)', 'Capitalisé',
  ];
  const segRows: (string | number)[][] = [];
  result.items.forEach((it) => {
    it.segments.forEach((s: any) => {
      segRows.push([
        it.label,
        fmtDate(s.from),
        fmtDate(s.to),
        s.year,
        s.semester === 1 ? 'S1' : 'S2',
        s.days,
        s.capital ?? it.amount,
        fmtPercent(s.rate),
        s.interest,
        s.capitalizedAfter ? 'Oui' : '',
      ]);
    });
  });
  const ws3 = XLSX.utils.aoa_to_sheet([segHeader, ...segRows]);
  ws3['!cols'] = [
    { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 6 }, { wch: 8 },
    { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, ws3, 'Détail');

  XLSX.writeFile(wb, `${safeFilename(name) || 'calcul_interets'}.xlsx`);
}

// ─── PDF (via fenêtre d'impression) ──────────────────────────────────────
export function exportInterestPdf(args: {
  name: string;
  result: InterestComputationResult;
  dossierLabel?: string;
}) {
  const { name, result, dossierLabel } = args;
  const html = renderHtml({ name, result, dossierLabel });
  const w = window.open('', '_blank', 'width=900,height=1100');
  if (!w) {
    alert("Le navigateur a bloqué l'ouverture de la fenêtre d'impression. Autorisez les pop-ups pour exporter en PDF.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  // Laisse le temps au navigateur de poser les styles avant l'impression.
  w.onload = () => {
    w.focus();
    w.print();
  };
}

function renderHtml(args: {
  name: string;
  result: InterestComputationResult;
  dossierLabel?: string;
}): string {
  const { name, result, dossierLabel } = args;
  const tableItems = result.items
    .map(
      (it) => `
        <tr>
          <td>${escapeHtml(it.label)}</td>
          <td class="num">${fmtMoney.format(it.amount)}</td>
          <td>${fmtDate(it.startDate)}</td>
          <td>${fmtDate(it.endDate)}</td>
          <td class="num">${fmtMoney.format(it.interest)}</td>
          <td class="num">${fmtMoney.format(it.total)}</td>
        </tr>
      `,
    )
    .join('');

  const tableSegments = result.items
    .map((it) =>
      it.segments
        .map(
          (s: any) => `
        <tr${s.capitalizedAfter ? ' class="cap"' : ''}>
          <td>${escapeHtml(it.label)}</td>
          <td>${fmtDate(s.from)}</td>
          <td>${fmtDate(s.to)}</td>
          <td>${s.year} ${s.semester === 1 ? 'S1' : 'S2'}</td>
          <td class="num">${s.days}</td>
          <td class="num">${fmtMoney.format(s.capital ?? it.amount)}</td>
          <td class="num">${fmtPercent(s.rate)}</td>
          <td class="num">${fmtMoney.format(s.interest)}${s.capitalizedAfter ? ' <small>↻ capitalisé</small>' : ''}</td>
        </tr>
      `,
        )
        .join(''),
    )
    .join('');

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(name)} — Mylaw</title>
<style>
  @page { margin: 18mm 16mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif; color: #111; font-size: 11pt; line-height: 1.4; margin: 0; }
  h1 { font-size: 18pt; margin: 0 0 4pt; letter-spacing: -0.01em; }
  .meta { color: #555; font-size: 10pt; margin-bottom: 16pt; }
  .meta div { margin-top: 2pt; }
  .totals { display: flex; gap: 24pt; margin: 12pt 0 18pt; flex-wrap: wrap; }
  .totals .box { flex: 1; min-width: 140pt; border: 1pt solid #ddd; border-radius: 6pt; padding: 8pt 10pt; }
  .totals .label { color: #666; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.04em; }
  .totals .value { font-size: 14pt; font-weight: 600; margin-top: 2pt; }
  h2 { font-size: 12pt; margin: 18pt 0 6pt; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  th, td { border: 0.5pt solid #ccc; padding: 4pt 6pt; vertical-align: top; }
  th { background: #f2f4f7; text-align: left; font-weight: 600; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .footer { margin-top: 18pt; color: #777; font-size: 8.5pt; border-top: 0.5pt solid #ddd; padding-top: 6pt; }
  .warn { background: #fffbe6; border: 0.5pt solid #f3d775; padding: 6pt 8pt; border-radius: 4pt; margin: 8pt 0; font-size: 9.5pt; color: #6b5300; }
</style>
</head><body>
  <h1>${escapeHtml(name)}</h1>
  <div class="meta">
    ${dossierLabel ? `<div><strong>Dossier :</strong> ${escapeHtml(dossierLabel)}</div>` : ''}
    <div><strong>Profil créancier :</strong> ${result.creditorType === 'particulier' ? 'Particulier' : 'Professionnel'}</div>
    ${
      result.capitalize
        ? `<div><strong>Capitalisation des intérêts :</strong> à compter du ${result.capitalizationStartDate ? fmtDate(result.capitalizationStartDate) : '—'} (art. 1343-2 du Code civil)</div>`
        : ''
    }
    <div><strong>Calculé le :</strong> ${fmtDate(result.computedAt)}</div>
  </div>

  ${
    result.hasExtrapolation
      ? `<div class="warn">⚠ Au moins une période s'étend au-delà du dernier taux officiel publié — le calcul applique le dernier taux connu, à vérifier dès la publication du nouvel arrêté.</div>`
      : ''
  }

  <div class="totals">
    <div class="box"><div class="label">Capital total</div><div class="value">${fmtMoney.format(result.totalCapital)}</div></div>
    <div class="box"><div class="label">Intérêts totaux</div><div class="value">${fmtMoney.format(result.totalInterest)}</div></div>
    <div class="box" style="background:#f0f7ff;border-color:#9bc2ee"><div class="label">Total dû</div><div class="value">${fmtMoney.format(result.totalAmount)}</div></div>
  </div>

  <h2>Postes</h2>
  <table>
    <thead><tr>
      <th>Poste</th><th class="num">Capital</th><th>Du</th><th>Au</th><th class="num">Intérêts</th><th class="num">Total</th>
    </tr></thead>
    <tbody>${tableItems}</tbody>
  </table>

  <h2>Détail par période de taux</h2>
  <table>
    <thead><tr>
      <th>Poste</th><th>Du</th><th>Au</th><th>Période</th><th class="num">Jours</th><th class="num">Capital</th><th class="num">Taux</th><th class="num">Intérêts</th>
    </tr></thead>
    <tbody>${tableSegments}</tbody>
  </table>

  <div class="footer">
    Généré par Mylaw — Calcul effectué selon la formule légale
    capital × taux × jours / nombre de jours de l'année. Taux extraits
    des arrêtés semestriels publiés au Journal Officiel.
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
