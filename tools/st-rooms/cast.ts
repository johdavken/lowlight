// The cast as SillyTavern cards and personas (tools/st-rooms/export-cast.ts): the pure parts.
/** SillyTavern's expression labels (its classifier's), each mapped to the nearest of a character's own faces. */
const LABEL_FACES: Record<string, string[]> = {
  joy: ['happy', 'smile'],
  amusement: ['amused', 'smile', 'happy'],
  gratitude: ['smile', 'happy'],
  optimism: ['smile', 'happy'],
  relief: ['smile', 'happy'],
  love: ['smile', 'happy'],
  pride: ['smile', 'happy'],
  excitement: ['happy', 'smile'],
  approval: ['smile', 'happy'],
  admiration: ['smile', 'happy'],
  annoyance: ['annoyed'],
  anger: ['angry', 'annoyed'],
  disapproval: ['annoyed', 'angry'],
  disgust: ['angry', 'annoyed'],
  embarrassment: ['annoyed', 'concerned'],
  caring: ['concerned'],
  nervousness: ['concerned'],
  fear: ['concerned'],
  confusion: ['concerned'],
  curiosity: ['concerned', 'smile'],
  surprise: ['concerned'],
  realization: ['concerned'],
  desire: ['smile', 'concerned'],
  sadness: ['tired', 'concerned'],
  grief: ['tired', 'concerned'],
  remorse: ['tired', 'concerned'],
  disappointment: ['tired', 'annoyed', 'concerned'],
};

/** Each SillyTavern label → one of `faces` (a character's expression names); labels with no near face are left out. */
export function labelFaces(faces: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [label, wants] of Object.entries(LABEL_FACES)) {
    const face = wants.find((w) => faces.includes(w));
    if (face) out[label] = face;
  }
  return out;
}

export interface CardInput {
  name: string;
  /** identity.md for a contact, voice.md for a resident. */
  description: string;
  /** Always '' from the export: the chat opens empty and the extension has her greet live (index.js greetIfNew). */
  firstMes: string;
  /** Lowlight's roleplay guide, as the card's system prompt. */
  systemPrompt: string;
  /** The World Info book the card carries. */
  world: string;
}

/** A Character Card V2, as SillyTavern reads it from a PNG's `chara` chunk. */
export function cardData(c: CardInput) {
  return {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: c.name,
      description: c.description,
      personality: '',
      scenario: '',
      first_mes: c.firstMes,
      mes_example: '',
      creator_notes: 'Exported from Lowlight for comparison.',
      system_prompt: c.systemPrompt,
      post_history_instructions: '',
      alternate_greetings: [],
      tags: ['lowlight'],
      creator: 'Lowlight',
      character_version: '1',
      extensions: { world: c.world, talkativeness: '0.5', fav: false },
    },
  };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** `png` with a `tEXt` chunk `chara` (the card's JSON, base64) right after IHDR; any old chara/ccv3 chunk dropped. */
export function pngWithCard(png: Buffer, card: unknown): Buffer {
  if (!png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) throw new Error('not a PNG');
  const text = Buffer.concat([Buffer.from('chara\0', 'latin1'), Buffer.from(Buffer.from(JSON.stringify(card), 'utf8').toString('base64'), 'latin1')]);
  const type = Buffer.from('tEXt', 'latin1');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(text.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([type, text])));
  const chunk = Buffer.concat([len, type, text, crc]);
  const parts: Buffer[] = [png.subarray(0, 8)];
  for (let i = 8; i < png.length; ) {
    const n = png.readUInt32BE(i);
    const t = png.toString('latin1', i + 4, i + 8);
    const whole = png.subarray(i, i + 12 + n);
    const key = t === 'tEXt' ? png.toString('latin1', i + 8, i + 8 + Math.min(n, 6)) : '';
    if (!(key.startsWith('chara\0') || key.startsWith('ccv3\0'))) parts.push(whole);
    if (t === 'IHDR') parts.push(chunk);
    i += 12 + n;
  }
  return Buffer.concat(parts);
}

/** The card a PNG carries (its `chara` chunk), or null. */
export function cardOf(png: Buffer): unknown {
  for (let i = 8; i < png.length; ) {
    const n = png.readUInt32BE(i);
    if (png.toString('latin1', i + 4, i + 8) === 'tEXt') {
      const body = png.subarray(i + 8, i + 8 + n).toString('latin1');
      if (body.startsWith('chara\0')) return JSON.parse(Buffer.from(body.slice(6), 'base64').toString('utf8'));
    }
    i += 12 + n;
  }
  return null;
}

/** One character in the package's cast/cast.json (paths relative to cast/; hashes are sha256 hex). */
export interface CastCharacter {
  id: string;
  name: string;
  /** she / he / they, as the game's (default they). */
  pronoun: string;
  /** The package version they arrived in. */
  since: string;
  card: string;
  /** SillyTavern expression label → sprite file. */
  sprites: Record<string, string>;
  persona: { file: string; name: string; description: string; picture: string } | null;
  tagline: string;
  facts: { label: string; value: string }[];
  accent: string | null;
  /** Their first room (folder), for the select and a chat with no saved room. */
  home: string | null;
  /** Every room of theirs (folders): where go_to can take you. */
  places: string[];
  /** One of the game's fixed residents (Hae at her stall): not a contact you call, so not on the select's contact grid. */
  resident?: boolean;
  /** card: the card's text (its JSON, without the greeting) and its picture's pixels; sprites, persona: the files. */
  hash: { card: string; sprites: string; persona: string | null };
}

/** The package's cast/cast.json (and a local extension's cast.json). */
export interface CastJson {
  version: string;
  characters: CastCharacter[];
}
