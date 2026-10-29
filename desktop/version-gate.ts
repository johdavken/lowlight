import fs from 'node:fs';
import path from 'node:path';

export { compareVersions } from '../shared/semver';
import { compareVersions } from '../shared/semver';

export type DataGate = { kind: 'fresh' } | { kind: 'same' } | { kind: 'upgraded'; backup: string } | { kind: 'newer'; dataVersion: string };

const versionFile = (userData: string) => path.join(userData, 'version.json');

function lastVersion(userData: string): string | null {
  try {
    const v = (JSON.parse(fs.readFileSync(versionFile(userData), 'utf8')) as { lastVersion?: unknown }).lastVersion;
    return typeof v === 'string' && v !== '' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Before the server opens the saves (spec §4.3): data last opened by an older (or unknown) build is
 * copied to data.backup-<version> once; data from a newer build is refused. Never writes version.json.
 */
export function gateData(userData: string, appVersion: string): DataGate {
  const data = path.join(userData, 'data');
  if (!fs.existsSync(data)) return { kind: 'fresh' };
  const last = lastVersion(userData);
  if (last !== null) {
    const cmp = compareVersions(last, appVersion);
    if (cmp === 0) return { kind: 'same' };
    if (cmp > 0) return { kind: 'newer', dataVersion: last };
  }
  let backup = path.join(userData, `data.backup-${last ?? 'unknown'}`);
  // A known version is backed up once. With no version to go by, an existing backup may be of older
  // saves, so this launch's saves get their own, stamped with the time.
  if (last === null && fs.existsSync(backup)) backup = `${backup}-${new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)}`;
  if (!fs.existsSync(backup)) {
    // Copied beside it, then renamed into place: a copy that fails (or a crash mid-copy) never counts as the backup.
    const partial = `${backup}.partial`;
    fs.rmSync(partial, { recursive: true, force: true });
    try {
      fs.cpSync(data, partial, { recursive: true });
    } catch (err) {
      fs.rmSync(partial, { recursive: true, force: true });
      throw err;
    }
    fs.renameSync(partial, backup);
  }
  return { kind: 'upgraded', backup };
}

/** Records that `appVersion` opened the saves; called only after the server started. */
export function markVersion(userData: string, appVersion: string): void {
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(versionFile(userData), `${JSON.stringify({ lastVersion: appVersion })}\n`);
}
