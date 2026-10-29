/** Compares two semver strings; a prerelease sorts before its release, and numeric parts numerically. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const split = (v: string) => {
    const [core, pre] = v.split('-', 2) as [string, string | undefined];
    return { core: core.split('.').map(Number), pre: pre === undefined ? null : pre.split('.') };
  };
  const sign = (n: number) => (n < 0 ? -1 : n > 0 ? 1 : 0) as -1 | 0 | 1;
  const x = split(a);
  const y = split(b);
  for (let i = 0; i < 3; i++) if ((x.core[i] ?? 0) !== (y.core[i] ?? 0)) return sign((x.core[i] ?? 0) - (y.core[i] ?? 0));
  if (x.pre === null || y.pre === null) return x.pre === y.pre ? 0 : x.pre === null ? 1 : -1;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const [p, q] = [x.pre[i], y.pre[i]];
    if (p === q) continue;
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const [np, nq] = [Number(p), Number(q)];
    if (Number.isInteger(np) && Number.isInteger(nq)) return sign(np - nq);
    return p < q ? -1 : 1;
  }
  return 0;
}
