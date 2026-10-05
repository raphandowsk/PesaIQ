/**
 * iPhone: hand the export to the share sheet.
 *
 * iOS has no "pick a folder" for apps. The file is written to this app's
 * private cache under its proper name and offered in the share sheet, where
 * the person chooses Save to Files, AirDrop, Mail or an app. PesaIQ sends
 * nothing itself. The cache copy is deleted once the sheet closes.
 *
 * The share sheet does not say what the person chose, so the outcome is
 * `shared`, never `saved`.
 */
import { File, Paths } from 'expo-file-system';
import { shareAsync } from 'expo-sharing';

import type { ExportFile } from '../../features/export/format';
import type { SaveOutcome } from './types';

/** Apple's type identifiers, so the sheet offers the right apps. */
const UTI: Record<string, string> = {
  'text/csv': 'public.comma-separated-values-text',
  'application/json': 'public.json',
  'application/pdf': 'com.adobe.pdf',
};

/** Offers a file already in the cache, then removes it. */
export async function offerAndRemove(file: File, mimeType: string): Promise<SaveOutcome> {
  try {
    await shareAsync(file.uri, { mimeType, UTI: UTI[mimeType], dialogTitle: file.name });
    return { status: 'shared', name: file.name };
  } finally {
    if (file.exists) file.delete();
  }
}

export async function saveExport(file: ExportFile): Promise<SaveOutcome> {
  const temp = new File(Paths.cache, file.filename);
  temp.create({ overwrite: true });
  temp.write(file.content);
  return offerAndRemove(temp, file.mimeType);
}
