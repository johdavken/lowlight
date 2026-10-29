/**
 * Leads (spec 2026-10-12 leads): something one character tells you that another will react to.
 * Each is a file, `world/leads/<id>.md`: who gives it, who it points to, the keys that bring it up,
 * and three sections (her mood while it's live, the giver's side, the receiver's side). Pure: the
 * game server, Studio and their tests share these rules.
 */
import { z } from 'zod';
import { LORE_ID, LORE_ID_MAX, LORE_KEY_MAX, LORE_KEY_MIN, LORE_KEYS_MAX, LORE_TITLE_MAX, mentionsKeys, oneLine, splitFrontMatter, yamlScalar, zodProblems, type LoreProblem } from './lore';

export const LEAD_SIDE_MAX = 1200;
export const LEAD_MIND_MAX = 200;
export const LEAD_DETAILS_MAX = 300;
export const LEAD_FILL_MAX = 120;

export interface LeadEntry {
  id: string;
  title: string;
  /** The giver's roster id. */
  from: string;
  /** The receiver's roster id. */
  to: string;
  keys: string[];
  /** A lead that must be held before this one is live (chains); null: none. */
  after: string | null;
  /** What the giver makes up when she hands it over. */
  fill: string;
  /** Shown on LEADS beside the receiver; null: none. */
  place: string | null;
  onMind: string;
  giverKnows: string;
  receiverKnows: string;
}
export type LeadProblem = LoreProblem;

/** Studio's GET /api/leads: every lead file (null, with its problems, when the game would skip it) and who can give or receive one. */
export interface LeadListing {
  entries: { id: string; entry: LeadEntry | null; problems: LeadProblem[] }[];
  /** Who can give or receive one, with their profile and rooms (COPY FOR OPUS). */
  roster: (LeadPerson & { rooms?: string[] })[];
}

const frontSchema = z.strictObject({
  title: oneLine(LORE_TITLE_MAX),
  from: oneLine(LORE_ID_MAX),
  to: oneLine(LORE_ID_MAX),
  keys: z.array(oneLine(LORE_KEY_MAX, LORE_KEY_MIN)).min(1, 'needs at least one key').max(LORE_KEYS_MAX),
  after: oneLine(LORE_ID_MAX).nullish(),
  fill: oneLine(LEAD_FILL_MAX),
  place: oneLine(LORE_TITLE_MAX).nullish(),
});

const MIND = /^on (her|his|their) mind$/i;
const SECTIONS = { giverKnows: /^giver knows$/i, receiverKnows: /^receiver knows$/i } as const;

