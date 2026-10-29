import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { startFailureMessage } from '../messages';

const data = path.join('/home', 'Jöhn Smith', '.config', 'Lowlight', 'data');
const errno = (code: string, p?: string) => Object.assign(new Error(`${code}: permission denied, open '${p}'`), { code, path: p });

describe('startFailureMessage', () => {
  it('a permission error inside the save folder names the save folder', () => {
    expect(startFailureMessage(errno('EACCES', path.join(data, 'settings.json')), data)).toBe(`Lowlight couldn't write to its save folder (${data}).`);
    expect(startFailureMessage(errno('EPERM', data), data)).toBe(`Lowlight couldn't write to its save folder (${data}).`);
  });

  it('a permission error elsewhere names that file, not the save folder (minor)', () => {
    const content = path.join('/opt', 'Lowlight', 'resources', 'content', 'map', 'lowlight.json');
    expect(startFailureMessage(errno('EACCES', content), data)).toBe(`Lowlight couldn't read or write ${content}.`);
  });

  it('a permission error with no path, or any other error, says what failed', () => {
    expect(startFailureMessage(errno('EACCES'), data)).toBe(`Lowlight couldn't write to its save folder (${data}).`);
    expect(startFailureMessage(new Error('boom'), data)).toBe("Lowlight couldn't start: boom");
  });
});
