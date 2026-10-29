import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { cardData, cardOf, labelFaces, pngWithCard } from './cast';

const tinyPng = () => PNG.sync.write(Object.assign(new PNG({ width: 2, height: 2 }), {}));

describe('labelFaces', () => {
  it("maps SillyTavern's labels to the nearest of a character's own faces", () => {
    const m = labelFaces(['smile', 'amused', 'annoyed', 'concerned']);
    expect(m.joy).toBe('smile');
    expect(m.amusement).toBe('amused');
    expect(m.anger).toBe('annoyed');
    expect(m.sadness).toBe('concerned');
  });

  it('leaves out a label none of their faces is near', () => {
    expect(labelFaces(['annoyed', 'angry'])).not.toHaveProperty('joy');
    expect(labelFaces(['annoyed', 'angry']).anger).toBe('angry');
  });
});

describe('pngWithCard', () => {
  it('a card written into a PNG reads back, and the PNG still decodes', () => {
    const card = cardData({ name: 'Cass', description: 'You are Cass.', firstMes: '*She looks up.*', systemPrompt: 'Write in beats.', world: 'Lowlight' });
    const out = pngWithCard(tinyPng(), card);
    expect(cardOf(out)).toEqual(card);
    expect(PNG.sync.read(out).width).toBe(2);
  });

  it('replaces an old card rather than adding a second', () => {
    const once = pngWithCard(tinyPng(), cardData({ name: 'Old', description: '', firstMes: '', systemPrompt: '', world: 'Lowlight' }));
    const twice = pngWithCard(once, cardData({ name: 'New', description: '', firstMes: '', systemPrompt: '', world: 'Lowlight' }));
    expect((cardOf(twice) as { data: { name: string } }).data.name).toBe('New');
    expect(twice.toString('latin1').split('chara\0').length - 1).toBe(1);
  });

  it('keeps non-ASCII text intact (names and em dashes in identity files)', () => {
    const card = cardData({ name: 'Inès', description: 'Low — even.', firstMes: '', systemPrompt: '', world: 'Lowlight' });
    expect((cardOf(pngWithCard(tinyPng(), card)) as { data: { description: string } }).data.description).toBe('Low — even.');
  });

  it('refuses something that is not a PNG', () => {
    expect(() => pngWithCard(Buffer.from('nope'), {})).toThrow(/not a PNG/);
  });
});
