import { describe, expect, it, vi } from 'vitest';
import type { Atmosphere, LightDef, RoomState, SceneDef, ResidualRunInfo } from '../../shared/types';
import { DevPanel } from '../src/ui/devpanel';

function light(over: Partial<LightDef> & Pick<LightDef, 'id'>): LightDef {
  return { label: over.id, pos: [0, 0], color: '#101020', intensity: 0.5, radius: 40, flicker: 0, ...over };
}

function atmo(over: Partial<Atmosphere> = {}): Atmosphere {
  return { ambient: '#101020', ambientLevel: 0.3, weather: 'none', weatherLevel: 0, fog: 0, timeOfDay: 'night', ...over };
}

function scene(over: Partial<SceneDef> & Pick<SceneDef, 'id'>): SceneDef {
  return {
    name: over.id,
    description: '',
    resolution: [480, 270],
    layers: [],
    lights: [light({ id: 'desk_lamp' })],
    defaults: atmo(),
    presets: { cozy: {} },
    ...over,
  };
}

function room(over: Partial<RoomState> = {}): RoomState {
  return {
    sceneId: 'noodle-stall',
    lights: [light({ id: 'desk_lamp' })],
    atmosphere: atmo(),
    ...over,
  };
}

function setup() {
  document.body.innerHTML = '';
  // Mimics main.ts: a chat input bar with class "input" alongside the dev panel root.
  const chatBar = document.createElement('div');
  chatBar.className = 'input';
  const chatTa = document.createElement('textarea');
  chatBar.appendChild(chatTa);
  document.body.appendChild(chatBar);

  const root = document.createElement('div');
  document.body.appendChild(root);
  const send = vi.fn();
  const fps = vi.fn(() => 60);
  const panel = new DevPanel(root, send, fps);
  return { root, chatTa, send, fps, panel };
}

function fire(el: Element, type: string): void {
  el.dispatchEvent(new Event(type, { bubbles: true }));
}

