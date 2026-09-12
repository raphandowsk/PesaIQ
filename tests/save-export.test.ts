import { isPickerCancelled, saveExport } from '../services/export/saveExport';

// The native module is not available under Jest; only its shape matters here.
const mockPick = jest.fn();
jest.mock('expo-file-system', () => ({
  Directory: { pickDirectoryAsync: () => mockPick() },
}));

const FILE = {
  filename: 'pesaiq-export-2026-09-12.csv',
  mimeType: 'text/csv',
  content: 'Date,Type\r\n',
};

function pickedFolder(savedAs = FILE.filename) {
  const write = jest.fn();
  const createFile = jest.fn(() => ({ name: savedAs, write }));
  return { folder: { createFile }, createFile, write };
}

beforeEach(() => mockPick.mockReset());

describe('saveExport (Android)', () => {
  it('writes the file into the folder the user picked', async () => {
    const { folder, createFile, write } = pickedFolder();
    mockPick.mockResolvedValue(folder);

    await expect(saveExport(FILE)).resolves.toEqual({ status: 'saved', name: FILE.filename });
    expect(createFile).toHaveBeenCalledWith(FILE.filename, 'text/csv');
    expect(write).toHaveBeenCalledWith(FILE.content);
  });

  it('reports the name Android used when a file of that name already existed', async () => {
    mockPick.mockResolvedValue(pickedFolder('pesaiq-export-2026-09-12 (1).csv').folder);

    await expect(saveExport(FILE)).resolves.toEqual({
      status: 'saved',
      name: 'pesaiq-export-2026-09-12 (1).csv',
    });
  });

  it('treats backing out of the picker as a cancel, and writes nothing', async () => {
    mockPick.mockRejectedValue(
      Object.assign(new Error('The file picker was cancelled by the user'), {
        code: 'ERR_PICKER_CANCELLED',
      }),
    );

    await expect(saveExport(FILE)).resolves.toEqual({ status: 'cancelled' });
  });

  it('passes any other failure on, so the screen can say so', async () => {
    mockPick.mockRejectedValue(new Error('No activity found to handle the picker'));

    await expect(saveExport(FILE)).rejects.toThrow('No activity found');
  });
});

describe('isPickerCancelled', () => {
  it('recognises the cancel by its code or its message', () => {
    expect(isPickerCancelled({ code: 'ERR_PICKER_CANCELLED' })).toBe(true);
    expect(isPickerCancelled(new Error('The file picker was cancelled by the user'))).toBe(true);
  });

  it('does not mistake other failures for a cancel', () => {
    expect(isPickerCancelled(new Error('Permission denied'))).toBe(false);
    expect(isPickerCancelled(null)).toBe(false);
    expect(isPickerCancelled('cancel')).toBe(false);
  });
});
