import { DATABASE_IN_USE_MESSAGE, describeOpenError } from '../database/client';

// The exact text Chromium produced in the web preview when a second tab tried
// to open the database.
const LOCK_TEXT =
  "Failed to execute 'createSyncAccessHandle' on 'FileSystemFileHandle': Access Handles cannot be created if there is another open Access Handle or Writable stream associated with the same file.";

describe('describeOpenError', () => {
  it('explains the web database lock held by another tab', () => {
    const lock = Object.assign(new Error(LOCK_TEXT), { name: 'NoModificationAllowedError' });
    expect(describeOpenError(lock)).toBe(DATABASE_IN_USE_MESSAGE);
  });

  it('still recognizes the lock when the name is lost crossing the worker', () => {
    expect(describeOpenError(new Error(`NoModificationAllowedError: ${LOCK_TEXT}`))).toBe(
      DATABASE_IN_USE_MESSAGE,
    );
    expect(describeOpenError(new Error(LOCK_TEXT))).toBe(DATABASE_IN_USE_MESSAGE);
  });

  it('tells the user what to do, not what the browser said', () => {
    expect(DATABASE_IN_USE_MESSAGE).toMatch(/another tab or window/);
    expect(DATABASE_IN_USE_MESSAGE).toMatch(/Try again/);
    expect(DATABASE_IN_USE_MESSAGE).not.toMatch(/SyncAccessHandle|DOMException/);
  });

  it('passes any other failure through unchanged', () => {
    expect(describeOpenError(new Error('disk gone'))).toBe('disk gone');
  });

  it('copes with a failure that is not an Error', () => {
    expect(describeOpenError('boom')).toBe('boom');
    expect(describeOpenError(undefined)).toBe('Could not open the database.');
    expect(describeOpenError({})).toBe('Could not open the database.');
  });
});
