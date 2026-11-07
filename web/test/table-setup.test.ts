import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountSetup } from '../src/room/table/setup';
import type { SetupOffer } from '../../shared/types';
import { tipText } from '../src/room/table/tips';

const OFFER: SetupOffer = {
  district: 'karasu',
  tier: 'KNOWN',
  heat: 2,
  favour: null,
  crew: [
    { id: 'dez', name: 'Dez Vance', spec: 'runner', grade: 1, face: null, traits: [{ label: 'Talks Too Much', good: false }], abilities: ['Shortcut', 'Lookout'] },
    { id: 'moss', name: 'Moss Ade', spec: 'face', grade: 0, face: null, traits: [], abilities: [] },
    { id: 'koji', name: 'Koji Ren', spec: 'muscle', grade: 2, face: null, traits: [], abilities: [] },
    { id: 'ash', name: 'Ash Bell', spec: 'runner', grade: 3, face: null, traits: [], abilities: [] },
  ],
  contacts: [],
};
const $ = (sel: string) => document.querySelector<HTMLElement>(sel)!;
const $$ = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)];
const open = (offer: SetupOffer = OFFER) => {
  const g = document.createElement('div');
  g.id = 'game';
  document.body.append(g);
  const onGo = vi.fn();
  const onBack = vi.fn();
  const s = mountSetup(g, { offer, title: 'Marked Cards', pitch: 'Put a marked deck on a rival table.', tier: 1, onGo, onBack, reduced: true });
  return { s, onGo, onBack };
};
afterEach(() => document.body.replaceChildren());

