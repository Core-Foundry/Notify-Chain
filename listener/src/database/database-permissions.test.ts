/**
 * #1000 - Harden local database file permissions.
 *
 * Verifies the helper that the Database service uses to restrict POSIX modes on
 * the SQLite main file, its WAL/SHM sidecars and the containing directory.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  applyRestrictiveMode,
  DATABASE_FILE_MODE,
  DIRECTORY_MODE,
} from './database';

const isWindows = process.platform === 'win32';

describe('applyRestrictiveMode (#1000)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nc-dbperm-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('sets the SQLite file to owner-only read/write', () => {
    if (isWindows) return;
    const dbFile = path.join(tmpDir, 'notifications.db');
    fs.writeFileSync(dbFile, 'x', { mode: 0o644 });

    applyRestrictiveMode(dbFile, DATABASE_FILE_MODE);

    expect(fs.statSync(dbFile).mode & 0o777).toBe(0o600);
  });

  it('sets the directory to owner-only', () => {
    if (isWindows) return;
    fs.chmodSync(tmpDir, 0o755);

    applyRestrictiveMode(tmpDir, DIRECTORY_MODE);

    expect(fs.statSync(tmpDir).mode & 0o777).toBe(0o700);
  });

  it('tightens the WAL and SHM sidecars too', () => {
    if (isWindows) return;
    const dbFile = path.join(tmpDir, 'notifications.db');
    fs.writeFileSync(dbFile, 'x', { mode: 0o644 });
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = `${dbFile}${suffix}`;
      fs.writeFileSync(sidecar, 'x', { mode: 0o644 });
      applyRestrictiveMode(sidecar, DATABASE_FILE_MODE);
      expect(fs.statSync(sidecar).mode & 0o777).toBe(0o600);
    }
  });

  it('is a no-op for a path that does not exist (never throws)', () => {
    expect(() =>
      applyRestrictiveMode(path.join(tmpDir, 'absent.db'), DATABASE_FILE_MODE),
    ).not.toThrow();
  });

  it('never throws when chmod is not permitted', () => {
    // A path that exists but is a broken symlink target exercises the catch.
    const link = path.join(tmpDir, 'dangling.db');
    try {
      fs.symlinkSync(path.join(tmpDir, 'nowhere'), link);
    } catch {
      return; // symlinks unsupported here
    }
    expect(() => applyRestrictiveMode(link, DATABASE_FILE_MODE)).not.toThrow();
  });
});
