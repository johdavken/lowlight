import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** One rule's body, from its selector to the closing brace. */
function rule(file: string, selector: string): string {
  const css = readFileSync(file, 'utf8');
  const at = css.indexOf(`${selector} {`);
  expect(at, `${selector} in ${file}`).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf('}', at));
}

describe('SAVE opens centred, clear of the top bar', () => {
  it('centred across and at 40 % down', () => {
    const save = rule('web/src/room/save-card.css', '.save-card');
    expect(save).toContain('left: 50%;');
    expect(save).toContain('top: 40%;');
    // The individual translate, so the glitch-in's transform keyframes don't knock it off centre.
    expect(save).toContain('translate: -50% -50%;');
    expect(save).not.toContain('transform: translate(');
  });
});