describe('DevPanel', () => {
  it('backtick does not open the dev panel in the packaged app', () => {
    window.lowlight = { version: () => '0.1.0-preview.1', packaged: true, openSaveFolder: () => {}, openLogFolder: () => {} };
    try {
      const { panel } = setup();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '`', bubbles: true, cancelable: true }));
      expect(panel.open).toBe(false);
    } finally {
      delete window.lowlight;
    }
  });

  it('backtick toggles the panel when the chat input is empty (and nothing is typed)', () => {
    const { root, chatTa, panel } = setup();
    expect(panel.open).toBe(false);

    chatTa.focus();
    expect(document.activeElement).toBe(chatTa);
    const e = new KeyboardEvent('keydown', { key: '`', bubbles: true, cancelable: true });
    window.dispatchEvent(e);
    expect(panel.open).toBe(true);
    expect(root.classList.contains('open')).toBe(true);
    expect(e.defaultPrevented).toBe(true);
    expect(chatTa.value).toBe('');
    // Focus stays in the chat input after closing from there.
    expect(document.activeElement).toBe(chatTa);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '`', bubbles: true, cancelable: true }));
    expect(panel.open).toBe(false);
  });

  it('onToggle fires with the new state (blackouts phase 2: the map shows its switches mid-map)', () => {
    const { panel } = setup();
    const seen: boolean[] = [];
    panel.onToggle((open) => seen.push(open));
    panel.toggle();
    panel.toggle();
    expect(seen).toEqual([true, false]);
  });

  it('POWER OUT cuts the power where this room is (blackouts phase 3, for checks)', () => {
    const { root, send } = setup();
    root.querySelector<HTMLButtonElement>('.dp-power-out')!.click();
    expect(send).toHaveBeenCalledWith({ type: 'dev_action', tool: 'power_out', args: {} });
  });

  it('backtick toggles the panel when the chat input is whitespace-only', () => {
    const { chatTa, panel } = setup();
    chatTa.value = '   \n\t ';
    chatTa.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '`', bubbles: true, cancelable: true }));
    expect(panel.open).toBe(true);
  });

  it('backtick types normally in a non-empty chat input, with no toggle', () => {
    const { chatTa, panel } = setup();
    chatTa.value = 'hello';
    chatTa.focus();
    const e = new KeyboardEvent('keydown', { key: '`', bubbles: true, cancelable: true });
    window.dispatchEvent(e);
    expect(panel.open).toBe(false);
    expect(e.defaultPrevented).toBe(false);
  });

  it('backtick types normally in the dev panel\'s own simulate inputs, with no toggle', () => {
    const { root, panel } = setup();
    const simTool = root.querySelector<HTMLInputElement>('.dp-sim-tool')!;
    simTool.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '`', bubbles: true, cancelable: true }));
    expect(panel.open).toBe(false);
  });

  it('backtick toggles the panel when focus is elsewhere entirely', () => {
    const { root, panel } = setup();
    expect(document.activeElement).not.toBe(root);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '`', bubbles: true, cancelable: true }));
    expect(panel.open).toBe(true);
  });

  it('choosing a scene in the picker sends go_to', () => {
    const { root, send, panel } = setup();
    panel.setScenes([scene({ id: 'noodle-stall' }), scene({ id: 'ribbon-rooftop' })]);
    const select = root.querySelector<HTMLSelectElement>('.dp-scene-select')!;
    select.value = 'ribbon-rooftop';
    fire(select, 'change');
    expect(send).toHaveBeenCalledWith({ type: 'dev_action', tool: 'go_to', args: { id: 'ribbon-rooftop' } });
  });

  it('moving the desk_lamp intensity slider to 30 sends set_light', () => {
    const { root, send, panel } = setup();
    panel.setRoom(room());
    const row = root.querySelector<HTMLElement>('.dp-light-row[data-light-id="desk_lamp"]')!;
    const intensity = row.querySelector<HTMLInputElement>('.dp-light-intensity')!;
    intensity.value = '30';
    fire(intensity, 'input');
    expect(send).toHaveBeenCalledWith({
      type: 'dev_action',
      tool: 'set_light',
      args: { light_id: 'desk_lamp', intensity: 0.3 },
    });
  });

  it('mood buttons send apply_mood', () => {
    const { root, send, panel } = setup();
    panel.setScenes([scene({ id: 'noodle-stall', presets: { cozy: {} } })]);
    panel.setRoom(room({ sceneId: 'noodle-stall' }));
    const btn = root.querySelector<HTMLButtonElement>('.dp-preset-btn')!;
    expect(btn.textContent).toBe('cozy');
    btn.click();
    expect(send).toHaveBeenCalledWith({ type: 'dev_action', tool: 'apply_mood', args: { name: 'cozy' } });
  });

  it("ROOM SOUND lists the room's agent sounds and PLAY sends play_sound as the agent; hidden in a room with none", () => {
    const { root, send, panel } = setup();
    const sounds = [
      { name: 'kettle', src: 'sound/keep/k.ogg', agent: { about: 'the kettle' } },
      { name: 'train', src: 'sound/keep/t.ogg', timer: { min: 3, max: 8 } },
      { name: 'door', src: 'sound/keep/d.ogg', agent: { about: 'the door' } },
    ];
    panel.setScenes([scene({ id: 'noodle-stall', sound: { sounds } }), scene({ id: 'quiet' })]);
    panel.setRoom(room({ sceneId: 'noodle-stall' }));
    const row = root.querySelector<HTMLElement>('.dp-sound-row')!;
    const select = root.querySelector<HTMLSelectElement>('.dp-sound-select')!;
    expect(row.hidden).toBe(false);
    expect([...select.options].map((o) => o.value)).toEqual(['kettle', 'door']);
    select.value = 'door';
    root.querySelector<HTMLButtonElement>('.dp-sound-play')!.click();
    expect(send).toHaveBeenCalledWith({ type: 'dev_action', tool: 'play_sound', args: { name: 'door' }, as: 'agent' });
    panel.setRoom(room({ sceneId: 'quiet' }));
    expect(row.hidden).toBe(true);
  });

  it('the simulate box sends dev_action as nix, and invalid JSON logs locally and sends nothing', () => {
    const { root, send, panel } = setup();
    const tool = root.querySelector<HTMLInputElement>('.dp-sim-tool')!;
    const args = root.querySelector<HTMLTextAreaElement>('.dp-sim-args')!;
    const run = root.querySelector<HTMLButtonElement>('.dp-sim-run')!;

    tool.value = 'set_ambient';
    args.value = '{"level":0.1}';
    run.click();
    expect(send).toHaveBeenCalledWith({
      type: 'dev_action',
      tool: 'set_ambient',
      args: { level: 0.1 },
      as: 'agent',
    });

    send.mockClear();
    args.value = '{not json';
    run.click();
    expect(send).not.toHaveBeenCalled();
    expect(root.querySelector('.dp-log-error')).toBeTruthy();
  });

  it('each light row exposes labeled intensity and flicker controls', () => {
    const { root, panel } = setup();
    panel.setRoom(room());
    const row = root.querySelector<HTMLElement>('.dp-light-row[data-light-id="desk_lamp"]')!;

    const intensity = row.querySelector<HTMLInputElement>('.dp-light-intensity')!;
    const flicker = row.querySelector<HTMLInputElement>('.dp-light-flicker')!;
    expect(intensity.getAttribute('aria-label')).toMatch(/intensity/i);
    expect(flicker.getAttribute('aria-label')).toMatch(/flicker/i);

    const intensityRow = intensity.closest('.dp-slider-row')!;
    const flickerRow = flicker.closest('.dp-slider-row')!;
    expect(intensityRow.querySelector('.dp-slider-label')!.textContent).toMatch(/intensity/i);
    expect(flickerRow.querySelector('.dp-slider-label')!.textContent).toMatch(/flicker/i);
    // A live %-value readout sits next to each slider.
    expect(intensityRow.querySelector('.dp-slider-value')!.textContent).toMatch(/%$/);
    expect(flickerRow.querySelector('.dp-slider-value')!.textContent).toMatch(/%$/);
  });

  it('setRoom updates the JSON view and the slider values without sending anything', () => {
    const { root, send, panel } = setup();
    panel.setRoom(room());
    send.mockClear();

    panel.setRoom(room({ lights: [light({ id: 'desk_lamp', intensity: 0.7 })] }));
    expect(send).not.toHaveBeenCalled();

    const row = root.querySelector<HTMLElement>('.dp-light-row[data-light-id="desk_lamp"]')!;
    const intensity = row.querySelector<HTMLInputElement>('.dp-light-intensity')!;
    expect(intensity.value).toBe('70');

    const json = root.querySelector('.dp-json')!;
    expect(json.textContent).toContain('"intensity": 0.7');
  });

  it('shows MODEL — until the model is known, then the provider · model pair under the link status', () => {
    const { root, panel } = setup();
    const modelEl = root.querySelector('.dp-model')!;
    expect(modelEl.textContent).toBe('MODEL —');
    expect(root.querySelector('.dp-link')!.nextElementSibling).toBe(modelEl);

    panel.setModel({ model: 'claude-sonnet-5-5', provider: 'anthropic' });
    expect(modelEl.textContent).toBe('MODEL anthropic · claude-sonnet-5-5');

    panel.setModel(null);
    expect(modelEl.textContent).toBe('MODEL —');
  });
});

