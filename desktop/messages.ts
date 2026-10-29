import path from 'node:path';

/** A start failure in plain words (spec 2026-10-09 preview build §5.2). */
export function startFailureMessage(err: unknown, dataDir: string): string {
  const e = err as NodeJS.ErrnoException | undefined;
  if (e?.code === 'EACCES' || e?.code === 'EPERM' || e?.code === 'EROFS') {
    const rel = e.path ? path.relative(dataDir, e.path) : '';
    const inData = !e.path || rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
    return inData ? `Lowlight couldn't write to its save folder (${dataDir}).` : `Lowlight couldn't read or write ${e.path}.`;
  }
  return `Lowlight couldn't start: ${err instanceof Error ? err.message : String(err)}`;
}
