/**
 * iPhone: print the report to a PDF, then offer it in the share sheet.
 *
 * expo-print renders the HTML on the device into a private cache file with a
 * random name; it is renamed to the report's filename, offered in the share
 * sheet, and removed once the sheet closes. PesaIQ sends nothing itself.
 */
import { File, Paths } from 'expo-file-system';
import { printToFileAsync } from 'expo-print';

import { offerAndRemove } from '../export/saveViaShareSheet';
import type { ReportOutcome } from './types';

export async function saveReportPdf(html: string, filename: string): Promise<ReportOutcome> {
  const { uri } = await printToFileAsync({ html });
  const printed = new File(uri);
  const named = new File(Paths.cache, filename);
  try {
    if (named.exists) named.delete();
    printed.move(named);
  } catch (e) {
    if (printed.exists) printed.delete();
    throw e;
  }
  return offerAndRemove(named, 'application/pdf');
}
