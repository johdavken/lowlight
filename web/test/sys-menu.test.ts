import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { SysMenu, type SysMenuHandlers } from '../src/ui/sys-menu';

let m: SysMenu;
let h: { [K in keyof SysMenuHandlers]-?: Mock<NonNullable<SysMenuHandlers[K]>> };

const q = (sel: string) => m.el.querySelector<HTMLElement>(sel)!;
const rows = () => [...m.el.querySelectorAll<HTMLElement>('.sys-row')].filter((r) => !r.hidden).map((r) => r.dataset.row);
const value = (row: string) => q(`.sys-row[data-row="${row}"] .sys-value`).textContent;
const lit = (row = 'sound') => m.el.querySelectorAll(`.sys-row[data-row="${row}"] .sys-meter i.on`).length;
const key = (k: string) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  window.dispatchEvent(e);
  return e;
};
const wheel = (el: HTMLElement, deltaY: number) => el.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));

beforeEach(() => {
  h = { onVolume: vi.fn(), onMute: vi.fn(), onMusic: vi.fn(), onVoice: vi.fn(), onUi: vi.fn(), onBackground: vi.fn(), onAmbient: vi.fn(), onModel: vi.fn(), onThinking: vi.fn(), onTips: vi.fn(), onTipsAgain: vi.fn(), onIntro: vi.fn(), onMirror: vi.fn(), onFrameRate: vi.fn(), onRenderScale: vi.fn(), onEffects: vi.fn(), onBlur: vi.fn(), onPost: vi.fn(), onReplyLength: vi.fn(), onChatThinking: vi.fn(), onOpenChange: vi.fn() } as typeof h;
  m = new SysMenu(h);
  document.body.append(m.el);
});
afterEach(() => {
  m.dispose();
  m.el.remove();
});

