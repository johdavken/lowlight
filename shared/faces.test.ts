import { describe, expect, it } from 'vitest';
import { faceFor } from './faces';

const hicks = ['happy', 'concerned', 'angry', 'annoyed'];
const nix = ['happy', 'annoyed', 'concerned', 'tired'];
const rot = ['annoyed', 'angry'];
const cass = ['smile', 'annoyed', 'concerned', 'angry'];

describe('faceFor', () => {
  it('a kind lands on its own face', () => expect(faceFor('I grin at him.', hicks)).toBe('happy'));

  it('falls back in order', () => {
    expect(faceFor('He smirks.', hicks)).toBe('happy'); // amused → smile → happy
    expect(faceFor('She smiles.', cass)).toBe('smile');
    expect(faceFor('I grin.', cass)).toBe('smile'); // happy → smile
    expect(faceFor('I yawn into my sleeve.', hicks)).toBe('concerned'); // tired → concerned
    expect(faceFor('I yawn into my sleeve.', nix)).toBe('tired');
  });

  it('a kind with nowhere to land is ignored', () => expect(faceFor('She smiles.', rot)).toBeNull());

  it('the last match wins', () => expect(faceFor('I grin. Then my jaw sets.', hicks)).toBe('angry'));

  it('an earlier match still counts when a later action matches nothing', () => expect(faceFor('I grin. I set the mug down.', hicks)).toBe('happy'));

  it('a later match with nowhere to land leaves the earlier one', () => expect(faceFor('He glares. Then he smiles.', rot)).toBe('angry'));

  it('negation and "almost" skip a match', () => {
    expect(faceFor('I almost smile at "no one really." It doesn\'t get far.', nix)).toBeNull();
    expect(faceFor("He doesn't smile.", hicks)).toBeNull();
    expect(faceFor('without a smile', hicks)).toBeNull();
    expect(faceFor('He fails to smile.', hicks)).toBeNull();
  });

  it('negation reaches only three words back', () => expect(faceFor('Not tonight, not here, and then he grins.', hicks)).toBe('happy'));

  it('capitals and punctuation', () => {
    expect(faceFor('Grins.', hicks)).toBe('happy');
    expect(faceFor('—grins', hicks)).toBe('happy');
  });

  it('each kind from real lines', () => {
    expect(faceFor('I roll my eyes.', hicks)).toBe('annoyed');
    expect(faceFor('Her brow creases.', hicks)).toBe('concerned');
    expect(faceFor('I bite my lip.', hicks)).toBe('concerned');
    expect(faceFor('My jaw tightens.', hicks)).toBe('angry');
    expect(faceFor('I rub my eyes.', nix)).toBe('tired');
    expect(faceFor('She smirks.', ['amused', 'smile'])).toBe('amused');
  });

  it('plain actions stay null', () => {
    for (const a of ['I set the mug down.', 'The kettle ticks.', 'My thumb finds the token.', 'I push off the desk and stand. Not aggressive. Just vertical.']) {
      expect(faceFor(a, hicks)).toBeNull();
    }
  });

  it('no faces, no face', () => expect(faceFor('I grin.', [])).toBeNull());

  it('a negation just after the word skips it', () => {
    expect(faceFor("The smile's not there.", hicks)).toBeNull();
    expect(faceFor('The grin is gone.', hicks)).toBeNull();
    expect(faceFor('The smile fades.', hicks)).toBeNull();
    expect(faceFor('Her smile falters.', hicks)).toBeNull();
  });

  describe("whose face: someone else's pronoun opening the clause skips it", () => {
    it("in her reply, his smile isn't hers", () => {
      expect(faceFor('He smiles the way a man smiles.', nix, 'she')).toBeNull();
      expect(faceFor('He laughs. I can feel it.', nix, 'she')).toBeNull();
      expect(faceFor('His mouth twitches.', ['amused', 'happy'], 'she')).toBeNull();
    });

    it('her own pronoun, I, a bare verb and a name all count', () => {
      expect(faceFor("She's grinning like an idiot.", nix, 'she')).toBe('happy');
      expect(faceFor('Her grin goes crooked.', nix, 'she')).toBe('happy');
      expect(faceFor('I laugh once, short.', nix, 'she')).toBe('happy');
      expect(faceFor('Grinning.', nix, 'she')).toBe('happy');
      expect(faceFor('Hicks grins.', hicks, 'he')).toBe('happy');
    });

    it("a male contact's he is his own", () => expect(faceFor('He smirks.', hicks, 'he')).toBe('happy'));

    it('separate actions (joined by line breaks) are separate clauses', () => expect(faceFor('I frown\nhe laughs', nix, 'she')).toBe('concerned'));

    it('a clause after "and" or a comma has its own subject', () => {
      expect(faceFor('He laughs and I grin.', nix, 'she')).toBe('happy');
      expect(faceFor('I grin, and he laughs.', nix, 'she')).toBe('happy');
    });

    it('without a pronoun (the player), only I and bare verbs count', () => {
      expect(faceFor('I grin.', hicks, null)).toBe('happy');
      expect(faceFor('She grins at me.', hicks, null)).toBeNull();
      expect(faceFor('He grins.', hicks, null)).toBeNull();
    });
  });

  describe('final review', () => {
    it('a fading word clears the face, not just its own match', () => {
      expect(faceFor('I smile. The smile is gone.', nix, 'she')).toBeNull();
      expect(faceFor('I grin, then glare. The glare fades.', hicks, 'he')).toBeNull();
    });

    it('the negation and fading windows stop at a clause end', () => {
      expect(faceFor('No. I grin.', hicks, 'he')).toBe('happy');
      expect(faceFor("Doesn't answer. Smiles.", hicks, 'he')).toBe('happy');
      expect(faceFor('I grin, not bothering to hide it.', hicks, 'he')).toBe('happy');
      expect(faceFor('She smiles and slips the chip across.', nix, 'she')).toBe('happy');
      expect(faceFor('She grins and drops the bag.', nix, 'she')).toBe('happy');
    });

    it('an em dash with no space is a clause end', () => {
      expect(faceFor('He frowns—I laugh.', nix, 'she')).toBe('happy');
    });
  });

  describe('things, not people', () => {
    it("a clause whose subject is a thing isn't a face", () => {
      expect(faceFor('The door slams.', hicks, 'he')).toBeNull();
      expect(faceFor('The couch sags under him.', nix, 'she')).toBeNull();
      expect(faceFor('A fist of wind hits the window.', hicks, 'he')).toBeNull();
    });

    it("laughter from elsewhere isn't hers", () => expect(faceFor('Laughter from the bar.', nix, 'she')).toBeNull());

    it('a face word or body part as the subject still counts', () => {
      expect(faceFor('The grin goes crooked.', nix, 'she')).toBe('happy');
      expect(faceFor('A laugh gets out of me.', nix, 'she')).toBe('happy');
      expect(faceFor('The jaw sets.', hicks, 'he')).toBe('angry');
      expect(faceFor('The shoulders sag.', nix, 'she')).toBe('tired');
    });
  });
});
