/**
 * Web: the browser saves the file, usually to Downloads.
 *
 * The file is built in memory and handed to the browser's own download. It is
 * never uploaded; there is no server to upload it to.
 */
import type { ExportFile } from '../../features/export/format';
import type { SaveOutcome } from './types';

export function saveExport(file: ExportFile): Promise<SaveOutcome> {
  const blob = new Blob([file.content], { type: `${file.mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = file.filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // After the click has been handled, so the download has started.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return Promise.resolve({ status: 'saved', name: file.filename });
}