describe('DevPanel sound', () => {
  it('a SOUND section with weather, room, lights and music sliders that report changes', () => {
    const { root, panel } = setup();
    expect(root.querySelector<HTMLElement>('.dp-sound')!.hidden).toBe(true);
    const onChange = vi.fn();
    panel.setSoundMixer({ weather: 1, room: 0.5, lights: 0.25, music: 0.4 }, onChange);
    const section = root.querySelector<HTMLElement>('.dp-sound')!;
    expect(section.hidden).toBe(false);
    expect(section.querySelector('.dp-label')!.textContent).toBe('SOUND');
    const sliders = [...section.querySelectorAll<HTMLInputElement>('input[type="range"]')];
    expect(sliders.map((s) => s.value)).toEqual(['100', '50', '25', '40']);
    sliders[1].value = '30';
    sliders[1].dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledWith('room', 0.3);
  });

  it('shows the engine state', () => {
    const { root, panel } = setup();
    panel.setSoundMixer({ weather: 1, room: 1, lights: 1, music: 1 }, () => {});
    panel.setSoundState({ available: true, unlocked: false, context: 'none', voices: [], mix: null });
    expect(root.querySelector('.dp-sound-state')!.textContent).toBe('LOCKED — waiting for a click or key');
    panel.setSoundState({ available: true, unlocked: true, context: 'running', voices: ['rain', 'neon:sign'], mix: null });
    expect(root.querySelector('.dp-sound-state')!.textContent).toBe('RUNNING · rain, neon:sign');
    panel.setSoundState({ available: true, unlocked: true, context: 'running', voices: ['rain'], mix: null, music: 'error' });
    expect(root.querySelector('.dp-sound-state')!.textContent).toBe('RUNNING · rain · music failed to load');
    panel.setSoundState({ available: false, unlocked: false, context: 'none', voices: [], mix: null });
    expect(root.querySelector('.dp-sound-state')!.textContent).toBe('UNAVAILABLE — no Web Audio');
  });

  it("shows the room's song, or the pause between songs", () => {
    const { root, panel } = setup();
    const on = { available: true, unlocked: true, context: 'running', voices: ['music'], mix: null };
    panel.setSoundState({ ...on, playlist: { song: 'rain-tape.ogg', phase: 'playing', pauseUntil: null } });
    expect(root.querySelector('.dp-sound-state')!.textContent).toBe('RUNNING · music · ♪ rain-tape.ogg');
    panel.setSoundState({ ...on, voices: [], playlist: { song: null, phase: 'pause', pauseUntil: 40 } });
    expect(root.querySelector('.dp-sound-state')!.textContent).toBe('RUNNING · silent · ♪ pause');
  });
});


