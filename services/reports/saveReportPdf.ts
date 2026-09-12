/**
 * Android: print the report to a PDF, then write it into a folder the user picks.
 *
 * expo-print renders the HTML on the device into a private cache file; its
 * bytes are copied into the chosen folder and the cache copy is removed.
 * Nothing is shared or uploaded. (The web build uses saveReportPdf.web.ts.)
 */
import { Directory, File } from 'expo-file-system';
import { printToFileAsync } from 'expo-print';

import { isPickerCancelled } from '../export/saveExport';
import type { ReportOutcome } from './types';

export async function saveReportPdf(html: string, filename: string): Promise<ReportOutcome> {
  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch (e) {
    if (isPickerCancelled(e)) return { status: 'cancelled' };
    throw e;
  }

  const { uri } = await printToFileAsync({ html });
  const printed = new File(uri);
  try {
    // Android renames a clash to "name (1).pdf", so report the name it used.
    const created = folder.createFile(filename, 'application/pdf');
    created.write(await printed.bytes());
    return { status: 'saved', name: created.name };
  } finally {
    if (printed.exists) printed.delete();
  }
}
