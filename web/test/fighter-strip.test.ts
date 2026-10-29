import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { FighterStrip, liveFacts, type StripModels } from '../src/landing/fighter-strip';
import { COPY } from '../src/landing/copy';
import type { LandingAgent } from '../src/landing/landing';

function agent(extra: Partial<LandingAgent> = {}): LandingAgent {
  return {
    id: 'aria',
    name: 'Aria',
    pronoun: 'she',
    start: null,
    description: 'desc',
    accent: '#3dff7a',
    avatarKind: 'monogram',
    rooms: [], startRoom: 'default/workspace', legacyDistrict: null, group: null,
    connected: true,
    backend: 'direct',
    modelLabel: null,
    connectionError: null,
    sprite: null,
    tagline: 'Hook line',
    bio: ['Para one.', 'Para two.'],
    facts: [{ label: 'ROLE', value: 'Scout' }],
    face: { x: 0.5, y: 0.2 },
    thumb: null,
    link: 'ok',
    room: null,
    recaps: {},
    ...extra,
  };
}

function makeHost() {
  document.body.innerHTML = '<div id="host"></div>';
  return document.getElementById('host')!;
}

describe('liveFacts', () => {
  it('stored facts, then LAST SEEN (room scene), BACKEND, MODEL for direct; a stored label wins', () => {
    const a = agent({
      facts: [{ label: 'ROLE', value: 'Scout' }],
      room: { scene: 'office', weather: 'none', weatherLevel: 0, fog: 0, state: null },
      backend: 'direct',
      modelLabel: 'GLM 5.2',
    });
    expect(liveFacts(a)).toEqual([
      { label: 'ROLE', value: 'Scout' },
      { label: COPY.liveLastSeen, value: 'office' },
      { label: COPY.liveBackend, value: COPY.backendNames.direct },
      { label: COPY.liveModel, value: 'GLM 5.2' },
    ]);
  });

  it('a stored label wins over the computed one', () => {
    const a = agent({
      facts: [{ label: COPY.liveBackend, value: 'CUSTOM' }],
      backend: 'direct',
    });
    const facts = liveFacts(a);
    expect(facts).toEqual([{ label: COPY.liveBackend, value: 'CUSTOM' }]);
  });

  it('PREVIOUSLY shows the recap for the locked player only', () => {
    const a = agent({
      facts: [{ label: 'ROLE', value: 'Scout' }],
      recaps: { case: 'We fixed the lamp.', dixie: 'Dixie saw the fire.' },
      backend: 'direct',
    });
    expect(liveFacts(a, { side: 'p2', player: 'case' })).toEqual([
      { label: 'ROLE', value: 'Scout' },
      { label: COPY.livePreviously, value: 'We fixed the lamp.' },
      { label: COPY.liveBackend, value: COPY.backendNames.direct },
    ]);
    expect(liveFacts(a, { side: 'p2', player: 'dixie' }).find((f) => f.label === COPY.livePreviously)).toEqual({
      label: COPY.livePreviously,
      value: 'Dixie saw the fire.',
    });
    expect(liveFacts(a, { side: 'p1', player: 'case' })).not.toContainEqual(expect.objectContaining({ label: COPY.livePreviously }));
    expect(liveFacts(a, { side: 'p2', player: 'nobody' })).not.toContainEqual(expect.objectContaining({ label: COPY.livePreviously }));
  });

  it('no PREVIOUSLY before a player is locked', () => {
    const a = agent({ recaps: { case: 'We fixed the lamp.' } });
    expect(liveFacts(a, { side: 'p2' })).not.toContainEqual(expect.objectContaining({ label: COPY.livePreviously }));
    expect(liveFacts(a, { side: 'p2', player: null })).not.toContainEqual(expect.objectContaining({ label: COPY.livePreviously }));
  });

  it('a stored PREVIOUSLY wins over the recap', () => {
    const stored = agent({ facts: [{ label: COPY.livePreviously, value: 'mine' }], recaps: { case: 'theirs' } });
    expect(liveFacts(stored, { side: 'p2', player: 'case' }).filter((f) => f.label === COPY.livePreviously)).toEqual([
      { label: COPY.livePreviously, value: 'mine' },
    ]);
  });

  it('LINK shows a broken link on both sides; none when the link is ok or unknown; a stored LINK wins', () => {
    const link = (o: Partial<LandingAgent>, side: 'p1' | 'p2' = 'p1') =>
      liveFacts(agent({ facts: [], ...o }), { side }).find((f) => f.label === COPY.liveLink)?.value;
    expect(link({ link: 'key-rejected' })).toBe(COPY.linkStatus['key-rejected']);
    expect(link({ link: 'key-rejected' })).toBe('KEY REJECTED');
    expect(link({ link: 'unreachable' }, 'p2')).toBe('UNREACHABLE');
    expect(link({ link: 'room-error' }, 'p2')).toBe('ROOM ERROR');
    expect(link({ link: 'ok' })).toBeUndefined();
    expect(link({ link: 'unknown' }, 'p2')).toBeUndefined();
    const facts = liveFacts(agent({ facts: [{ label: COPY.liveLink, value: 'CUSTOM' }], link: 'room-error' }), { side: 'p2' });
    expect(facts.filter((f) => f.label === COPY.liveLink)).toEqual([{ label: COPY.liveLink, value: 'CUSTOM' }]);
    // After PREVIOUSLY, before the rest of the live facts.
    const order = liveFacts(agent({ facts: [], recaps: { case: 'r' }, link: 'room-error' }), { side: 'p2', player: 'case' }).map((f) => f.label);
    expect(order.slice(0, 3)).toEqual([COPY.livePreviously, COPY.liveLink, COPY.liveBackend]);
  });

  it('no MODEL fact for a mindless character, or when modelLabel is null', () => {
    expect(liveFacts(agent({ backend: 'none', modelLabel: 'GLM 5.2', facts: [] }))).not.toContainEqual(expect.objectContaining({ label: COPY.liveModel }));
    expect(liveFacts(agent({ backend: 'direct', modelLabel: null, facts: [] }))).not.toContainEqual(expect.objectContaining({ label: COPY.liveModel }));
  });
});