describe('the setup card', () => {
  it('shows the pitch with the district, your tier and its heat', () => {
    open();
    expect($('.ts-pitch').textContent).toContain('MARKED CARDS');
    expect($('.ts-pitch').textContent).toContain('KARASU · KNOWN · HEAT 2');
  });

  it('an approach card selects one; GO IN sends what was chosen', () => {
    const { onGo } = open();
    expect($$('.ts-approach .tb-card').map((c) => c.dataset.id)).toEqual(['quiet', 'smooth', 'hard']);
    expect($$('.ts-approach .tb-card img').map((i) => i.getAttribute('src'))).toEqual(['/cards/quiet.webp', '/cards/smooth.webp', '/cards/hard.webp']);
    expect($('.ts-ready .tb-slot[data-id="dez"]').textContent).toContain('− TALKS TOO MUCH');
    $('.ts-approach .tb-card[data-id="hard"]').click();
    expect($('.ts-approach .tb-card[data-id="hard"]').classList.contains('chosen')).toBe(true);
    $('.ts-ready .tb-slot[data-id="dez"]').click();
    $('.ts-go').click();
    expect(onGo).toHaveBeenCalledWith({ approach: 'hard', people: ['dez'], favour: true });
  });

  it("a recruit's slotted abilities show under their name (crew abilities spec §4)", () => {
    open();
    expect($$('.ts-ready .tb-slot[data-id="dez"] .tbc-ab').map((x) => x.textContent)).toEqual(['◆ SHORTCUT', '◆ LOOKOUT']);
    expect($$('.ts-ready .tb-slot[data-id="moss"] .tbc-ab')).toEqual([]);
  });

  it('HARD says TAKE 1 from tier 2 up, not on tier 1 (balancing 2026-11-01)', () => {
    open();
    expect($('.ts-approach .tb-card[data-id="hard"]').textContent).not.toContain('TAKE 1');
    document.body.replaceChildren();
    const g = document.createElement('div');
    g.id = 'game';
    document.body.append(g);
    mountSetup(g, { offer: OFFER, title: 'X', pitch: null, tier: 2, onGo: vi.fn(), onBack: vi.fn(), reduced: true });
    expect($('.ts-approach .tb-card[data-id="hard"]').textContent).toContain('TAKE 1');
  });

  it('tapping crew fills PEOPLE up to 3; a 4th is ignored; tapping in PEOPLE takes them out', () => {
    const { onGo } = open();
    for (const id of ['dez', 'moss', 'koji', 'ash']) $(`.ts-ready .tb-slot[data-id="${id}"]`).click();
    expect($$('.g-people .tb-slot').map((s) => s.dataset.id)).toEqual(['dez', 'moss', 'koji']);
    $('.g-people .tb-slot[data-id="moss"]').click();
    expect($$('.g-people .tb-slot').filter((s) => s.dataset.state !== 'empty').map((s) => s.dataset.id)).toEqual(['dez', 'koji']);
    $('.ts-go').click();
    expect(onGo).toHaveBeenCalledWith({ approach: 'quiet', people: ['dez', 'koji'], favour: true });
  });

  it('ready crew stay on one strip; past three, ‹ › and the count show, gone once three are left', () => {
    open();
    expect($$('.ts-ready-strip > .tb-slot').map((s) => s.dataset.id)).toEqual(['dez', 'moss', 'koji', 'ash']);
    expect($$('.ts-ready-head .ts-cycle').map((b) => b.textContent)).toEqual(['‹', '›']);
    expect($('.ts-count').textContent).toBe('4');
    $('.ts-ready .tb-slot[data-id="dez"]').click();
    expect($$('.ts-ready-head .ts-cycle')).toEqual([]);
  });

  it('contact cards: tap one in from CONTACTS to a pocket, two at most, tap it back out; GO IN sends them', () => {
    const c = (id: string, name: string, spec: 'fence' | 'runner' | 'face') => ({ id, name, accent: '#fff', portrait: null, spec });
    const { onGo } = open({ ...OFFER, contacts: [c('cass', 'Cass Okafor', 'fence'), c('hicks', 'Hicks', 'runner'), c('mother-rot', 'Mother Rot', 'face')] });
    expect($$('.ts-contacts .tb-slot').map((s) => s.dataset.id)).toEqual(['contact:cass', 'contact:hicks', 'contact:mother-rot']);
    expect($('.ts-contacts .tb-slot[data-id="contact:cass"]').textContent).toContain('CASS · FENCE');
    for (const id of ['hicks', 'cass', 'mother-rot']) $(`.ts-contacts .tb-slot[data-id="contact:${id}"]`).click();
    expect($$('.g-pockets .tb-slot').map((s) => s.dataset.id)).toEqual(['favour', 'contact:hicks', 'contact:cass']);
    $('.g-pockets .tb-slot[data-id="contact:hicks"]').click();
    expect($$('.g-pockets .tb-slot').map((s) => s.dataset.id)).toEqual(['favour', 'contact:cass', 'c2']);
    $('.ts-go').click();
    expect(onGo).toHaveBeenCalledWith({ approach: 'quiet', people: [], favour: true, contacts: ['cass'] });
  });

  it('the contact tip is offered at SETUP only when a contact card shows', () => {
    const offered = (offer: SetupOffer) => {
      const g = document.createElement('div');
      document.body.append(g);
      const tips = { offer: vi.fn(), clear: vi.fn() };
      mountSetup(g, { offer, title: 'X', pitch: null, tier: 1, onGo: vi.fn(), onBack: vi.fn(), reduced: true, tips: tips as never });
      return tips.offer.mock.calls[0][0] as string[];
    };
    expect(offered(OFFER)).not.toContain('contact');
    expect(offered({ ...OFFER, contacts: [{ id: 'cass', name: 'Cass Okafor', accent: '#fff', portrait: null, spec: 'fence' }] })).toEqual(['approach', 'people', 'favour', 'contact']);
    expect(tipText('contact')).toBe('A contact who gave you a lead will help on a job, once, in their trade. BLOWN Blow the job after you play them and they trust you less.');
  });

  it('no contacts: two empty pockets, no CONTACTS row, nothing locked as SPEC 3', () => {
    const { onGo } = open();
    expect($$('.g-pockets .tb-slot').map((s) => [s.dataset.id, s.dataset.state])).toEqual([['favour', 'up'], ['c1', 'empty'], ['c2', 'empty']]);
    expect(document.querySelector('.ts-contacts')).toBeNull();
    expect(document.body.textContent).not.toContain('SPEC 3');
    $('.ts-go').click();
    expect(onGo).toHaveBeenCalledWith({ approach: 'quiet', people: [], favour: true });
  });

  it('the favour slot says why when not allowed, and is not sent', () => {
    const { onGo } = open({ ...OFFER, favour: 'NO FAVOURS · KARASU HEAT 7' });
    expect($('.g-pockets .tb-slot[data-id="favour"]').textContent).toContain('NO FAVOURS · KARASU HEAT 7');
    expect($('.g-pockets .tb-slot[data-id="favour"] img').getAttribute('src')).toBe('/cards/empty.webp');
    $('.ts-go').click();
    expect(onGo).toHaveBeenCalledWith({ approach: 'quiet', people: [], favour: false });
  });

  it('BACK sends nothing; a refusal shows on the card, which stays open', () => {
    const { s, onGo, onBack } = open();
    s.refuse("DEZ ISN'T READY");
    expect($('.ts-refusal').textContent).toBe("DEZ ISN'T READY");
    expect(s.isOpen()).toBe(true);
    $('.ts-back').click();
    expect(onBack).toHaveBeenCalled();
    expect(onGo).not.toHaveBeenCalled();
    expect(s.isOpen()).toBe(false);
  });
});

