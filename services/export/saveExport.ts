/**
 * Android: write the export into a folder the user picks.
 *
 * The system folder picker grants access to that one folder. The file is
 * created there and nothing is shared or uploaded. Backing out of the picker
 * saves nothing. (The web build uses saveExport.web.ts instead.)
 */
import { Directory } from 'expo-file-system';

import type { ExportFile } from '../../features/export/format';
import type { SaveOutcome } from './types';

/** What expo-file-system rejects the picker with when the user backs out. */
const PICKER_CANCELLED = 'ERR_PICKER_CANCELLED';

export function isPickerCancelled(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const { code, message } = e as { code?: unknown; message?: unknown };
  return code === PICKER_CANCELLED || (typeof message === 'string' && /cancel/i.test(message));
}

export async function saveExport(file: ExportFile): Promise<SaveOutcome> {
  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch (e) {
    if (isPickerCancelled(e)) return { status: 'cancelled' };
    throw e;
  }

  // Android renames a clash to "name (1).csv", so report the name it used.
  const created = folder.createFile(file.filename, file.mimeType);
  created.write(file.content);
  return { status: 'saved', name: created.name };
}
