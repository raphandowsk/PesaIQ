/**
 * Web: print the report from a hidden frame, where the browser offers
 * "Save as PDF".
 *
 * expo-print's web build prints the whole app page, so the report is printed
 * from its own frame instead. The page is built in memory and never uploaded;
 * there is no server to upload it to. The browser does not say whether the
 * user saved or cancelled, so the outcome is only that the print window opened.
 */
import type { ReportOutcome } from './types';

/** Long enough for the print dialog to have read the frame. */
const CLEANUP_MS = 60_000;

export function saveReportPdf(html: string, filename: string): Promise<ReportOutcome> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  // The PDF is named after the page title in most browsers.
  frame.srcdoc = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${filename.replace(/\.pdf$/, '')}</title>`,
  );

  return new Promise((resolve) => {
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), CLEANUP_MS);
      resolve({ status: 'printing' });
    };
    document.body.appendChild(frame);
  });
}