describe('Graft tips at SETUP', () => {
  const fakeTips = () => ({ offer: vi.fn(), clear: vi.fn(), enabled: () => true, setEnabled: vi.fn(), reset: vi.fn() });
  const openWith = (offer: SetupOffer) => {
    const g = document.createElement('div');
    g.id = 'game';
    document.body.append(g);
    const tips = fakeTips();
    const s = mountSetup(g, { offer, title: 'Marked Cards', pitch: null, tier: 1, onGo: vi.fn(), onBack: vi.fn(), reduced: true, tips });
    return { s, tips };
  };

  it('setup offers approach, people and favour', () => {
    const { tips } = openWith(OFFER);
    expect(tips.offer).toHaveBeenCalledTimes(1);
    expect(tips.offer.mock.calls[0][0]).toEqual(['approach', 'people', 'favour']);
    expect((tips.offer.mock.calls[0][1] as HTMLElement).classList.contains('tb-setup')).toBe(true);
  });

  it('with no ready crew and no favour allowed, approach and favour (the slot says why)', () => {
    const { tips } = openWith({ ...OFFER, crew: [], favour: 'NO FAVOURS · NOBODY HERE' });
    expect(tips.offer.mock.calls[0][0]).toEqual(['approach', 'favour']);
  });

  it('closing the card any way clears (travel, another job starting, the job leaving the board)', () => {
    const { s, tips } = openWith(OFFER);
    s.close();
    expect(tips.clear).toHaveBeenCalledTimes(1);
  });

  it('GO IN and BACK clear', () => {
    const { tips } = openWith(OFFER);
    $('.ts-go').click();
    expect(tips.clear).toHaveBeenCalledTimes(1);
    $('.ts-back').click();
    expect(tips.clear).toHaveBeenCalledTimes(2);
  });
});

