import { saveExport } from '../services/export/saveViaShareSheet';
import { saveReportPdf } from '../services/reports/printToShareSheet';

// The native modules are not available under Jest; a small in-memory cache
// stands in for the file system, and the share sheet is a mock.
const mockFiles = new Map<string, string | Uint8Array>();
const mockShare = jest.fn();
const mockPrint = jest.fn();

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get name() {
      return this.uri.split('/').pop();
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    create() {
      mockFiles.set(this.uri, '');
    }
    write(content: string) {
      mockFiles.set(this.uri, content);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
    move(to: MockFile) {
      mockFiles.set(to.uri, mockFiles.get(this.uri)!);
      mockFiles.delete(this.uri);
      this.uri = to.uri;
    }
  }
  return { File: MockFile, Paths: { cache: { uri: 'file:///cache' } } };
});
jest.mock('expo-sharing', () => ({ shareAsync: (...args: unknown[]) => mockShare(...args) }));
jest.mock('expo-print', () => ({ printToFileAsync: (...args: unknown[]) => mockPrint(...args) }));

beforeEach(() => {
  mockFiles.clear();
  mockShare.mockReset();
  mockPrint.mockReset();
});

describe('saving on iPhone: the share sheet', () => {
  it('offers the export under its own name, as the right type, then removes the copy', async () => {
    let shared: string | Uint8Array | undefined;
    mockShare.mockImplementation(async (uri: string) => {
      shared = mockFiles.get(uri);
    });

    const outcome = await saveExport({
      filename: 'pesaiq-export-2026-10-05.csv',
      mimeType: 'text/csv',
      content: 'Date,Type\r\n',
    });

    expect(outcome).toEqual({ status: 'shared', name: 'pesaiq-export-2026-10-05.csv' });
    expect(mockShare).toHaveBeenCalledWith('file:///cache/pesaiq-export-2026-10-05.csv', {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
      dialogTitle: 'pesaiq-export-2026-10-05.csv',
    });
    expect(shared).toBe('Date,Type\r\n');
    expect(mockFiles.size).toBe(0);
  });

  it('removes the copy even when the share sheet fails', async () => {
    mockShare.mockRejectedValue(new Error('Sharing is not available'));

    await expect(
      saveExport({ filename: 'records.json', mimeType: 'application/json', content: '[]' }),
    ).rejects.toThrow('Sharing is not available');
    expect(mockFiles.size).toBe(0);
  });

  it('prints the report, renames it to the report’s filename, offers it, then removes it', async () => {
    mockPrint.mockImplementation(async () => {
      mockFiles.set('file:///cache/Print/3F2A.pdf', 'PDF');
      return { uri: 'file:///cache/Print/3F2A.pdf' };
    });
    mockShare.mockResolvedValue(undefined);

    const outcome = await saveReportPdf('<h1>Report</h1>', 'pesaiq-report-2026-09.pdf');

    expect(mockPrint).toHaveBeenCalledWith({ html: '<h1>Report</h1>' });
    expect(outcome).toEqual({ status: 'shared', name: 'pesaiq-report-2026-09.pdf' });
    expect(mockShare).toHaveBeenCalledWith(
      'file:///cache/pesaiq-report-2026-09.pdf',
      expect.objectContaining({ mimeType: 'application/pdf', UTI: 'com.adobe.pdf' }),
    );
    expect(mockFiles.size).toBe(0);
  });
});
