import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const PUBLIC = path.join(__dirname, '..', 'public');

describe('the home-screen app (deck spec §6)', () => {
  it('starts at /deck, standalone, with 192 and 512 icons that exist', () => {
    const m = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'manifest.webmanifest'), 'utf8'));
    expect(m).toMatchObject({ name: 'Lowlight', short_name: 'Lowlight', start_url: '/deck', display: 'standalone', background_color: '#0b0712', theme_color: '#0b0712' });
    const sizes = m.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    for (const i of m.icons as { src: string }[]) expect(fs.existsSync(path.join(PUBLIC, i.src.replace(/^\//, '')))).toBe(true);
  });
  it('the page links it', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('<meta name="theme-color" content="#0b0712"');
  });
});
