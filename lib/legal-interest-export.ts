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
        ? `Oui — à compter du ${result.capitalizationStartDate ? fmtDate(result.capitalizationStartDate) : '—'}, tous les ${result.capitalizationPeriodMonths ?? 12} mois`
        : 'Non',
    ],
    ['Taux majoré (art. L.313-3 CMF)',
      result.increasedRate
        ? `Oui — signification le ${result.judgmentNotificationDate ? fmtDate(result.judgmentNotificationDate) : '—'}, majoration de +5 pts à compter du ${result.increasedRateStartDate ? fmtDate(result.increasedRateStartDate) : '—'}`
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

/**
 * Calcule la période globale couverte par un calcul (date la plus
 * basse de toutes les lignes → date la plus haute). Sert à composer le
 * titre du document PDF demandé par le cabinet.
 */
function overallPeriod(result: InterestComputationResult): { from: Date; to: Date } | null {
  if (!result.items.length) return null;
  const starts = result.items.map((it) => new Date(it.startDate).getTime());
  const ends = result.items.map((it) => new Date(it.endDate).getTime());
  return {
    from: new Date(Math.min(...starts)),
    to: new Date(Math.max(...ends)),
  };
}

function pdfTitle(result: InterestComputationResult): string {
  const period = overallPeriod(result);
  if (!period) return 'Intérêts au taux légal';
  return `Intérêts au taux légal sur la période du ${fmtDate(period.from)} au ${fmtDate(period.to)}`;
}

export function exportInterestPdf(args: {
  name: string;
  result: InterestComputationResult;
  /** Conservé pour compat avec les appelants existants — non rendu dans le PDF. */
  dossierLabel?: string;
}) {
  const { result } = args;
  const title = pdfTitle(result);
  const html = renderHtml({ title, result });
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
  title: string;
  result: InterestComputationResult;
}): string {
  const { title, result } = args;

  const tableItems = result.items
    .map(
      (it) => `
        <tr>
          <td>${escapeHtml(it.label)}</td>
          <td class="num">${fmtMoney.format(it.amount)}</td>
          <td>${fmtDate(it.startDate)}</td>
          <td>${fmtDate(it.endDate)}</td>
          <td class="num">${fmtMoney.format(it.interest)}</td>
          <td class="num strong">${fmtMoney.format(it.total)}</td>
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
          <td class="num">${fmtMoney.format(s.interest)}${s.capitalizedAfter ? ' <span class="cap-mark">↻</span>' : ''}</td>
        </tr>
      `,
        )
        .join(''),
    )
    .join('');

  // ── Style « rapport » : palette neutre, typographie sérieuse,
  // tableaux propres avec lignes alternées et minimum de bordures. ──
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page { margin: 22mm 18mm 20mm; }
  :root {
    --ink: #1a1a1a;
    --ink-soft: #4b5563;
    --ink-faint: #6b7280;
    --rule: #d1d5db;
    --rule-soft: #e5e7eb;
    --accent: #1d3557;
    --accent-soft: #f5f7fb;
  }
  * { box-sizing: border-box; }
  body {
    font-family: "Source Serif Pro", "Charter", "Iowan Old Style", Georgia, "Times New Roman", serif;
    color: var(--ink);
    font-size: 10.5pt;
    line-height: 1.45;
    margin: 0;
  }
  .doc-header {
    border-bottom: 1pt solid var(--rule);
    padding-bottom: 10pt;
    margin-bottom: 18pt;
  }
  .doc-eyebrow {
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 8pt;
    color: var(--ink-faint);
    margin-bottom: 4pt;
  }
  h1 {
    font-family: "Source Serif Pro", "Charter", Georgia, serif;
    font-size: 17pt;
    font-weight: 600;
    margin: 0;
    letter-spacing: 0.005em;
    color: var(--accent);
    line-height: 1.25;
  }
  .meta {
    margin-top: 10pt;
    font-size: 9.5pt;
    color: var(--ink-soft);
    display: grid;
    grid-template-columns: max-content 1fr;
    column-gap: 16pt;
    row-gap: 3pt;
  }
  .meta dt { font-weight: 600; color: var(--ink); }
  .meta dd { margin: 0; }

  .totals {
    display: flex;
    gap: 12pt;
    margin: 18pt 0 22pt;
  }
  .totals .box {
    flex: 1;
    border: 0.6pt solid var(--rule);
    border-radius: 4pt;
    padding: 9pt 12pt;
    background: #fff;
  }
  .totals .box.primary {
    background: var(--accent-soft);
    border-color: var(--accent);
  }
  .totals .label {
    font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
    color: var(--ink-faint);
    font-size: 7.5pt;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
  .totals .value {
    font-size: 14pt;
    font-weight: 600;
    margin-top: 4pt;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .totals .box.primary .value { color: var(--accent); }

  h2 {
    font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 9pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--ink-soft);
    margin: 22pt 0 8pt;
    padding-bottom: 4pt;
    border-bottom: 0.6pt solid var(--rule);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9.5pt;
  }
  th, td {
    padding: 5pt 6pt;
    vertical-align: top;
  }
  th {
    text-align: left;
    font-weight: 600;
    color: var(--ink-soft);
    font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 0.6pt solid var(--ink);
  }
  td { border-bottom: 0.4pt solid var(--rule-soft); }
  tbody tr:last-child td { border-bottom: 0.6pt solid var(--ink); }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.strong { font-weight: 600; }
  tr.cap td { background: #f8f5ee; }
  .cap-mark {
    display: inline-block;
    margin-left: 3pt;
    font-size: 9pt;
    color: var(--accent);
  }

  .footer {
    margin-top: 24pt;
    padding-top: 8pt;
    border-top: 0.4pt solid var(--rule);
    color: var(--ink-faint);
    font-size: 8.5pt;
    font-style: italic;
  }
</style>
</head><body>
  <header class="doc-header">
    <div class="doc-eyebrow">Calcul d'intérêts</div>
    <h1>${escapeHtml(title)}</h1>
    <dl class="meta">
      <dt>Profil créancier</dt>
      <dd>${result.creditorType === 'particulier' ? 'Particulier' : 'Professionnel'}</dd>
      ${
        result.capitalize
          ? `<dt>Capitalisation</dt>
             <dd>À compter du ${result.capitalizationStartDate ? fmtDate(result.capitalizationStartDate) : '—'}, tous les ${result.capitalizationPeriodMonths ?? 12} mois (art. 1343-2 du Code civil)</dd>`
          : ''
      }
      ${
        result.increasedRate
          ? `<dt>Taux majoré</dt>
             <dd>Signification du jugement le ${result.judgmentNotificationDate ? fmtDate(result.judgmentNotificationDate) : '—'} — majoration de +5 points à compter du ${result.increasedRateStartDate ? fmtDate(result.increasedRateStartDate) : '—'} (art. L.313-3 du Code monétaire et financier)</dd>`
          : ''
      }
      <dt>Édité le</dt>
      <dd>${fmtDate(result.computedAt)}</dd>
    </dl>
  </header>

  <div class="totals">
    <div class="box"><div class="label">Capital total</div><div class="value">${fmtMoney.format(result.totalCapital)}</div></div>
    <div class="box"><div class="label">Intérêts totaux</div><div class="value">${fmtMoney.format(result.totalInterest)}</div></div>
    <div class="box primary"><div class="label">Total dû</div><div class="value">${fmtMoney.format(result.totalAmount)}</div></div>
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
    Calcul effectué selon la formule capital × taux × jours / nombre de jours de l'année,
    avec découpage par semestre officiel.
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