describe('SETUP with the deck (programs spec §2.4)', () => {
  it('SETUP shows the deck and its slots; no favour, no contacts', () => {
    const { onGo } = open({ ...OFFER, favour: 'ON HOLD', deck: { name: 'Chrome deck', quality: 4, slots: 3 } });
    expect(document.querySelector('.ts-deck')).toBeNull();
    expect($('.ts-hand .g-deck .tb-group-label').textContent).toBe('DECK · CHROME DECK · Q4');
    expect($$('.ts-hand .g-deck .tb-slot').map((s) => s.dataset.id)).toEqual(['slot:1', 'slot:2', 'slot:3']);
    expect(document.querySelector('.ts-hand .tb-slot[data-id="favour"]')).toBeNull();
    expect(document.querySelector('.ts-contacts')).toBeNull();
    $('.ts-go').click();
    expect(onGo).toHaveBeenCalledWith({ approach: 'quiet', people: [], favour: false });
  });

  const PROGRAMS = [
    { id: 'solvent', name: 'SOLVENT', stat: 'tech', kind: 'position' as const, line: 'Strips the lacquer back a layer.' },
    { id: 'voicebox', name: 'VOICEBOX', stat: 'cool', kind: 'effect' as const, line: 'Your voice, their clearance.' },
    { id: 'firewall', name: 'FIREWALL', stat: 'any', kind: 'firewall' as const, line: 'Takes one hit.' },
  ];
  const DECKED: SetupOffer = { ...OFFER, favour: 'ON HOLD', deck: { name: 'Cortex Meridian', quality: 3, slots: 2 }, programs: PROGRAMS, leans: ['tech', 'cool'] };
  const ids = () => $$('.ts-hand .g-deck .tb-slot').map((s) => s.dataset.id);
  const slot = (id: string) => $(`.g-deck .tb-slot[data-id="${id}"]`);
  const picks = () => $$('.ts-tray:not([hidden]) .tb-slot').map((s) => s.dataset.id);

  it('SETUP shows the tier line, with or without a deck (tier effect spec §2)', () => {
    const tierLine = 'TIER 2 · rolls run SMALL unless HAND crew or a Q2+ deck covers them';
    open({ ...DECKED, tierLine });
    expect($('.ts-tierline').textContent).toBe(tierLine);
    document.body.replaceChildren();
    open({ ...OFFER, tierLine });
    expect($('.ts-tierline').textContent).toBe(tierLine);
  });

  it('the tier tip is offered with a tier line', () => {
    const g = document.createElement('div');
    document.body.append(g);
    const tips = { offer: vi.fn(), clear: vi.fn() };
    mountSetup(g, { offer: { ...OFFER, tierLine: 'TIER 2' }, title: 'X', pitch: null, tier: 2, onGo: vi.fn(), onBack: vi.fn(), reduced: true, tips: tips as never });
    expect(tips.offer.mock.calls[0][0]).toContain('tier');
  });

  it('a crew card and a program say what they do, against the job’s tier', () => {
    const g = document.createElement('div');
    g.id = 'game';
    document.body.append(g);
    mountSetup(g, { offer: DECKED, title: 'X', pitch: null, tier: 2, onGo: vi.fn(), onBack: vi.fn(), reduced: true });
    vi.useFakeTimers();
    const rest = (el: HTMLElement) => {
      el.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
      vi.advanceTimersByTime(700);
      return $('.tb-info').textContent;
    };
    expect(rest($('.ts-ready .tb-slot[data-id="ash"]'))).toContain('Lifts the tier cut');
    slot('slot:1').click();
    expect(rest(slot('prog-pick:voicebox'))).toContain('Your voice, their clearance.');
    expect($('.tb-info').textContent).toContain('Lifts the tier cut');
    vi.useRealTimers();
  });

  it('a crew card shows the runs to their next grade, none at VET', () => {
    open({ ...OFFER, crew: [{ ...OFFER.crew[0], grade: 1, toNext: 2.5 }, { ...OFFER.crew[1], grade: 3, toNext: 0 }] });
    const [a, b] = $$('.ts-ready .tb-slot');
    expect(a.textContent).toContain('3 TO PRO');
    expect(b.textContent).not.toContain(' TO ');
  });

  it('no tier line on tier 1', () => {
    open(DECKED);
    expect(document.querySelector('.ts-tierline')).toBeNull();
  });

  it('the deck group names what the job leans on (programs spec §1.2a)', () => {
    open(DECKED);
    expect($('.ts-hand .g-deck .ts-lean').textContent).toBe('JOB LEANS TECH · COOL');
  });

  it('a slot opens the catalog in the tray, the hand as it was; a pick loads it; a tap takes it out', () => {
    open(DECKED);
    expect(slot('slot:1').textContent).toContain('LOAD');
    slot('slot:1').click();
    // The hand's row keeps its cards: the catalog is over the approaches, the slot it's for lit.
    expect(ids()).toEqual(['slot:1', 'slot:2']);
    expect(slot('slot:1').classList.contains('on')).toBe(true);
    expect($('.ts-stage').classList.contains('picking')).toBe(true);
    expect(picks()).toEqual(['prog-pick:solvent', 'prog-pick:voicebox', 'prog-pick:firewall']);
    slot('prog-pick:firewall').click();
    expect(ids()).toEqual(['prog:firewall', 'slot:2']);
    expect(picks()).toEqual([]);
    expect($('.ts-stage').classList.contains('picking')).toBe(false);
    slot('slot:2').click();
    expect(picks()).toEqual(['prog-pick:solvent', 'prog-pick:voicebox']);
    slot('prog-pick:solvent').click();
    expect(ids()).toEqual(['prog:firewall', 'prog:solvent']);
    slot('prog:firewall').click();
    expect(ids()).toEqual(['prog:solvent', 'slot:2']);
  });

  it('the program tip is offered at SETUP when the deck has slots', () => {
    const offered = (offer: SetupOffer) => {
      const g = document.createElement('div');
      document.body.append(g);
      const tips = { offer: vi.fn(), clear: vi.fn() };
      mountSetup(g, { offer, title: 'X', pitch: null, tier: 1, onGo: vi.fn(), onBack: vi.fn(), reduced: true, tips: tips as never });
      return tips.offer.mock.calls[0][0] as string[];
    };
    expect(offered(DECKED)).toEqual(['approach', 'people', 'program']);
    expect(offered({ ...DECKED, deck: null, programs: undefined })).toEqual(['approach', 'people']);
    expect(tipText('program')).toBe('Load programs here, free: they stay loaded for the job. SLOTS 1, 2, 2 or 3, by your deck\'s quality. MID-JOB Loading one costs 1 NERVE. BELOW TIER Below the job\'s tier the lacquer notices each run: ALARM +1.');
  });

  it('a tap outside the cards closes the tray', () => {
    open(DECKED);
    slot('slot:1').click();
    expect(picks()).toHaveLength(3);
    $('.ts-pitch').click();
    expect(picks()).toEqual([]);
    expect(ids()).toEqual(['slot:1', 'slot:2']);
  });

  it('Esc and Enter close an open tray before they leave SETUP or go in', () => {
    const { s, onGo, onBack } = open(DECKED);
    slot('slot:1').click();
    s.back();
    expect(picks()).toEqual([]);
    expect(onBack).not.toHaveBeenCalled();
    slot('slot:1').click();
    s.go();
    expect(picks()).toEqual([]);
    expect(onGo).not.toHaveBeenCalled();
    s.go();
    expect(onGo).toHaveBeenCalled();
  });

  it('a deck changed on YOU shows at once: label, slots and lean; the picks stay', () => {
    const POCKET: SetupOffer = { ...DECKED, deck: { name: 'Pocket deck', quality: 1, slots: 1 } };
    const { s, onGo } = open(POCKET);
    $$('.ts-ready .tb-slot')[0].click();
    slot('slot:1').click();
    slot('prog-pick:solvent').click();
    s.update({ ...DECKED, leans: ['cool'] });
    expect($('.ts-hand .g-deck .tb-group-label').textContent).toBe('DECK · CORTEX MERIDIAN · Q3');
    expect($('.ts-hand .g-deck .ts-lean').textContent).toBe('JOB LEANS COOL');
    expect(ids()).toEqual(['prog:solvent', 'slot:2']);
    $('.ts-go').click();
    expect(onGo).toHaveBeenCalledWith(expect.objectContaining({ people: ['dez'], programs: ['solvent'] }));
  });

  it('a smaller deck keeps the first loads that fit; no deck drops them all', () => {
    const { s, onGo } = open(DECKED);
    slot('slot:1').click();
    slot('prog-pick:solvent').click();
    slot('slot:2').click();
    slot('prog-pick:firewall').click();
    s.update({ ...DECKED, deck: { name: 'Pocket deck', quality: 1, slots: 1 } });
    expect(ids()).toEqual(['prog:solvent']);
    s.update({ ...DECKED, deck: null, programs: undefined });
    expect(ids()).toEqual([]);
    $('.ts-go').click();
    expect(onGo).toHaveBeenCalledWith({ approach: 'quiet', people: [], favour: false });
  });

  it('GO IN sends the loaded programs', () => {
    const { onGo } = open(DECKED);
    slot('slot:1').click();
    slot('prog-pick:voicebox').click();
    $('.ts-go').click();
    expect(onGo).toHaveBeenCalledWith({ approach: 'quiet', people: [], favour: false, programs: ['voicebox'] });
  });

  it('no deck reads DECK · NONE', () => {
    open({ ...OFFER, favour: 'ON HOLD', deck: null });
    expect($('.ts-hand .g-deck .tb-group-label').textContent).toBe('DECK · NONE');
    expect($$('.ts-hand .g-deck .tb-slot')).toEqual([]);
  });
});