describe('DevPanel stage crops', () => {
  it('STAGE: sliders per side report crops, show the JSON, and COPY it', async () => {
    const { root, panel } = setup();
    expect(root.querySelector<HTMLElement>('.dp-stage')!.hidden).toBe(true);
    const onChange = vi.fn();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    panel.setStageCrops({ left: { top: 0, bottom: 0.5 }, right: { top: 0.05, bottom: 0.55 } }, onChange);
    const section = root.querySelector<HTMLElement>('.dp-stage')!;
    expect(section.hidden).toBe(false);
    const sliders = [...section.querySelectorAll<HTMLInputElement>('input[type="range"]')];
    expect(sliders.map((s) => s.value)).toEqual(['0', '50', '5', '55']);
    sliders[3].value = '60';
    sliders[3].dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenLastCalledWith('right', { top: 0.05, bottom: 0.6 });
    const json = section.querySelector('.dp-stage-json')!.textContent!;
    expect(json).toContain('you    "crop": { "top": 0, "bottom": 0.5 }');
    expect(json).toContain('agent  "crop": { "top": 0.05, "bottom": 0.6 }');
    (section.querySelector('.dp-stage-copy') as HTMLElement).click();
    expect(writeText).toHaveBeenCalledWith(json);
  });

  it("STAGE: a slider tweak is kept in the caller's crops, so a re-render (reconnect) shows what the figure shows", () => {
    const { root, panel } = setup();
    const crops = { left: { top: 0, bottom: 0.5 }, right: { top: 0, bottom: 0.5 } };
    panel.setStageCrops(crops, () => {});
    const slider = root.querySelectorAll<HTMLInputElement>('.dp-stage input[type="range"]')[1];
    slider.value = '45';
    slider.dispatchEvent(new Event('change'));
    expect(crops.left).toEqual({ top: 0, bottom: 0.45 });
    panel.setStageCrops(crops, () => {});
    expect(root.querySelector('.dp-stage-json')!.textContent).toContain('you    "crop": { "top": 0, "bottom": 0.45 }');
  });
});

