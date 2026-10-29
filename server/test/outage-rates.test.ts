import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { outageRates } from '../src/outage-rates';

describe('outageRates', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
    vi.restoreAllMocks();
  });
  const mapDir = (files: Record<string, unknown>) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rates-'));
    dirs.push(root);
    fs.mkdirSync(path.join(root, 'city', 'districts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'lowlight.json'), JSON.stringify({ districts: [{ id: 'marsh' }, { id: 'velvet' }, { id: 'spine' }] }));
    for (const [n, v] of Object.entries(files)) fs.writeFileSync(path.join(root, 'city', 'districts', n), JSON.stringify(v));
    return path.join(root, 'lowlight.json');
  };

  it("reads each district's rate, and _default's for a district without one", () => {
    const file = mapDir({ '_default.json': { blackout: { outage: 0.1 } }, 'marsh.json': { blackout: { outage: 0.25 } }, 'velvet.json': { blackout: { backup: 0.03 } } });
    expect(outageRates(file)).toEqual({ _default: 0.1, marsh: 0.25, velvet: 0.1, spine: 0.1 });
  });

  it('gives nothing without the folder, and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(outageRates(path.join(os.tmpdir(), 'no-such-map-dir', 'lowlight.json'))).toEqual({});
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