describe('FighterStrip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows name, tagline, a <p> per bio paragraph and the facts list', () => {
    const host = makeHost();
    const strip = new FighterStrip(host, 'p1', { reducedMotion: false });
    strip.show(agent(), { locked: false });

    expect(strip.el.querySelector('.name')?.textContent).toBe('ARIA');
    expect(strip.el.querySelector('.tagline')?.textContent).toBe('Hook line');
    const paras = Array.from(strip.el.querySelectorAll('.fighter-file p')).map((p) => p.textContent);
    expect(paras).toEqual(['Para one.', 'Para two.']);
    const dl = strip.el.querySelector('.fighter-file dl');
    expect(dl?.querySelector('dt')?.textContent).toBe('ROLE');
    expect(dl?.querySelector('dd')?.textContent).toBe('Scout');
    expect(strip.el.querySelector('.dh')?.textContent).toBe(COPY.fileHeader('ARIA'));
    expect(strip.el.querySelector('.tag')?.textContent).toBe(COPY.tagP1);
    expect(strip.el.classList.contains('p1')).toBe(true);
  });

  it('locked stacks the happy face over the sprite; unlocking removes it', () => {
    const host = makeHost();
    const strip = new FighterStrip(host, 'p1', { reducedMotion: false });
    const a = agent({ sprite: { url: '/sprite/neutral.png', crop: { top: 0, bottom: 1 }, expressions: { happy: '/sprite/happy.png' } } });
    const base = () => strip.el.querySelector<HTMLImageElement>('.fighter-art:not(.fighter-face)')!;
    const face = () => strip.el.querySelector<HTMLImageElement>('.fighter-face');

    strip.show(a, { locked: false });
    expect(base().src).toContain('/sprite/neutral.png');
    expect(face()).toBeNull();

    strip.show(a, { locked: true });
    expect(base().src).toContain('/sprite/neutral.png');
    expect(face()!.src).toContain('/sprite/happy.png');
    expect(face()!.classList.contains('fighter-art')).toBe(true);
    expect(base().nextElementSibling).toBe(face());
    expect(face()!.classList.contains('swap')).toBe(true);
    vi.advanceTimersByTime(400);
    expect(face()!.classList.contains('swap')).toBe(false);

    strip.show(a, { locked: false });
    expect(face()).toBeNull();
    expect(base().src).toContain('/sprite/neutral.png');
  });

  it('locked shows the select face the server chose, not happy', () => {
    const strip = new FighterStrip(makeHost(), 'p1', { reducedMotion: false });
    const sprite = { url: '/sprite/neutral.png', crop: { top: 0, bottom: 1 }, expressions: { happy: '/sprite/happy.png', annoyed: '/sprite/annoyed.png' } };
    strip.show(agent({ sprite: { ...sprite, selectFace: '/sprite/annoyed.png' } }), { locked: true });
    expect(strip.el.querySelector<HTMLImageElement>('.fighter-face')!.src).toContain('/sprite/annoyed.png');
    strip.show(agent({ sprite: { ...sprite, selectFace: null } }), { locked: true });
    expect(strip.el.querySelector('.fighter-face')).toBeNull();
  });

  it('no happy expression: locked shows the sprite alone', () => {
    const strip = new FighterStrip(makeHost(), 'p1', { reducedMotion: false });
    strip.show(agent({ sprite: { url: '/sprite/neutral.png', crop: { top: 0, bottom: 1 } } }), { locked: true });
    expect(strip.el.querySelector<HTMLImageElement>('.fighter-art')!.src).toContain('/sprite/neutral.png');
    expect(strip.el.querySelector('.fighter-face')).toBeNull();
  });

  it('a sprite image that fails to load falls back to the badge, and locking adds no face over it', () => {
    const strip = new FighterStrip(makeHost(), 'p1', { reducedMotion: false });
    const a = agent({ backend: 'direct', avatarKind: 'monogram', sprite: { url: '/sprite/missing.png', crop: { top: 0, bottom: 1 }, expressions: { happy: '/sprite/happy.png' } } });
    strip.show(a, { locked: false });
    strip.el.querySelector('.fighter-art')!.dispatchEvent(new Event('error'));
    expect(strip.el.querySelector('.fighter-art')).toBeNull();
    expect(strip.el.querySelector('.fighter-badge .mono')?.textContent).toBe('A');
    strip.show(a, { locked: false }); // the next render doesn't retry it
    expect(strip.el.querySelector('.fighter-art')).toBeNull();
    strip.show(a, { locked: true });
    expect(strip.el.querySelector('.fighter-art')).toBeNull();
    expect(strip.el.querySelector('.fighter-badge')).not.toBeNull();
  });

  it('a happy face that fails to load leaves the sprite and is not retried', () => {
    const strip = new FighterStrip(makeHost(), 'p1', { reducedMotion: false });
    const a = agent({ sprite: { url: '/sprite/neutral.png', crop: { top: 0, bottom: 1 }, expressions: { happy: '/sprite/happy-missing.png' } } });
    strip.show(a, { locked: true });
    strip.el.querySelector('.fighter-face')!.dispatchEvent(new Event('error'));
    expect(strip.el.querySelector('.fighter-face')).toBeNull();
    expect(strip.el.querySelector<HTMLImageElement>('.fighter-art')!.src).toContain('/sprite/neutral.png');
    strip.show(a, { locked: false });
    strip.show(a, { locked: true });
    expect(strip.el.querySelector('.fighter-face')).toBeNull();
    expect(strip.el.querySelector<HTMLImageElement>('.fighter-art')!.src).toContain('/sprite/neutral.png');
  });

  it('the file shows PREVIOUSLY on p2 for the locked player only, not on p1 and not before locked', () => {
    const a = agent({ recaps: { case: 'We fixed the lamp.' } });
    const p1 = new FighterStrip(makeHost(), 'p1', { reducedMotion: false });
    p1.show(a, { locked: false, player: 'case' });
    expect([...p1.el.querySelectorAll('.fighter-file dt')].map((d) => d.textContent)).not.toContain(COPY.livePreviously);
    const p2 = new FighterStrip(makeHost(), 'p2', { reducedMotion: false });
    p2.show(a, { locked: false }); // no player locked yet
    expect([...p2.el.querySelectorAll('.fighter-file dt')].map((d) => d.textContent)).not.toContain(COPY.livePreviously);
    p2.show(a, { locked: false, player: 'case' });
    expect([...p2.el.querySelectorAll('.fighter-file dt')].map((d) => d.textContent)).toContain(COPY.livePreviously);
    expect(p2.el.querySelector('.fighter-file')!.textContent).toContain('We fixed the lamp.');
  });

  it('no sprite → a portrait badge; no portrait → a monogram badge', () => {
    const host = makeHost();
    const strip = new FighterStrip(host, 'p1', { reducedMotion: false });

    strip.show(agent({ backend: 'direct', sprite: null, avatarKind: 'monogram' }), { locked: false });
    expect(strip.el.querySelector('.fighter-art')).toBeNull();
    const badge = strip.el.querySelector('.fighter-badge');
    expect(badge).not.toBeNull();
    expect(badge?.querySelector('.mono')?.textContent).toBe('A');
    expect((badge as HTMLElement).dataset.kind).toBe('monogram');

    strip.show(agent({ backend: 'direct', sprite: null, avatarKind: 'mask', id: 'cass', name: 'Cass' }), { locked: false });
    const badge2 = strip.el.querySelector('.fighter-badge');
    expect(badge2?.querySelector('.avatar')).not.toBeNull();
    expect((badge2 as HTMLElement).dataset.kind).toBe('mask');
  });

  it('the file strip is name, tagline, file, then the extras last (the CSS pins .extra to the bottom)', () => {
    for (const side of ['p1', 'p2'] as const) {
      const strip = new FighterStrip(makeHost(), side, { reducedMotion: false });
      strip.show(agent(), { locked: false });
      const kids = [...strip.el.querySelector('.file-strip')!.children].map((c) => c.classList[0]);
      expect(kids).toEqual(['name', 'tagline', 'fighter-file', 'extra']);
    }
  });

  it('null → silhouette with AWAITING SELECTION', () => {
    const host = makeHost();
    const strip = new FighterStrip(host, 'p1', { reducedMotion: false });
    strip.show(agent(), { locked: false });
    strip.show(null, { locked: false });

    expect(strip.el.classList.contains('waiting')).toBe(true);
    expect(strip.el.querySelector('.fighter-art')).toBeNull();
    expect(strip.el.querySelector('.name')?.textContent).toBe('');
    expect(strip.el.querySelector('.tagline')?.textContent).toBe(COPY.awaiting);
    expect(strip.el.querySelectorAll('.fighter-file *').length).toBe(0);
    expect(strip.el.querySelector('.extra')?.textContent).toBe('');
  });

  it('p2 extras: models list (loading/ready/offline/confirmed), connectionError, NO MIND ATTACHED', () => {
    const host = makeHost();
    const strip = new FighterStrip(host, 'p2', { reducedMotion: false });

    // mindless
    strip.show(agent({ backend: 'none' }), { locked: false });
    expect(strip.el.querySelector('.extra')?.textContent).toBe(COPY.noMind);

    // direct, not connected: connectionError
    strip.show(agent({ backend: 'direct', connected: false, connectionError: 'bad key' }), { locked: false });
    expect(strip.el.querySelector('.extra')?.textContent).toBe('bad key');
    strip.show(agent({ backend: 'direct', connected: false, connectionError: null, id: 'quiet' }), { locked: false });
    expect(strip.el.querySelector('.extra')?.textContent).toBe(COPY.notConnected);

    // direct, connected, loading
    const direct = agent({ backend: 'direct', connected: true, modelLabel: 'GLM 5.2' });
    strip.show(direct, { locked: false });
    const loading: StripModels = { state: 'loading', choices: [], index: 0, confirmed: false };
    strip.setModels(loading);
    expect(strip.el.querySelector('.models .mh')?.textContent).toBe(COPY.modelHeader);
    const loadingRows = strip.el.querySelectorAll('.models .m');
    expect(loadingRows.length).toBe(1);
    expect(loadingRows[0].textContent).toBe('GLM 5.2');

    // ready, with an .on row
    const ready: StripModels = { state: 'ready', choices: [{ id: 'a', label: 'Model A' }, { id: 'b', label: 'Model B' }], index: 1, confirmed: false };
    strip.setModels(ready);
    const rows = Array.from(strip.el.querySelectorAll('.models .m'));
    expect(rows.map((r) => r.textContent)).toEqual(['Model A', 'Model B']);
    expect(rows[1].classList.contains('on')).toBe(true);
    expect(rows[0].classList.contains('on')).toBe(false);

    // offline
    const offline: StripModels = { ...ready, state: 'offline' };
    strip.setModels(offline);
    expect(strip.el.querySelector('.models .offline')?.textContent).toBe(COPY.catalogOffline);

    // confirmed: only the chosen row
    const confirmed: StripModels = { ...ready, confirmed: true };
    strip.setModels(confirmed);
    const confirmedRows = strip.el.querySelectorAll('.models .m');
    expect(confirmedRows.length).toBe(1);
    expect(confirmedRows[0].textContent).toBe('Model B');
  });

  it('p1 never shows a model list, even for a direct character', () => {
    const host = makeHost();
    const strip = new FighterStrip(host, 'p1', { reducedMotion: false });
    strip.show(agent({ backend: 'direct', connected: true }), { locked: false });
    strip.setModels({ state: 'ready', choices: [{ id: 'a', label: 'Model A' }], index: 0, confirmed: false });
    expect(strip.el.querySelector('.models')).toBeNull();
    expect(strip.el.querySelector('.extra')?.textContent).toBe('');
  });

  it('print class on a character change, not with reduced motion; shake() adds and clears shake', () => {
    const host = makeHost();
    const strip = new FighterStrip(host, 'p1', { reducedMotion: false });
    strip.show(agent({ id: 'aria', name: 'Aria' }), { locked: false });
    strip.show(agent({ id: 'bolt', name: 'Bolt' }), { locked: false });
    const file = strip.el.querySelector('.fighter-file');
    expect(file?.classList.contains('print')).toBe(true);
    vi.advanceTimersByTime(400);
    expect(file?.classList.contains('print')).toBe(false);

    const reduced = new FighterStrip(makeHost(), 'p1', { reducedMotion: true });
    reduced.show(agent({ id: 'aria' }), { locked: false });
    reduced.show(agent({ id: 'bolt' }), { locked: false });
    expect(reduced.el.querySelector('.fighter-file')?.classList.contains('print')).toBe(false);

    strip.shake();
    expect(strip.el.classList.contains('shake')).toBe(true);
    vi.advanceTimersByTime(400);
    expect(strip.el.classList.contains('shake')).toBe(false);
  });

  it('a second flash within 400 ms keeps its class for its own full duration (locked)', () => {
    const host = makeHost();
    const strip = new FighterStrip(host, 'p1', { reducedMotion: false });
    const a = agent({ id: 'aria' });
    const b = agent({ id: 'bolt' });

    strip.show(a, { locked: true }); // t=0: locked flash scheduled to clear at t=400
    vi.advanceTimersByTime(100); // t=100
    strip.show(b, { locked: true }); // new lock-in (character changed): flash re-scheduled to clear at t=500
    vi.advanceTimersByTime(300); // t=400: the first timer would have cleared it here
    expect(strip.el.classList.contains('locked')).toBe(true);
    vi.advanceTimersByTime(100); // t=500
    expect(strip.el.classList.contains('locked')).toBe(false);
  });

  it('a second shake() within 400 ms keeps shaking for its own full duration', () => {
    const host = makeHost();
    const strip = new FighterStrip(host, 'p1', { reducedMotion: false });

    strip.shake(); // t=0: scheduled to clear at t=400
    vi.advanceTimersByTime(200); // t=200
    strip.shake(); // re-scheduled to clear at t=600
    vi.advanceTimersByTime(200); // t=400: the first timer would have cleared it here
    expect(strip.el.classList.contains('shake')).toBe(true);
    vi.advanceTimersByTime(200); // t=600
    expect(strip.el.classList.contains('shake')).toBe(false);
  });

  it('bio text with markup stays text (no elements created)', () => {
    const host = makeHost();
    const strip = new FighterStrip(host, 'p1', { reducedMotion: false });
    strip.show(agent({ bio: ['<b>bold</b> & <i>stuff</i>'], tagline: '<script>alert(1)</script>' }), { locked: false });
    const p = strip.el.querySelector('.fighter-file p');
    expect(p?.textContent).toBe('<b>bold</b> & <i>stuff</i>');
    expect(p?.querySelector('b')).toBeNull();
    expect(strip.el.querySelector('.tagline')?.textContent).toBe('<script>alert(1)</script>');
    expect(strip.el.querySelector('.tagline script')).toBeNull();
  });

  it('a direct character with no sprite keeps the badge', () => {
    const host = makeHost();
    const strip = new FighterStrip(host, 'p2', { reducedMotion: false });
    strip.show(agent({ id: 'quiet', backend: 'direct', sprite: null, connected: true, link: 'ok' }), { locked: false });

    expect(strip.el.querySelector('.fighter-badge')).not.toBeNull();
  });

  it('a no-link direct contact on p2: LINK reads NO LINK and the extra invites her pick', () => {
    document.body.innerHTML = '<div id="host"></div>';
    const strip = new FighterStrip(document.getElementById('host')!, 'p2', { reducedMotion: true });
    strip.show(agent({ backend: 'direct', connected: true, link: 'no-link', modelLabel: 'GLM 5.2' }), { locked: false });
    expect(strip.el.querySelector('.extra')!.textContent).toBe('▶ PICK HER TO LINK A MIND');
    const facts = [...strip.el.querySelectorAll('.fighter-file dt')].map((d) => [d.textContent, d.nextElementSibling?.textContent]);
    expect(facts).toContainEqual([COPY.liveLink, 'NO LINK']);
  });

  it('setPanel widens the p2 strip and shows only the panel; null restores the file', () => {
    document.body.innerHTML = '<div id="host"></div>';
    const strip = new FighterStrip(document.getElementById('host')!, 'p2', { reducedMotion: true });
    strip.show(agent({ backend: 'direct', connected: true }), { locked: true });
    const panel = document.createElement('div');
    panel.className = 'some-panel';
    strip.setPanel(panel);
    const fs = strip.el.querySelector('.file-strip')!;
    expect(fs.classList.contains('wide')).toBe(true);
    expect(fs.querySelector('.some-panel')).toBe(panel);
    expect(fs.querySelector('.fighter-file')).toBeNull();
    strip.setPanel(null);
    expect(fs.classList.contains('wide')).toBe(false);
    expect(fs.querySelector('.some-panel')).toBeNull();
    expect(fs.querySelector('.fighter-file')).not.toBeNull();
  });

  it("showYou shows the persona's name, its background's first line and the YOU file; show() gives her file back", () => {
    document.body.innerHTML = '<div id="host"></div>';
    const strip = new FighterStrip(document.getElementById('host')!, 'p1', { reducedMotion: true });
    strip.show(agent(), { locked: true });
    strip.showYou({ name: 'Vee', background: 'Ex-courier.\n\nOwes Cass.' });
    expect(strip.el.querySelector('.name')!.textContent).toBe('VEE');
    expect(strip.el.querySelector('.tagline')!.textContent).toBe('Ex-courier.');
    const file = strip.el.querySelector('.fighter-file')!;
    expect(file.querySelector('.dh')!.textContent).toBe(COPY.fileHeader(COPY.you.tag));
    expect([...file.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['Ex-courier.', 'Owes Cass.']);
    expect(file.textContent).not.toContain('Para one.');
    expect(strip.el.classList.contains('is-you')).toBe(true);
    strip.showYou(null);
    strip.show(agent(), { locked: true });
    expect(strip.el.querySelector('.name')!.textContent).toBe('ARIA');
    expect(strip.el.querySelector('.fighter-file')!.textContent).toContain('Para one.');
    expect(strip.el.classList.contains('is-you')).toBe(false);
  });
});

