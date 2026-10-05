/**
 * Saving the monthly report as a PDF, per platform: Android writes into a
 * folder the person picks (printToFolder.ts); iPhone offers it in the share
 * sheet (saveReportPdf.ios.ts); the web build opens the print window
 * (saveReportPdf.web.ts).
 */
export { saveReportPdf } from './printToFolder';