describe('DevPanel expression picker', () => {
  it('STAGE: an EXPRESSION select with neutral and her faces; picking one reports it; none hides it', () => {
    const { root, panel } = setup();
    const onPick = vi.fn();
    panel.setExpressions(['happy', 'laughing'], onPick);
    const select = root.querySelector<HTMLSelectElement>('.dp-expression-select')!;
    expect(root.querySelector<HTMLElement>('.dp-stage')!.hidden).toBe(false);
    expect(select.closest<HTMLElement>('.dp-expression')!.hidden).toBe(false);
    expect([...select.options].map((o) => o.value)).toEqual(['neutral', 'happy', 'laughing']);
    select.value = 'laughing';
    fire(select, 'change');
    expect(onPick).toHaveBeenCalledWith('laughing');
    panel.setExpressions([], onPick);
    const hiddenRow = root.querySelector<HTMLElement>('.dp-expression');
    expect(hiddenRow).toBeTruthy();
    expect(hiddenRow!.hidden).toBe(true);
  });

  it('resets to neutral after a pick, so choosing the same face again still fires onPick', () => {
    const { root, panel } = setup();
    const onPick = vi.fn();
    panel.setExpressions(['happy'], onPick);
    const select = root.querySelector<HTMLSelectElement>('.dp-expression-select')!;

    select.value = 'happy';
    fire(select, 'change');
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenNthCalledWith(1, 'happy');
    expect(select.value).toBe('neutral');

    select.value = 'happy';
    fire(select, 'change');
    expect(onPick).toHaveBeenCalledTimes(2);
    expect(onPick).toHaveBeenNthCalledWith(2, 'happy');
    expect(select.value).toBe('neutral');
  });

  it('the picker survives the crop sliders being re-rendered (a reconnect)', () => {
    const { root, panel } = setup();
    const crops = { left: { top: 0, bottom: 0.5 }, right: { top: 0, bottom: 0.5 } };
    panel.setStageCrops(crops, () => {});
    panel.setExpressions(['happy'], () => {});
    panel.setStageCrops(crops, () => {});
    expect(root.querySelector<HTMLElement>('.dp-expression')!.hidden).toBe(false);
    expect(root.querySelectorAll('.dp-expression-select')).toHaveLength(1);
  });

  it('the scene picker groups the city\'s rooms by district', () => {
    const { panel, root: host } = setup();
    panel.setScenes([scene({ id: 'default/workspace', district: 'default', folder: 'workspace' } as never), scene({ id: 'ribbon/noodle-stall', district: 'ribbon', folder: 'noodle-stall' } as never)]);
    const groups = [...host.querySelectorAll('optgroup')].map((g) => [g.label, [...g.querySelectorAll('option')].map((o) => o.value)]);
    expect(groups).toEqual([['default', ['default/workspace']], ['ribbon', ['ribbon/noodle-stall']]]);
  });
});