/** The body's `## ` sections by field; text before the first heading or under any other heading is a problem. */
function sections(body: string): { found: Partial<Record<'onMind' | 'giverKnows' | 'receiverKnows', string>>; problems: LeadProblem[] } {
  const found: Partial<Record<'onMind' | 'giverKnows' | 'receiverKnows', string>> = {};
  const problems: LeadProblem[] = [];
  const parts = body.split(/^##[ \t]+/m);
  if (parts[0].trim() !== '') problems.push({ field: 'body', message: 'text before the first ## heading' });
  for (const part of parts.slice(1)) {
    const nl = part.indexOf('\n');
    const heading = (nl < 0 ? part : part.slice(0, nl)).trim();
    const text = nl < 0 ? '' : part.slice(nl + 1).trim();
    const field = MIND.test(heading) ? 'onMind' : SECTIONS.giverKnows.test(heading) ? 'giverKnows' : SECTIONS.receiverKnows.test(heading) ? 'receiverKnows' : null;
    if (!field) problems.push({ field: 'body', message: `unknown section '## ${heading}' (On their mind, Giver knows, Receiver knows)` });
    else if (found[field] !== undefined) problems.push({ field, message: 'appears twice' });
    else found[field] = text;
  }
  return { found, problems };
}

const idOk = (id: string) => LORE_ID.test(id) && id.length <= LORE_ID_MAX;

export function parseLeadFile(id: string, text: string, roster: ReadonlySet<string> | null): { ok: true; entry: LeadEntry } | { ok: false; problems: LeadProblem[] } {
  const problems: LeadProblem[] = idOk(id) ? [] : [{ field: 'id', message: `must be lowercase letters, digits and dashes, at most ${LORE_ID_MAX}` }];
  const s = splitFrontMatter(text);
  if ('field' in s) return { ok: false, problems: [...problems, s] };
  const parsed = frontSchema.safeParse(s.front);
  if (!parsed.success) problems.push(...zodProblems(parsed.error));
  const { found, problems: sectionProblems } = sections(s.body);
  problems.push(...sectionProblems);
  const need = (field: 'onMind' | 'giverKnows' | 'receiverKnows', label: string, max: number) => {
    const v = found[field];
    if (!v) problems.push({ field, message: `needs a '## ${label}' section with some text` });
    else if (v.length > max) problems.push({ field, message: `at most ${max} characters (this is ${v.length})` });
  };
  need('onMind', 'On their mind', LEAD_MIND_MAX);
  need('giverKnows', 'Giver knows', LEAD_SIDE_MAX);
  need('receiverKnows', 'Receiver knows', LEAD_SIDE_MAX);
  if (found.onMind && /[\r\n]/.test(found.onMind)) problems.push({ field: 'onMind', message: 'must be one line' });
  if (!parsed.success) return { ok: false, problems };
  const f = parsed.data;
  if (f.from === f.to) problems.push({ field: 'to', message: "can't be the giver" });
  if (roster) {
    if (!roster.has(f.from)) problems.push({ field: 'from', message: `no character '${f.from}'` });
    if (!roster.has(f.to)) problems.push({ field: 'to', message: `no character '${f.to}'` });
  }
  for (const k of ['from', 'to'] as const) if (!idOk(f[k])) problems.push({ field: k, message: `'${f[k]}' isn't an id: lowercase letters, digits and dashes` });
  if (f.after != null && !idOk(f.after)) problems.push({ field: 'after', message: `'${f.after}' isn't a lead id` });
  if (problems.length > 0) return { ok: false, problems };
  const seen = new Set<string>();
  const keys = f.keys.filter((k) => !seen.has(k.toLowerCase()) && Boolean(seen.add(k.toLowerCase())));
  return {
    ok: true,
    entry: {
      id,
      title: f.title,
      from: f.from,
      to: f.to,
      keys,
      after: f.after ?? null,
      fill: f.fill,
      place: f.place ?? null,
      onMind: found.onMind!,
      giverKnows: found.giverKnows!,
      receiverKnows: found.receiverKnows!,
    },
  };
}

/** The leads whose `after` can never be held: it names no lead, it loops, or its chain runs into one that does. */
export function checkChains(entries: LeadEntry[]): Map<string, LeadProblem[]> {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const bad = new Map<string, LeadProblem[]>();
  for (const e of entries) {
    const seen = new Set<string>([e.id]);
    let at = e;
    while (at.after !== null) {
      const next = byId.get(at.after);
      const message = !next ? (at === e ? `no lead '${at.after}'` : `its chain needs '${at.after}', which doesn't exist`) : seen.has(next.id) ? (next.id === e.id ? `'${e.id}' comes after itself` : 'its chain loops') : null;
      if (message) {
        bad.set(e.id, [{ field: 'after', message }]);
        break;
      }
      seen.add(next!.id);
      at = next!;
    }
  }
  return bad;
}

const list = (xs: string[]) => `[${xs.map((x) => yamlScalar(x, true)).join(', ')}]`;

export function leadFile(e: LeadEntry): string {
  const lines = [`title: ${yamlScalar(e.title)}`, `from: ${yamlScalar(e.from)}`, `to: ${yamlScalar(e.to)}`, `keys: ${list(e.keys)}`];
  if (e.after !== null) lines.push(`after: ${yamlScalar(e.after)}`);
  lines.push(`fill: ${yamlScalar(e.fill)}`);
  if (e.place !== null) lines.push(`place: ${yamlScalar(e.place)}`);
  return `---\n${lines.join('\n')}\n---\n\n## On their mind\n${e.onMind}\n\n## Giver knows\n${e.giverKnows}\n\n## Receiver knows\n${e.receiverKnows}\n`;
}

/** What a contact's turn carries (Leads spec §3, §4): her live leads, the ones the talk has reached, and the leads you hold that point to her. */
export interface LeadsForTurn {
  onMind: LeadEntry[];
  offer: LeadEntry[];
  receive: { entry: LeadEntry; details: string }[];
}

/**
 * This turn's leads for `contactId`. Live: she gives it, you don't hold it, and its `after` (if
 * any) is held. Every live lead is on her mind; one is offered once its keys appear in `recent`
 * (lore's window, this turn's text first). Every held lead that points to her is hers to receive.
 */
export function leadsFor(book: LeadEntry[], contactId: string, held: ReadonlyMap<string, string>, recent: string[]): LeadsForTurn {
  const live = book.filter((e) => e.from === contactId && !held.has(e.id) && (e.after === null || held.has(e.after)));
  const text = recent.join('\n');
  return {
    onMind: live,
    offer: live.filter((e) => mentionsKeys(text, e.keys)),
    receive: book.filter((e) => e.to === contactId && held.has(e.id)).map((entry) => ({ entry, details: held.get(entry.id)! })),
  };
}

/** Ends with a full stop unless it already ends a sentence. */
const stop = (s: string) => (/[.!?…]["'”’)]?$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
/** Written text's later lines that start with `[` get a space, so a lead never passes as a control line. */
const defuse = (s: string) => s.split('\n').map((l, i) => (i > 0 && l.startsWith('[') ? ` ${l}` : l)).join('\n');

/** The leads' lines for her system message; null when there are none. */
export function leadsBlock(t: LeadsForTurn): string | null {
  const said = (s: string) => defuse(stop(s));
  const lines = [
    ...t.onMind.map((e) => `[on your mind: ${said(e.onMind)} Let it colour you; don't raise it.]`),
    ...t.offer.map((e) => `[a lead you could give — ${e.title}: ${said(e.giverKnows)} If you tell them, call give_lead with id "${e.id}" and details: ${e.fill.trim().replace(/[.!?]+$/, '')}.]`),
    ...t.receive.map(
      ({ entry: e, details }) => `[if they raise it — ${e.title}: what you know is: ${said(e.receiverKnows)} What they may have heard: ${said(details)} Don't bring it up first, and don't let it colour other topics; react if they do.]`,
    ),
  ];
  return lines.length > 0 ? lines.join('\n') : null;
}

/** The dev log's line for a turn's leads. */
export function leadsLogLine(t: LeadsForTurn): string {
  const ids = (es: LeadEntry[]) => es.map((e) => e.id).join(', ');
  return `leads: mind [${ids(t.onMind)}] offer [${ids(t.offer)}] receive [${ids(t.receive.map((r) => r.entry))}]`;
}

/** How many leads a character gives and receives (Studio's character list). */
export function leadCounts(book: readonly LeadEntry[], id: string): { gives: number; receives: number } {
  return { gives: book.filter((e) => e.from === id).length, receives: book.filter((e) => e.to === id).length };
}

/** Design rule 3 (Leads spec §1), as COPY FOR OPUS states it. */
export const LEAD_DRAFT_RULE = "Anything the giver may invent (fill) must be left open in Receiver knows — never fix a name, number or date there that the giver could choose.";

/** The prompt COPY FOR OPUS puts on the clipboard: the format, the rules, who can give and receive, and the leads already written. */
/** A character as COPY FOR OPUS describes them: who-here's profile (tagline, bio, facts). */
export interface LeadPerson {
  id: string;
  name: string;
  tagline?: string;
  bio?: string;
  facts?: readonly { label: string; value: string }[];
}

export function leadDraftPrompt(o: {
  book: readonly LeadEntry[];
  roster: readonly { id: string; name: string }[];
  from?: string;
  to?: string;
  /** The giver's and receiver's profiles (Opus writes their sides to fit them). */
  people?: readonly LeadPerson[];
  /** Lore ticked in the panel: true facts the lead must fit. */
  lore?: readonly { title: string; body: string }[];
  /** The map's places, for `place`. */
  places?: readonly { name: string; district: string }[];
}): string {
  const example: LeadEntry = {
    id: 'example',
    title: '<Title>',
    from: o.from ?? '<giver id>',
    to: o.to ?? '<receiver id>',
    keys: ['<word people would say>', '<another>'],
    after: null,
    fill: '<what the giver makes up when she tells it>',
    place: '<where the receiver is, optional>',
    onMind: '<one line of mood the giver carries while the lead is live>',
    giverKnows: "<the giver's side, and what it takes for her to tell it>",
    receiverKnows: "<the receiver's side, and how he reacts when it's raised>",
  };
  const parts = [
    'Write leads for Lowlight, a neo-noir cyberpunk city, in exactly this format. A lead is something one character tells the player that another character will react to. One lead per --- block. Put all the leads inside one ``` code block, with nothing outside it.',
    [
      `Format: title at most ${LORE_TITLE_MAX} characters; from and to are character ids from the list below (never the same); up to ${LORE_KEYS_MAX} keys, each ${LORE_KEY_MIN}–${LORE_KEY_MAX} characters; fill at most ${LEAD_FILL_MAX}; "On their mind" one line, at most ${LEAD_MIND_MAX}; each side at most ${LEAD_SIDE_MAX.toLocaleString('en-US')} characters, plain text, no line starting with ##. Add "after: <lead id>" only for a lead that follows another. Example:`,
      leadFile(example).trim(),
    ].join('\n'),
    `Rules: the giver doesn't volunteer it — say what it takes for them to tell it. The receiver doesn't raise it first. ${LEAD_DRAFT_RULE}`,
    `Characters (id — name):\n${o.roster.map((c) => `${c.id} — ${c.name}`).join('\n')}`,
  ];
  const role = (id: string) => (id === o.from ? 'giver' : id === o.to ? 'receiver' : null);
  for (const p of o.people ?? []) {
    const r = role(p.id);
    const lines = [`${p.name} (${r ? `${r}, ` : ''}${p.id}): ${p.tagline ?? ''}`.trimEnd(), p.bio?.trim(), ...(p.facts ?? []).map((f) => `${f.label}: ${f.value}`)].filter(Boolean);
    parts.push(lines.join('\n'));
  }
  if (o.lore?.length) parts.push(`Lore (true; use it, don't contradict it):\n${o.lore.map((e) => `${e.title}: ${e.body}`).join('\n')}`);
  if (o.places?.length) parts.push(`Places (for place):\n${o.places.map((p) => `${p.name} (${p.district})`).join('\n')}`);
  if (o.book.length > 0) parts.push(`Leads already written (don't repeat them; a new one may follow one with after):\n${o.book.map((e) => `${e.id} — ${e.title}: ${e.from} → ${e.to}`).join('\n')}`);
  parts.push('Request: <your request>');
  parts.push('Answer with only one ``` code block holding the leads as --- blocks in the format above.');
  return `${parts.join('\n\n')}\n`;
}
