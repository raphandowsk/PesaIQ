/**
 * The monthly summary as a printable HTML page, turned into a PDF.
 *
 * Self-contained (inline styles, no fonts or images to fetch) so it renders
 * the same wherever it is printed. It carries totals and categories only:
 * no names, phone or account numbers, references or message text.
 */
import { formatAmount, formatLongDate, MINUS } from '../../utils/format';
import { changeOf, type MonthlyReport, type ReportLine } from './summary';

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const tzs = (n: number) => `TZS ${formatAmount(n)}`;

/** "+12%", "−5%", "new", or "—" when both are zero. */
export function changeText(current: number, previous: number): string {
  if (current === 0 && previous === 0) return '—';
  const { pct } = changeOf(current, previous);
  if (pct == null) return 'new';
  const rounded = Math.round(pct * 100);
  if (rounded === 0) return '0%';
  return `${rounded > 0 ? '+' : MINUS}${Math.abs(rounded)}%`;
}

function section(title: string, rows: ReportLine[], previousLabel: string, empty: string): string {
  if (rows.length === 0) return `<h2>${escape(title)}</h2><p class="muted">${escape(empty)}</p>`;
  const body = rows
    .map(
      (r) =>
        `<tr><td>${escape(r.label)}</td><td class="num">${tzs(r.amount)}</td><td class="num">${Math.round(r.share * 100)}%</td><td class="num muted">${tzs(r.previous)}</td><td class="num">${changeText(r.amount, r.previous)}</td></tr>`,
    )
    .join('');
  return `<h2>${escape(title)}</h2><table><thead><tr><th></th><th class="num">Amount</th><th class="num">Share</th><th class="num">${escape(previousLabel)}</th><th class="num">Change</th></tr></thead><tbody>${body}</tbody></table>`;
}

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "pesaiq-summary-2026-09.pdf", or "pesaiq-summary-2026-09-01-to-2026-09-15.pdf" for a range. */
export function reportFilename(report: MonthlyReport): string {
  const { from, to } = report.period;
  const last = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 1);
  const wholeMonth =
    from.getDate() === 1 && to.getDate() === 1 && last.getMonth() === from.getMonth();
  const name = wholeMonth ? isoDay(from).slice(0, 7) : `${isoDay(from)}-to-${isoDay(last)}`;
  return `pesaiq-summary-${name}.pdf`;
}

export function reportHtml(report: MonthlyReport, generatedAt: Date): string {
  const t = report.totals;
  const p = report.previousTotals;
  const prevLabel = report.previous.label;

  const totalsRow = (label: string, now: number, before: number, signed = false) => {
    const shown = signed && now > 0 ? `+${tzs(now)}` : now < 0 ? `${MINUS}${tzs(-now)}` : tzs(now);
    return `<tr><td>${label}</td><td class="num strong">${shown}</td><td class="num muted">${tzs(before)}</td><td class="num">${changeText(now, before)}</td></tr>`;
  };
  // A part of the row above it, set in.
  const partRow = (label: string, now: number, before: number) =>
    `<tr class="part"><td>${label}</td><td class="num">${tzs(now)}</td><td class="num muted">${tzs(before)}</td><td class="num">${changeText(now, before)}</td></tr>`;

  const notes = [
    report.demoCount > 0
      ? `<p class="banner">Includes ${report.demoCount} invented demo sample ${report.demoCount === 1 ? 'record' : 'records'}. Remove demo data in Settings for a report of your own records only.</p>`
      : '',
    report.needsReview > 0
      ? `<p class="note">${report.needsReview} ${report.needsReview === 1 ? 'record is' : 'records are'} still waiting for review, so these totals may change.</p>`
      : '',
  ].join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>PesaIQ summary · ${escape(report.period.label)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #16151c; font-size: 12px; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  h2 { font-size: 14px; margin: 22px 0 6px; }
  .sub { color: #605c72; margin: 0 0 14px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #605c72; border-bottom: 1px solid #e6e4ef; padding: 4px 6px; }
  td { padding: 5px 6px; border-bottom: 1px solid #f3f2f8; }
  .num { text-align: right; white-space: nowrap; }
  .strong { font-weight: 700; }
  .muted { color: #605c72; }
  .banner { background: #eddffd; color: #33165a; padding: 8px 10px; border-radius: 8px; }
  .note { color: #4f2288; }
  .part td:first-child { padding-left: 20px; color: #605c72; }
  footer { margin-top: 26px; color: #605c72; font-size: 10px; border-top: 1px solid #e6e4ef; padding-top: 8px; }
</style></head><body>
<h1>Monthly summary · ${escape(report.period.label)}</h1>
<p class="sub">Compared with ${escape(prevLabel)} · ${t.count} ${t.count === 1 ? 'record' : 'records'}</p>
${notes}
<table><thead><tr><th></th><th class="num">This period</th><th class="num">${escape(prevLabel)}</th><th class="num">Change</th></tr></thead><tbody>
${totalsRow('Money in', t.received, p.received)}
${totalsRow('Spent', t.spent, p.spent)}
${totalsRow('Fees &amp; taxes', t.charges, p.charges)}
${partRow('Operator fees', t.operatorFees, p.operatorFees)}
${partRow('Taxes', t.taxes, p.taxes)}
${totalsRow('Net', t.net, p.net, true)}
</tbody></table>
${section('Spending by category', report.spending, prevLabel, 'Nothing spent in this period.')}
${section('Income by category', report.income, prevLabel, 'No income in this period.')}
${section('Fees & taxes by type', report.fees, prevLabel, 'No fees or taxes in this period.')}
<footer>Made by PesaIQ on ${escape(formatLongDate(generatedAt))}, from messages saved on this phone. Net is money in minus spending, fees and taxes. Operator fees + taxes = fees and taxes; operator fees are what the provider or agent charged, less the VAT inside the fee. This is a personal summary, not a bank statement or a tax document.</footer>
</body></html>`;
}