describe('FighterStrip.setTag / setFile', () => {
  const file = {
    head: '// PLAYTHROUGHS',
    rows: [
      { p: 'A paragraph.' },
      { quote: "Don't answer that." },
      { facts: [{ label: 'WHEN', value: 'night · 2h ago' }] },
      { row: { id: 'pt-2', text: 'Imported – hicks', chip: 'ACTIVE', aside: '7h', on: true } },
      { row: { id: 'pt-3', text: 'Imported – cass', aside: '1d' } },
    ],
  };

  it("a character's bio sits in its own fading box, the facts after it; a screen's file drops that layout", () => {
    const s = new FighterStrip(makeHost(), 'p1', { reducedMotion: true });
    s.show(agent(), { locked: false });
    const f = s.el.querySelector('.fighter-file')!;
    expect(f.classList.contains('has-facts')).toBe(true);
    expect([...f.children].map((c) => c.tagName.toLowerCase() + (c.className ? `.${c.className}` : ''))).toEqual(['div.fighter-bio', 'dl']);
    expect([...f.querySelectorAll('.fighter-bio p')].map((p) => p.textContent)).toEqual(['Para one.', 'Para two.']);
    s.setFile(file);
    expect(f.classList.contains('has-facts')).toBe(false);
    s.show(agent(), { locked: false });
    expect(f.classList.contains('has-facts')).toBe(true);
    s.show(null, { locked: false });
    expect(f.classList.contains('has-facts')).toBe(false);
  });

  it('setFile renders head, paragraphs, a quote, facts and rows', () => {
    const s = new FighterStrip(makeHost(), 'p1', { reducedMotion: true });
    s.setFile(file);
    const f = s.el.querySelector('.fighter-file')!;
    expect(f.querySelector('.dh')!.textContent).toBe('// PLAYTHROUGHS');
    expect(f.querySelector('p')!.textContent).toBe('A paragraph.');
    expect(f.querySelector('q')!.textContent).toBe("Don't answer that.");
    expect(f.querySelector('dt')!.textContent).toBe('WHEN');
    expect(f.querySelector('dd')!.textContent).toBe('night · 2h ago');
    const on = f.querySelector<HTMLElement>('.pt.on')!;
    expect(on.dataset.id).toBe('pt-2');
    expect(on.querySelector('b')!.textContent).toBe('Imported – hicks');
    expect(on.querySelector('.act')!.textContent).toBe('ACTIVE');
    expect(on.querySelector('small')!.textContent).toBe('7h');
    expect(f.querySelectorAll('.pt')).toHaveLength(2);
  });

  it('setFile overrides name and tagline only when given', () => {
    const s = new FighterStrip(makeHost(), 'p2', { reducedMotion: true });
    s.show(agent(), { locked: false });
    s.setFile(file);
    expect(s.el.querySelector('.name')!.textContent).toBe('ARIA');
    expect(s.el.querySelector('.tagline')!.textContent).toBe('Hook line');
    s.setFile({ ...file, name: 'Saves', tagline: 'Newest first' });
    expect(s.el.querySelector('.name')!.textContent).toBe('SAVES');
    expect(s.el.querySelector('.tagline')!.textContent).toBe('Newest first');
  });

  it('setFile prints in when the file changes, not when it is the same', () => {
    vi.useFakeTimers();
    const s = new FighterStrip(makeHost(), 'p1', { reducedMotion: false });
    const f = s.el.querySelector('.fighter-file')!;
    s.setFile(file);
    expect(f.classList.contains('print')).toBe(true);
    vi.advanceTimersByTime(500);
    s.setFile(file);
    expect(f.classList.contains('print')).toBe(false);
    s.setFile({ ...file, head: '// OTHER' });
    expect(f.classList.contains('print')).toBe(true);
    vi.useRealTimers();
  });

  it('the same agent and the same file again does not print in (a roster poll redraw)', () => {
    vi.useFakeTimers();
    const s = new FighterStrip(makeHost(), 'p1', { reducedMotion: false });
    const f = s.el.querySelector('.fighter-file')!;
    s.show(agent(), { locked: false });
    s.setFile(file);
    vi.advanceTimersByTime(500);
    s.show(agent(), { locked: false });
    s.setFile(file);
    expect(f.classList.contains('print')).toBe(false);
    vi.advanceTimersByTime(500);
    s.show(agent({ id: 'bolt', name: 'Bolt' }), { locked: false });
    s.setFile(file);
    expect(f.classList.contains('print')).toBe(true);
    vi.useRealTimers();
  });

  it('reduced motion never prints in', () => {
    const s = new FighterStrip(makeHost(), 'p1', { reducedMotion: true });
    s.setFile(file);
    expect(s.el.querySelector('.fighter-file')!.classList.contains('print')).toBe(false);
  });

  it('long name: past 14 characters the name gets .long, and the file still renders', () => {
    const s = new FighterStrip(makeHost(), 'p1', { reducedMotion: true });
    const name = "Hae's Noodles, late-night (second pt) (branch) and then some";
    s.setFile({ ...file, name });
    expect(s.el.querySelector('.name')!.classList.contains('long')).toBe(true);
    expect(s.el.querySelectorAll('.fighter-file .pt')).toHaveLength(2);
    s.setFile({ ...file, name: 'Hicks' });
    expect(s.el.querySelector('.name')!.classList.contains('long')).toBe(false);
  });

  it('setTag replaces the tag text', () => {
    const s = new FighterStrip(makeHost(), 'p2', { reducedMotion: true });
    s.setTag('CPU · SAVE');
    expect(s.el.querySelector('.tag')!.textContent).toBe('CPU · SAVE');
  });
});

describe('FighterStrip.lock', () => {
  it('locks (flash) without redrawing the file a screen put there', () => {
    vi.useFakeTimers();
    const s = new FighterStrip(makeHost(), 'p1', { reducedMotion: false });
    s.show(agent(), { locked: false });
    s.setFile({ name: 'Rook', head: '// LAST SCENE', rows: [{ p: 'kept' }] });
    s.lock();
    expect(s.el.classList.contains('is-locked')).toBe(true);
    expect(s.el.classList.contains('locked')).toBe(true);
    expect(s.el.querySelector('.name')!.textContent).toBe('ROOK');
    expect(s.el.querySelector('.fighter-file p')!.textContent).toBe('kept');
    vi.useRealTimers();
  });
});