describe('RESIDUAL section (scribe spec §8)', () => {
  const run = (over: Partial<ResidualRunInfo> = {}): ResidualRunInfo => ({
    at: new Date(2026, 9, 15, 22, 41).getTime(), kind: 'turn', player: 'hicks', messageId: 'm1', take: 0, ms: 1400,
    tokensIn: 900, tokensOut: 40, raw: '{"notes":[]}', applied: ['note n3 added'], refused: ['pin n3 refused: pins full (8)'], error: null, ...over,
  });

  it('lists runs newest first; a row opens its raw answer beside what was applied and refused', () => {
    const { root, panel } = setup();
    panel.setResidualRuns([run(), run({ kind: 'summary', applied: ['summary saved (20 lines)'], refused: [] }), run({ error: 'answer: not JSON', applied: [], refused: [] })]);
    const rows = [...root.querySelectorAll<HTMLElement>('.dp-residual-row')];
    expect(rows.map((r) => r.querySelector('.dp-residual-sum')!.textContent)).toEqual([
      '22:41 · turn · 1 applied · 1 refused · 1.4 s',
      '22:41 · summary · 1 applied · 1.4 s',
      '22:41 · turn · failed: answer: not JSON · 1.4 s',
    ]);
    expect(root.querySelector('.dp-residual-detail')).toBeNull();
    rows[0].querySelector<HTMLElement>('.dp-residual-sum')!.click();
    const detail = root.querySelector('.dp-residual-detail')!;
    expect(detail.textContent).toContain('{"notes":[]}');
    expect(detail.textContent).toContain('note n3 added');
    expect(detail.textContent).toContain('pin n3 refused: pins full (8)');
  });

  it('CIPHER: every truth with its holders and clues, off-page ones flagged; none yet without (cipher spec §2.9)', () => {
    const { root, panel } = setup();
    panel.setResidualRuns([], null);
    expect(root.querySelector('.dp-cipher')!.textContent).toContain('none yet');
    panel.setResidualRuns([], {
      replies: 9,
      lastRun: 6,
      truths: [
        {
          id: 'nix-1', kind: 'place', truth: 'The stall is a drop.', knownBy: ['hae'], comesOutWhen: 'you see the drop', changes: 'the Tilt knows you', clueIdeas: 'chalk', state: 'open',
          clues: [
            { text: 'a thick envelope', messageId: 'm1', at: 1300, place: 'karasu/noodle-stall', onPage: true },
            { text: 'a look', messageId: 'm2', at: 1310, place: 'karasu/noodle-stall', onPage: false },
          ],
        },
      ],
    });
    const c = root.querySelector('.dp-cipher')!;
    expect(c.textContent).toContain('nix-1 · place · open · hae');
    expect(c.textContent).toContain('The stall is a drop.');
    expect(c.textContent).toContain('comes out when: you see the drop');
    expect(c.textContent).toContain('a thick envelope');
    expect(c.textContent).toContain('OFF PAGE a look');
    expect(c.textContent).toContain('9 replies · last run at 6');
  });

  it('HABITS: the rules and their reply, none yet without; a habits run shows its refusals (habits spec §3)', () => {
    const { root, panel } = setup();
    panel.setResidualRuns([], null, null);
    expect(root.querySelector('.dp-habits')!.textContent).toContain('none yet');
    panel.setResidualRuns([run({ kind: 'habits', applied: ['habits: 2 rules'], refused: ['habits: rule 2 quotes her'] })], null, { rules: ['A', 'B'], through: 'm9' });
    const h = root.querySelector('.dp-habits')!;
    expect([...h.querySelectorAll('.dp-habits-rule')].map((r) => r.textContent)).toEqual(['A', 'B']);
    expect(h.textContent).toContain('through m9');
    const row = root.querySelector<HTMLElement>('.dp-residual-row .dp-residual-sum')!;
    expect(row.textContent).toBe('22:41 · habits · 1 applied · 1 refused · 1.4 s');
    row.click();
    expect(root.querySelector('.dp-residual-detail')!.textContent).toContain('habits: rule 2 quotes her');
  });

  it('REFRESH asks for the runs, and so does a Residual log line', () => {
    const { root, send, panel } = setup();
    root.querySelector<HTMLButtonElement>('.dp-residual-refresh')!.click();
    expect(send).toHaveBeenLastCalledWith({ type: 'residual_runs' });
    send.mockClear();
    panel.log('info', 'lore · 2 entries');
    expect(send).not.toHaveBeenCalled();
    panel.log('info', 'residual · 1 note · 1.2 s');
    expect(send).toHaveBeenLastCalledWith({ type: 'residual_runs' });
  });
});