describe('SysMenu', () => {
  it('a hint set at run time shows in the foot, read as it shows, and goes when cleared', () => {
    let who = 'her';
    m.showModel('GLM');
    m.setHint('model', () => `plays ${who}`);
    m.open();
    who = 'him';
    q('.sys-row[data-row="model"]').dispatchEvent(new MouseEvent('mouseenter'));
    expect(q('.sys-foot').textContent).toBe('plays him');
    m.setHint('model', null);
    expect(q('.sys-foot').textContent).toBe('Everything at once. Enter mutes it.');
  });

  it('MIRROR and NARRATOR THINKING explain themselves in the foot, picked or hovered', () => {
    const foot = q('.sys-foot');
    m.showModel('GLM');
    m.open();
    expect(foot.textContent).toBe('Everything at once. Enter mutes it.');
    q('.sys-row[data-row="mirror"]').dispatchEvent(new MouseEvent('mouseenter'));
    expect(foot.textContent).toContain('face the other way');
    expect(foot.classList.contains('hint')).toBe(true);
    q('.sys-row[data-row="mirror"]').dispatchEvent(new MouseEvent('mouseleave'));
    expect(foot.textContent).toBe('Everything at once. Enter mutes it.');
    // A row with no words of its own (MODEL, until the HUD names her) leaves how to drive it.
    while (m['focus'] !== 'model') key('ArrowDown');
    expect(foot.textContent).toBe('← → OR SCROLL TO CHANGE · ESC CLOSES');
    expect(foot.classList.contains('hint')).toBe(false);
    while ((m['focus'] as string) !== 'think') key('ArrowDown');
    expect(foot.textContent).toContain('not chat replies');
    // Hovering a row with no hint of its own leaves the picked row's.
    q('.sys-row[data-row="model"]').dispatchEvent(new MouseEvent('mouseenter'));
    expect(foot.textContent).toContain('not chat replies');
  });

  it('the TIPS row: ON / OFF picks, SHOW AGAIN, ← → flip it', () => {
    m.showTips(true);
    m.open();
    expect(q('.sys-row[data-row="tips"] .sys-label').textContent).toBe('TIPS');
    expect(q('[data-tips="on"]').classList.contains('on')).toBe(true);
    expect(q('[data-tips="off"]').classList.contains('on')).toBe(false);
    q('[data-tips="off"]').click();
    expect(h.onTips).toHaveBeenCalledWith(false);
    q('.sys-tips-again').click();
    expect(h.onTipsAgain).toHaveBeenCalledTimes(1);
    m.showTips(false);
    expect(q('[data-tips="off"]').classList.contains('on')).toBe(true);
    while (q('.sys-row.on').dataset.row !== 'tips') key('ArrowDown');
    key('ArrowRight');
    expect(h.onTips).toHaveBeenLastCalledWith(true);
    key('Enter');
    expect(h.onTipsAgain).toHaveBeenCalledTimes(2);
  });

  it('the FRAME RATE row: 30 / 60 / UNCAPPED picks, ← → step round', () => {
    m.showFrameRate('60');
    m.open();
    expect(q('.sys-row[data-row="fps"] .sys-label').textContent).toBe('FRAME RATE');
    expect([...q('.sys-fps').children].map((w) => w.textContent)).toEqual(['30', '60', 'UNCAPPED']);
    expect(q('[data-fps="60"]').classList.contains('on')).toBe(true);
    q('[data-fps="uncapped"]').click();
    expect(h.onFrameRate).toHaveBeenLastCalledWith('uncapped');
    m.showFrameRate('uncapped');
    expect(q('[data-fps="uncapped"]').classList.contains('on')).toBe(true);
    expect(q('[data-fps="60"]').classList.contains('on')).toBe(false);
    while (q('.sys-row.on').dataset.row !== 'fps') key('ArrowDown');
    key('ArrowRight');
    expect(h.onFrameRate).toHaveBeenLastCalledWith('30');
    m.showFrameRate('30');
    key('ArrowLeft');
    expect(h.onFrameRate).toHaveBeenLastCalledWith('uncapped');
  });

  it('RENDER SCALE and EFFECTS rows: picks by click, ← → step round', () => {
    m.showRenderScale('100');
    m.showEffects('full');
    m.open();
    expect([...q('.sys-scale').children].map((w) => w.textContent)).toEqual(['100%', '75%', '50%']);
    expect([...q('.sys-fx').children].map((w) => w.textContent)).toEqual(['FULL', 'LOW', 'OFF']);
    expect(q('[data-scale="100"]').classList.contains('on')).toBe(true);
    q('[data-scale="50"]').click();
    expect(h.onRenderScale).toHaveBeenLastCalledWith('50');
    q('[data-fx="off"]').click();
    expect(h.onEffects).toHaveBeenLastCalledWith('off');
    while (q('.sys-row.on').dataset.row !== 'scale') key('ArrowDown');
    key('ArrowRight');
    expect(h.onRenderScale).toHaveBeenLastCalledWith('75');
    key('ArrowLeft');
    expect(h.onRenderScale).toHaveBeenLastCalledWith('50');
    key('ArrowDown');
    key('ArrowRight');
    expect(h.onEffects).toHaveBeenLastCalledWith('low');
    m.showEffects('low');
    expect(q('[data-fx="low"]').classList.contains('on')).toBe(true);
    expect(q('.sys-foot').textContent).toContain('LOW drops dust');
  });

  it('BLUR and POST EFFECTS rows: ON / OFF picks, ← → flip them', () => {
    m.showBlur(true);
    m.showPost(false);
    m.open();
    expect(q('.sys-blur [data-on="on"]').classList.contains('on')).toBe(true);
    expect(q('.sys-post [data-on="off"]').classList.contains('on')).toBe(true);
    q('.sys-blur [data-on="off"]').click();
    expect(h.onBlur).toHaveBeenLastCalledWith(false);
    q('.sys-post [data-on="on"]').click();
    expect(h.onPost).toHaveBeenLastCalledWith(true);
    while (q('.sys-row.on').dataset.row !== 'blur') key('ArrowDown');
    key('ArrowRight');
    expect(h.onBlur).toHaveBeenLastCalledWith(false);
    expect(q('.sys-foot').textContent).toContain('frosted glass');
    key('ArrowDown');
    key('ArrowLeft');
    expect(h.onPost).toHaveBeenLastCalledWith(true);
  });

  it('UI and IN BACKGROUND rows: a meter and percentage for UI, PLAY / MUTE lit from the sound view, ← → and the wheel', () => {
    m.showSound({ kind: 'on', volume: 0.6, muted: false, music: 1, voice: 0.75, ui: 0.4, ambient: 1, muteInBackground: true });
    m.open();
    expect(m.el.querySelectorAll('.sys-row[data-row="ui"] .sys-meter i.on').length).toBe(4);
    expect(value('ui')).toBe('40%');
    expect(q('[data-bg="mute"]').classList.contains('on')).toBe(true);
    q('[data-bg="play"]').click();
    expect(h.onBackground).toHaveBeenLastCalledWith(false);
    wheel(q('.sys-row[data-row="ui"]'), -100);
    expect(h.onUi).toHaveBeenLastCalledWith(1);
    while (q('.sys-row.on').dataset.row !== 'ui') key('ArrowDown');
    key('ArrowLeft');
    expect(h.onUi).toHaveBeenLastCalledWith(-1);
    while (q('.sys-row.on').dataset.row !== 'bg') key('ArrowDown');
    key('ArrowRight');
    expect(h.onBackground).toHaveBeenLastCalledWith(false);
    expect(q('.sys-foot').textContent).toContain('always stops');
  });

  it('REPLY LENGTH and REPLY THINKING: shown with MODEL, picks by click, ← → step round', () => {
    m.open();
    expect(rows()).not.toContain('length');
    m.showModel('GLM');
    m.showReplyLength('normal');
    m.showChatThinking('auto');
    expect(rows()).toEqual(expect.arrayContaining(['length', 'rthink']));
    expect([...q('.sys-length').children].map((w) => w.textContent)).toEqual(['SHORT', 'NORMAL', 'LONG']);
    expect([...q('.sys-rthink').children].map((w) => w.textContent)).toEqual(['AUTO', 'LOW', 'MEDIUM']);
    q('[data-length="long"]').click();
    expect(h.onReplyLength).toHaveBeenLastCalledWith('long');
    q('[data-rthink="medium"]').click();
    expect(h.onChatThinking).toHaveBeenLastCalledWith('medium');
    while (q('.sys-row.on').dataset.row !== 'length') key('ArrowDown');
    key('ArrowLeft');
    expect(h.onReplyLength).toHaveBeenLastCalledWith('short');
    key('ArrowDown');
    key('ArrowRight');
    expect(h.onChatThinking).toHaveBeenLastCalledWith('low');
    m.showModel(null);
    expect(rows()).not.toContain('rthink');
    expect(q('.sys-row.on').dataset.row).toBe('link');
  });

  it('the INTRO row: PLAY / SKIP picks, ← → flip it', () => {
    m.showIntro(false);
    m.open();
    expect(q('[data-intro="play"]').classList.contains('on')).toBe(true);
    q('[data-intro="skip"]').click();
    expect(h.onIntro).toHaveBeenLastCalledWith(true);
    m.showIntro(true);
    while (q('.sys-row.on').dataset.row !== 'intro') key('ArrowDown');
    key('ArrowRight');
    expect(h.onIntro).toHaveBeenLastCalledWith(false);
    expect(q('.sys-foot').textContent).toContain('starts the game on the splash');
  });

  it('the MIRROR row: ON / OFF picks, ← → flip it', () => {
    m.showMirror(false);
    m.open();
    expect(q('.sys-row[data-row="mirror"] .sys-label').textContent).toBe('MIRROR');
    expect(q('[data-mirror="off"]').classList.contains('on')).toBe(true);
    q('[data-mirror="on"]').click();
    expect(h.onMirror).toHaveBeenLastCalledWith(true);
    m.showMirror(true);
    expect(q('[data-mirror="on"]').classList.contains('on')).toBe(true);
    while (q('.sys-row.on').dataset.row !== 'mirror') key('ArrowDown');
    key('ArrowLeft');
    expect(h.onMirror).toHaveBeenLastCalledWith(false);
  });

  it('narrator thinking: shown with MODEL, the saved word lit, a click or ← → picks', () => {
    m.showModel('SONNET 5.5');
    m.showThinking('auto');
    expect([...m.el.querySelectorAll('i[data-think]')].map((i) => i.textContent)).toEqual(['AUTO', 'OFF', 'LOW', 'MEDIUM']);
    expect(q('i[data-think].on').textContent).toBe('AUTO');
    q('i[data-think="medium"]').click();
    expect(h.onThinking).toHaveBeenLastCalledWith('medium');
    m.open();
    while (q('.sys-row.on').dataset.row !== 'think') key('ArrowDown');
    key('ArrowRight');
    expect(h.onThinking).toHaveBeenLastCalledWith('off');
    key('ArrowLeft');
    expect(h.onThinking).toHaveBeenLastCalledWith('medium');
    m.showThinking('low');
    expect(q('i[data-think].on').textContent).toBe('LOW');
    m.showModel(null);
    expect(rows()).not.toContain('think');
    expect(q('.sys-row.on').dataset.row).toBe('link');
  });


  it('groups its rows SOUND · STAGE · GAME · MODEL, a head each; a head goes with its last row', () => {
    const groups = () => [...m.el.querySelectorAll<HTMLElement>('.sys-group')].filter((g) => !g.hidden).map((g) => g.querySelector('.sys-head')!.textContent);
    m.open();
    expect(groups()).toEqual(['SOUND', 'STAGE', 'GAME', 'MODEL']);
    expect([...m.el.querySelectorAll('.sys-group[data-group="stage"] .sys-row')].map((r) => (r as HTMLElement).dataset.row)).toEqual(['mirror', 'fps', 'scale', 'fx', 'blur', 'post']);
    expect(m.el.querySelector('.sys-row[data-row="pause"]')).toBeNull();
    m.showSound({ kind: 'hidden' });
    expect(groups()).toEqual(['STAGE', 'GAME', 'MODEL']);
    m.showSound({ kind: 'locked' });
    expect(groups()).toEqual(['SOUND', 'STAGE', 'GAME', 'MODEL']);
  });

  it('opens on the SOUND row with every row, in order; MODEL hidden until a label', () => {
    expect(m.isOpen).toBe(false);
    expect(m.el.hidden).toBe(true);
    m.open();
    expect(m.isOpen).toBe(true);
    expect(rows()).toEqual(['sound', 'mirror', 'fps', 'scale', 'fx', 'blur', 'post', 'tips', 'intro', 'link']);
    m.showModel('GLM 5.2');
    expect(rows()).toEqual(['sound', 'mirror', 'fps', 'scale', 'fx', 'blur', 'post', 'tips', 'intro', 'model', 'length', 'rthink', 'think', 'link']);
    expect(q('.hud-model').textContent).toBe('GLM 5.2 ›');
    expect(q('.sys-row.on').dataset.row).toBe('sound');
    expect(q('.sys-foot').textContent).toBe('Everything at once. Enter mutes it.');
    expect([...m.el.querySelectorAll('.sys-label')].map((l) => l.textContent)).toEqual(['SOUND', 'MUSIC', 'VOICE', 'UI', 'AMBIENT', 'IN BACKGROUND', 'MIRROR', 'FRAME RATE', 'RENDER SCALE', 'EFFECTS', 'BLUR', 'POST EFFECTS', 'TIPS', 'INTRO', 'MODEL', 'REPLY LENGTH', 'REPLY THINKING', 'NARRATOR THINKING', 'LINK']);
    m.showModel(null);
    expect(rows()).toEqual(['sound', 'mirror', 'fps', 'scale', 'fx', 'blur', 'post', 'tips', 'intro', 'link']);
  });

  it('sound: ten cells lit by volume, MUTED, CLICK FOR SOUND while locked', () => {
    expect(m.el.querySelectorAll('.sys-row[data-row="sound"] .sys-meter i').length).toBe(10);
    m.showSound({ kind: 'on', volume: 0.6, muted: false, music: 1, voice: 0.75, ui: 1, ambient: 1, muteInBackground: false });
    expect(lit()).toBe(6);
    expect(value('sound')).toBe('60%');
    m.showSound({ kind: 'on', volume: 0.6, muted: true, music: 1, voice: 0.75, ui: 1, ambient: 1, muteInBackground: false });
    expect(value('sound')).toBe('MUTED');
    m.showSound({ kind: 'locked' });
    expect(value('sound')).toBe('CLICK FOR SOUND');
  });

  it('link: OK, DOWN, SIGNAL LOST', () => {
    m.showLink('ok');
    expect(value('link')).toBe('OK');
    m.showLink('down');
    expect(value('link')).toBe('DOWN');
    m.showLink('lost');
    expect(value('link')).toBe('SIGNAL LOST');
  });

  it('keys while open: ↓ ↑ move rows (skipping a hidden MODEL), ← → change, Enter mutes or opens MODEL, Esc closes', () => {
    m.open();
    key('ArrowRight');
    expect(h.onVolume).toHaveBeenLastCalledWith(1);
    key('ArrowLeft');
    expect(h.onVolume).toHaveBeenLastCalledWith(-1);
    key('Enter');
    expect(h.onMute).toHaveBeenCalledTimes(1);
    key('ArrowDown');
    expect(q('.sys-row.on').dataset.row).toBe('mirror');
    key('ArrowDown');
    expect(q('.sys-row.on').dataset.row).toBe('fps');
    key('ArrowDown');
    expect(q('.sys-row.on').dataset.row).toBe('scale');
    key('ArrowDown');
    expect(q('.sys-row.on').dataset.row).toBe('fx');
    key('ArrowDown');
    expect(q('.sys-row.on').dataset.row).toBe('blur');
    key('ArrowDown');
    expect(q('.sys-row.on').dataset.row).toBe('post');
    key('ArrowDown');
    expect(q('.sys-row.on').dataset.row).toBe('tips');
    key('ArrowDown');
    expect(q('.sys-row.on').dataset.row).toBe('intro');
    key('ArrowDown');
    expect(q('.sys-row.on').dataset.row).toBe('link');
    m.showModel('GLM 5.2');
    key('ArrowUp');
    expect(q('.sys-row.on').dataset.row).toBe('think');
    key('ArrowUp');
    expect(q('.sys-row.on').dataset.row).toBe('rthink');
    key('ArrowUp');
    expect(q('.sys-row.on').dataset.row).toBe('length');
    key('ArrowUp');
    expect(q('.sys-row.on').dataset.row).toBe('model');
    key('Enter');
    expect(h.onModel).toHaveBeenCalledTimes(1);
    expect(m.isOpen).toBe(false);
    m.open();
    key('Escape');
    expect(m.isOpen).toBe(false);
  });

  it('its keys are taken from the prompt while open, and left alone while closed', () => {
    expect(key('Enter').defaultPrevented).toBe(false);
    expect(key('ArrowDown').defaultPrevented).toBe(false);
    m.open();
    for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter']) expect(key(k).defaultPrevented).toBe(true);
    expect(key('a').defaultPrevented).toBe(false);
    const altArrow = new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(altArrow);
    expect(altArrow.defaultPrevented).toBe(false);
    expect(m.isOpen).toBe(false); // an Alt chord closes it (review I1)
    m.open();
    expect(key('Escape').defaultPrevented).toBe(true);
    expect(m.isOpen).toBe(false);
    expect(key('Escape').defaultPrevented).toBe(false);
  });

  it('the wheel over SOUND steps the volume (+1 up)', () => {
    m.open();
    wheel(q('.sys-row[data-row="sound"]'), -100);
    wheel(q('.sys-row[data-row="sound"]'), 100);
    expect(h.onVolume.mock.calls).toEqual([[1], [-1]]);
  });

  it('a click on SOUND mutes; a click on MODEL closes and opens the MODEL menu; clicks inside never reach the document', () => {
    const doc = vi.fn();
    document.addEventListener('click', doc);
    m.showModel('GLM 5.2');
    m.open();
    q('.sys-row[data-row="sound"]').click();
    expect(h.onMute).toHaveBeenCalledTimes(1);
    q('.sys-row[data-row="model"]').click();
    expect(m.isOpen).toBe(false);
    expect(h.onModel).toHaveBeenCalledTimes(1);
    expect(doc).not.toHaveBeenCalled();
    document.removeEventListener('click', doc);
  });

  it("an Alt chord (a screen's shortcut) closes it and goes on untouched (review I1)", () => {
    m.open();
    const altS = new KeyboardEvent('keydown', { key: 's', code: 'KeyS', altKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(altS);
    expect(m.isOpen).toBe(false);
    expect(altS.defaultPrevented).toBe(false);
    expect(key('Enter').defaultPrevented).toBe(false);
  });

  it('tells onOpenChange when it opens and closes, however it closes', () => {
    m.open();
    key('Escape');
    m.open();
    m.close();
    expect(h.onOpenChange.mock.calls).toEqual([[true], [false], [true], [false]]);
  });

  it('while open its keys come before key handlers added after it — the dice table, a panel (final review I1)', () => {
    const later = vi.fn((e: KeyboardEvent) => e.stopImmediatePropagation());
    window.addEventListener('keydown', later, true);
    m.open();
    key('ArrowRight');
    key('Escape');
    window.removeEventListener('keydown', later, true);
    expect(h.onVolume).toHaveBeenCalledWith(1);
    expect(m.isOpen).toBe(false);
    expect(later).not.toHaveBeenCalled();
  });

  it('the menu names its focused row for screen readers (aria-activedescendant)', () => {
    m.open();
    const active = () => document.getElementById(m.el.getAttribute('aria-activedescendant')!)!;
    expect(active().dataset.row).toBe('sound');
    key('ArrowDown');
    expect(active().dataset.row).toBe('mirror');
  });

  it('no sound at all (hidden): the SOUND row goes, and the menu opens on MIRROR', () => {
    m.showSound({ kind: 'hidden' });
    m.open();
    expect(rows()).toEqual(['mirror', 'fps', 'scale', 'fx', 'blur', 'post', 'tips', 'intro', 'link']);
    expect(q('.sys-row.on').dataset.row).toBe('mirror');
    key('ArrowUp');
    expect(q('.sys-row.on').dataset.row).toBe('mirror');
    m.showSound({ kind: 'on', volume: 0.5, muted: false, music: 1, voice: 0.75, ui: 1, ambient: 1, muteInBackground: false });
    expect(rows()).toEqual(['sound', 'music', 'voice', 'ui', 'ambient', 'bg', 'mirror', 'fps', 'scale', 'fx', 'blur', 'post', 'tips', 'intro', 'link']);
  });

  it('music, voice and ambient: own meters and percentages, only while sound plays; ← → and the wheel step them', () => {
    m.showSound({ kind: 'locked' });
    m.open();
    expect(rows()).toEqual(['sound', 'mirror', 'fps', 'scale', 'fx', 'blur', 'post', 'tips', 'intro', 'link']);
    m.showSound({ kind: 'on', volume: 0.6, muted: true, music: 0.3, voice: 0.75, ui: 1, ambient: 0.85, muteInBackground: false });
    expect(rows()).toEqual(['sound', 'music', 'voice', 'ui', 'ambient', 'bg', 'mirror', 'fps', 'scale', 'fx', 'blur', 'post', 'tips', 'intro', 'link']);
    expect([...m.el.querySelectorAll('.sys-label')].slice(0, 6).map((l) => l.textContent)).toEqual(['SOUND', 'MUSIC', 'VOICE', 'UI', 'AMBIENT', 'IN BACKGROUND']);
    expect(lit('voice')).toBe(8);
    expect(value('voice')).toBe('75%');
    expect(lit('music')).toBe(3);
    expect(value('music')).toBe('30%');
    expect(lit('ambient')).toBe(9);
    expect(value('ambient')).toBe('85%');
    key('ArrowDown');
    expect(q('.sys-row.on').dataset.row).toBe('music');
    key('ArrowRight');
    expect(h.onMusic).toHaveBeenLastCalledWith(1);
    key('Enter');
    expect(h.onMute).not.toHaveBeenCalled();
    key('ArrowDown');
    expect(q('.sys-row.on').dataset.row).toBe('voice');
    key('ArrowLeft');
    expect(h.onVoice).toHaveBeenLastCalledWith(-1);
    key('ArrowDown');
    expect(q('.sys-row.on').dataset.row).toBe('ui');
    key('ArrowDown');
    key('ArrowLeft');
    expect(h.onAmbient).toHaveBeenLastCalledWith(-1);
    wheel(q('.sys-row[data-row="voice"]'), -100);
    expect(h.onVoice).toHaveBeenLastCalledWith(1);
    wheel(q('.sys-row[data-row="music"]'), 100);
    expect(h.onMusic).toHaveBeenLastCalledWith(-1);
    wheel(q('.sys-row[data-row="ambient"]'), -100);
    expect(h.onAmbient).toHaveBeenLastCalledWith(1);
    // Sound lost while focused on AMBIENT: the focus moves to a row still on show.
    m.showSound({ kind: 'hidden' });
    expect(q('.sys-row.on').dataset.row).toBe('mirror');
  });

  it('toggle opens and closes; dispose stops its keys', () => {
    m.toggle();
    expect(m.isOpen).toBe(true);
    m.toggle();
    expect(m.isOpen).toBe(false);
    m.open();
    m.dispose();
    expect(key('ArrowRight').defaultPrevented).toBe(false);
  });
});
