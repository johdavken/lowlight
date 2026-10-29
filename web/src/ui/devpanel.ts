import { CHANNELS, type Channel, type EngineState } from '../audio/engine';
import type { PlaylistState } from '../audio/playlist';
import type { Atmosphere, ClientEvent, Crop, LightDef, LinkStatus, RoomState, SceneDef, ResidualRunInfo } from '../../../shared/types';
import type { CipherState } from '../../../shared/cipher';

type Send = (e: ClientEvent) => void;

const WEATHER_OPTIONS = ['none', 'rain', 'snow', 'ash', 'dust'] as const;
/** Caps the log list so a busy session doesn't grow the DOM unbounded. */
const MAX_LOG_ROWS = 80;
/** At most one dev_action per slider per this many ms while dragging; `change` always sends. */
const SLIDER_THROTTLE_MS = 100;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Returns a function that runs `fn` only if at least `ms` have passed since the last run. */
function throttle(ms: number): (fn: () => void) => void {
  let last = 0;
  return (fn) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn();
    }
  };
}

/** A labeled `<input type="range">` with a live `NN%` readout next to it. */
interface Slider {
  wrap: HTMLElement;
  input: HTMLInputElement;
  /** Sets the slider (and its readout) from a 0..1 fraction, without firing `onChange`. */
  setValue(fraction: number): void;
}

interface LightRow {
  root: HTMLElement;
  color: HTMLInputElement;
  intensity: Slider;
  flicker: Slider;
}

/**
 * The hidden dev drawer (backtick toggles it). Every control sends a `dev_action` through the
 * same `send` the chat socket uses — nothing here bypasses the server's RoomState API.
 */
export class DevPanel {
  private _open = false;
  private readonly lightRows = new Map<string, LightRow>();
  private readonly scenes = new Map<string, SceneDef>();
  private room: RoomState | null = null;
  /** Set while applying setRoom() values to controls, so their change handlers don't re-send. */
  private applying = false;

  private readonly sceneSelect: HTMLSelectElement;
  private readonly presetButtons: HTMLElement;
  private readonly lightsList: HTMLElement;
  private readonly ambientColor: HTMLInputElement;
  private readonly ambientLevel: Slider;
  private readonly weatherSelect: HTMLSelectElement;
  private readonly weatherLevel: Slider;
  private readonly fogLevel: Slider;
  private readonly jsonView: HTMLElement;
  private readonly logList: HTMLElement;
  private readonly residualList: HTMLElement;
  /** The Cipher under the runs (cipher spec §2.9): every truth, read-only. */
  private readonly cipherBox: HTMLElement;
  /** HABITS under the Cipher (habits spec §3): the rules she's told to leave out, read-only. */
  private readonly habitsBox: HTMLElement;
  private residualRuns: ResidualRunInfo[] = [];
  /** The row whose details are open; null: none. */
  private residualOpen: number | null = null;
  private readonly linkEl: HTMLElement;
  private readonly modelEl: HTMLElement;
  private readonly fpsEl: HTMLElement;
  private readonly simTool: HTMLInputElement;
  private readonly simArgs: HTMLTextAreaElement;
  private readonly simulateBox: HTMLElement;
  private readonly soundSection: HTMLElement;
  private readonly soundState: HTMLElement;
  private soundSliders: HTMLElement | null = null;
  private readonly stageSection: HTMLElement;
  private readonly expressionRow: HTMLElement;
  private readonly expressionSelect: HTMLSelectElement;
  private onExpression: ((name: string) => void) | null = null;
  private readonly roomSoundRow: HTMLElement;
  private readonly roomSoundSelect: HTMLSelectElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly send: Send,
    private readonly fps: () => number,
  ) {
    root.classList.add('devpanel');

    const head = el('div', 'dp-head');
    head.append(el('span', 'dp-title', 'DEV PANEL'));
    this.fpsEl = el('span', 'dp-fps');
    this.linkEl = el('span', 'dp-link');
    this.modelEl = el('span', 'dp-model');
    head.append(this.fpsEl, this.linkEl, this.modelEl);

    const sceneSection = el('div', 'dp-section');
    sceneSection.append(el('label', 'dp-label', 'SCENE'));
    this.sceneSelect = el('select', 'dp-scene-select');
    this.sceneSelect.addEventListener('change', () => {
      if (this.applying) return;
      const id = this.sceneSelect.value;
      if (id) this.send({ type: 'dev_action', tool: 'go_to', args: { id } });
    });
    sceneSection.append(this.sceneSelect);

    const presetSection = el('div', 'dp-section');
    presetSection.append(el('label', 'dp-label', 'PRESETS'));
    this.presetButtons = el('div', 'dp-preset-buttons');
    presetSection.append(this.presetButtons);

    const lightsSection = el('div', 'dp-section');
    lightsSection.append(el('label', 'dp-label', 'LIGHTS'));
    this.lightsList = el('div', 'dp-lights-list');
    lightsSection.append(this.lightsList);

    const ambientSection = el('div', 'dp-section');
    ambientSection.append(el('label', 'dp-label', 'AMBIENT'));
    const ambientRow = el('div', 'dp-row');
    this.ambientColor = el('input', 'dp-ambient-color');
    this.ambientColor.type = 'color';
    this.ambientColor.addEventListener('change', () => {
      if (this.applying) return;
      this.send({ type: 'dev_action', tool: 'set_ambient', args: { color: this.ambientColor.value } });
    });
    this.ambientColor.setAttribute('aria-label', 'Ambient color');
    this.ambientLevel = this.makeSlider('dp-ambient-level', 'LEVEL', 'Ambient level', (v) => {
      this.send({ type: 'dev_action', tool: 'set_ambient', args: { level: v } });
    });
    ambientRow.append(this.ambientColor, this.ambientLevel.wrap);
    ambientSection.append(ambientRow);

    const atmoSection = el('div', 'dp-section');
    atmoSection.append(el('label', 'dp-label', 'ATMOSPHERE'));
    this.weatherSelect = el('select', 'dp-weather-select');
    for (const w of WEATHER_OPTIONS) {
      const opt = el('option', undefined, w.toUpperCase());
      opt.value = w;
      this.weatherSelect.append(opt);
    }
    this.weatherSelect.addEventListener('change', () => {
      if (this.applying) return;
      this.send({ type: 'dev_action', tool: 'set_atmosphere', args: { weather: this.weatherSelect.value } });
    });
    this.weatherLevel = this.makeSlider('dp-weather-level', 'WEATHER', 'Weather level', (v) => {
      this.send({ type: 'dev_action', tool: 'set_atmosphere', args: { weather_level: v } });
    });
    this.fogLevel = this.makeSlider('dp-fog-level', 'FOG', 'Fog', (v) => {
      this.send({ type: 'dev_action', tool: 'set_atmosphere', args: { fog: v } });
    });
    // Blackouts phase 3: this room's district goes dark for 90 story minutes, to check rooms, the HUD and the map.
    const powerOut = el('button', 'dp-power-out', 'POWER OUT');
    powerOut.type = 'button';
    powerOut.addEventListener('click', () => this.send({ type: 'dev_action', tool: 'power_out', args: {} }));
    atmoSection.append(this.weatherSelect, this.weatherLevel.wrap, this.fogLevel.wrap, powerOut);

    this.soundSection = el('div', 'dp-section dp-sound');
    this.soundSection.hidden = true;
    this.soundSection.append(el('label', 'dp-label', 'SOUND'));
    this.soundState = el('div', 'dp-sound-state');
    this.soundSection.append(this.soundState);

    this.stageSection = el('div', 'dp-section dp-stage');
    this.stageSection.hidden = true;
    this.expressionRow = el('div', 'dp-row dp-expression');
    this.expressionRow.hidden = true;
    this.expressionSelect = el('select', 'dp-expression-select');
    this.expressionSelect.setAttribute('aria-label', 'Expression');
    this.expressionSelect.addEventListener('change', () => {
      const name = this.expressionSelect.value;
      this.expressionSelect.value = 'neutral';
      this.onExpression?.(name);
    });
    this.expressionRow.append(el('span', 'dp-slider-label', 'EXPRESSION'), this.expressionSelect);

    // The room's sounds the agent can play: PLAY runs play_sound as her (the ♪ line, the sound).
    this.roomSoundRow = el('div', 'dp-row dp-sound-row');
    this.roomSoundRow.hidden = true;
    this.roomSoundSelect = el('select', 'dp-sound-select');
    this.roomSoundSelect.setAttribute('aria-label', 'Room sound');
    const playSound = el('button', 'dp-sound-play', 'PLAY');
    playSound.addEventListener('click', () => {
      const name = this.roomSoundSelect.value;
      if (name) this.send({ type: 'dev_action', tool: 'play_sound', args: { name }, as: 'agent' });
    });
    this.roomSoundRow.append(el('span', 'dp-slider-label', 'ROOM SOUND'), this.roomSoundSelect, playSound);
    this.soundSection.append(this.roomSoundRow);
    this.stageSection.append(el('label', 'dp-label', 'STAGE'), this.expressionRow);

    const stateSection = el('div', 'dp-section');
    stateSection.append(el('label', 'dp-label', 'ROOM STATE'));
    this.jsonView = el('pre', 'dp-json');
    stateSection.append(this.jsonView);

    const logSection = el('div', 'dp-section');
    logSection.append(el('label', 'dp-label', 'LOG'));
    this.logList = el('div', 'dp-log-list');
    logSection.append(this.logList);

    // The Residual's runs (scribe spec §8): what it read, wrote and refused, for tuning and hand-checks.
    const residualSection = el('div', 'dp-section dp-residual');
    const residualHead = el('div', 'dp-residual-head');
    const refresh = el('button', 'dp-residual-refresh', 'REFRESH');
    refresh.type = 'button';
    refresh.addEventListener('click', () => this.send({ type: 'residual_runs' }));
    residualHead.append(el('label', 'dp-label', 'RESIDUAL · BLACK LEDGER'), refresh);
    this.residualList = el('div', 'dp-residual-list');
    this.cipherBox = el('div', 'dp-cipher');
    this.habitsBox = el('div', 'dp-habits');
    residualSection.append(residualHead, this.residualList, this.cipherBox, this.habitsBox);
    this.renderCipher(null);
    this.renderHabits(null);

    const simSection = el('div', 'dp-section dp-simulate');
    simSection.append(el('label', 'dp-label', 'SIMULATE TOOL CALL'));
    this.simTool = el('input', 'dp-sim-tool');
    this.simTool.placeholder = 'tool name';
    this.simArgs = el('textarea', 'dp-sim-args');
    this.simArgs.placeholder = '{ }';
    const simRun = el('button', 'dp-sim-run', 'RUN');
    simRun.type = 'button';
    simRun.addEventListener('click', () => this.runSimulate());
    simSection.append(this.simTool, this.simArgs, simRun);
    this.simulateBox = simSection;

    root.append(
      head,
      sceneSection,
      presetSection,
      lightsSection,
      ambientSection,
      atmoSection,
      this.soundSection,
      this.stageSection,
      stateSection,
      logSection,
      residualSection,
      simSection,
    );

    window.addEventListener('keydown', (e) => {
      if (e.key !== '`') return;
      // The packaged desktop app (preview build) ships without the dev panel.
      if (window.lowlight?.packaged) return;
      const active = document.activeElement;
      if (active && this.simulateBox.contains(active)) return;
      const chatBar = active?.closest('.input') ?? null;
      if (chatBar) {
        const chatField = chatBar.querySelector('textarea, input');
        const chatText =
          chatField instanceof HTMLTextAreaElement || chatField instanceof HTMLInputElement ? chatField.value : '';
        // Non-empty chat input: let the backtick type normally, no toggle.
        if (chatText.trim() !== '') return;
        // Empty chat input: toggle instead of typing, and leave focus where it is.
      }
      e.preventDefault();
      this.toggle();
    });

    setInterval(() => {
      this.fpsEl.textContent = `${Math.round(this.fps())} FPS`;
    }, 500);

    this.setLink('down');
    this.setModel(null);
  }

  /** Shows the SOUND section with a slider per channel. */
  setSoundMixer(levels: Record<Channel, number>, onChange: (ch: Channel, v: number) => void): void {
    this.soundSliders?.remove();
    const rows = el('div', 'dp-sound-sliders');
    for (const ch of CHANNELS) {
      const slider = this.makeSlider(`dp-sound-${ch}`, ch.toUpperCase(), `${ch} volume`, (v) => onChange(ch, v));
      slider.setValue(levels[ch]);
      rows.append(slider.wrap);
    }
    this.soundSliders = rows;
    this.soundSection.insertBefore(rows, this.soundState);
    this.soundSection.hidden = false;
  }

  /**
   * STAGE: top/bottom crop sliders for both figures (live, through `onChange`), and the `crop` JSON
   * to paste into persona.json / character.json, with a COPY button. `crops` is the caller's live
   * record: a tweak is written back into it, so a later re-render (a reconnect) keeps it.
   */
  setStageCrops(crops: { left: Crop; right: Crop }, onChange: (side: 'left' | 'right', crop: Crop) => void): void {
    const now = { left: { ...crops.left }, right: { ...crops.right } };
    const json = el('pre', 'dp-stage-json');
    const fmt = (c: Crop) => `"crop": { "top": ${+c.top.toFixed(2)}, "bottom": ${+c.bottom.toFixed(2)} }`;
    const paint = () => (json.textContent = `you    ${fmt(now.left)}\nagent  ${fmt(now.right)}`);
    const rows = el('div', 'dp-stage-sliders');
    for (const side of ['left', 'right'] as const) {
      for (const edge of ['top', 'bottom'] as const) {
        const label = `${side === 'left' ? 'YOU' : 'AGENT'} ${edge.toUpperCase()}`;
        const slider = this.makeSlider(`dp-stage-${side}-${edge}`, label, `${label} crop`, (v) => {
          now[side] = { ...now[side], [edge]: v };
          crops[side] = { ...now[side] };
          paint();
          onChange(side, { ...now[side] });
        });
        slider.setValue(now[side][edge]);
        rows.append(slider.wrap);
      }
    }
    const copy = el('button', 'dp-stage-copy', 'COPY');
    copy.type = 'button';
    copy.addEventListener('click', () => void navigator.clipboard?.writeText(json.textContent ?? '').catch(() => {}));
    paint();
    this.stageSection.replaceChildren(el('label', 'dp-label', 'STAGE'), this.expressionRow, rows, json, copy);
    this.stageSection.hidden = false;
  }

  /**
   * STAGE › EXPRESSION: a picker with `neutral` and her faces; choosing one calls `onPick` (which
   * sets it on her latest reply). No faces hides the row.
   */
  setExpressions(names: string[], onPick: (name: string) => void): void {
    this.onExpression = onPick;
    this.expressionSelect.replaceChildren();
    for (const name of ['neutral', ...names]) {
      const opt = el('option', undefined, name.toUpperCase());
      opt.value = name;
      this.expressionSelect.append(opt);
    }
    this.expressionRow.hidden = names.length === 0;
    if (names.length > 0) this.stageSection.hidden = false;
  }

  setSoundState(s: EngineState & { playlist?: PlaylistState }): void {
    const p = s.playlist;
    const song = p?.phase === 'playing' && p.song ? ` · ♪ ${p.song}` : p?.phase === 'pause' ? ' · ♪ pause' : '';
    this.soundState.textContent = !s.available
      ? 'UNAVAILABLE — no Web Audio'
      : !s.unlocked
        ? 'LOCKED — waiting for a click or key'
        : `${s.context.toUpperCase()} · ${s.voices.length ? s.voices.join(', ') : 'silent'}${song}${s.music === 'error' ? ' · music failed to load' : ''}`;
  }

  get open(): boolean {
    return this._open;
  }

  toggle(): void {
    this._open = !this._open;
    this.root.classList.toggle('open', this._open);
    for (const cb of this.toggled) cb(this._open);
  }

  /** Told the new state each time the panel opens or closes (the map's blackout switches follow it). */
  onToggle(cb: (open: boolean) => void): void {
    this.toggled.push(cb);
  }
  private readonly toggled: ((open: boolean) => void)[] = [];

  setScenes(scenes: SceneDef[]): void {
    this.scenes.clear();
    this.sceneSelect.innerHTML = '';
    // The city's rooms, grouped by district (a scene from no district goes in no group).
    const groups = new Map<string, HTMLOptGroupElement>();
    for (const s of scenes) {
      this.scenes.set(s.id, s);
      const opt = el('option', undefined, s.name);
      opt.value = s.id;
      if (!s.district) {
        this.sceneSelect.append(opt);
        continue;
      }
      let group = groups.get(s.district);
      if (!group) {
        group = document.createElement('optgroup');
        group.label = s.district;
        groups.set(s.district, group);
        this.sceneSelect.append(group);
      }
      group.append(opt);
    }
    if (this.room) this.renderPresets(this.room.sceneId);
  }

  setRoom(r: RoomState): void {
    this.room = r;
    this.applying = true;
    try {
      const hasScene = Array.from(this.sceneSelect.options).some((o) => o.value === r.sceneId);
      if (hasScene) this.sceneSelect.value = r.sceneId;
      this.syncLights(r.lights);
      this.syncAtmosphere(r.atmosphere);
      this.renderPresets(r.sceneId);
    } finally {
      this.applying = false;
    }
    this.jsonView.textContent = JSON.stringify(r, null, 2);
  }

  log(level: 'info' | 'warn' | 'error', text: string): void {
    // A Residual run just ended: the RESIDUAL section asks for the new list.
    if (text.startsWith('residual ·')) this.send({ type: 'residual_runs' });
    const row = el('div', `dp-log-row dp-log-${level}`, text);
    this.logList.append(row);
    while (this.logList.childElementCount > MAX_LOG_ROWS) this.logList.firstChild?.remove();
    this.logList.scrollTop = this.logList.scrollHeight;
  }

  /** The RESIDUAL section's rows, newest first; a row opens its raw answer beside what was applied and refused. */
  setResidualRuns(runs: ResidualRunInfo[], cipher: CipherState | null = null, habits: { rules: string[]; through: string } | null = null): void {
    this.residualRuns = runs;
    this.renderResidual();
    this.renderCipher(cipher);
    this.renderHabits(habits);
  }

  /** HABITS: the rules in place and the reply they run through. */
  private renderHabits(h: { rules: string[]; through: string } | null): void {
    const head = el('label', 'dp-label', 'HABITS');
    if (!h) {
      this.habitsBox.replaceChildren(head, el('div', 'dp-habits-none', 'none yet'));
      return;
    }
    this.habitsBox.replaceChildren(head, ...h.rules.map((r) => el('div', 'dp-habits-rule', r)), el('div', 'dp-habits-none', `${h.rules.length === 0 ? 'nothing worn · ' : ''}through ${h.through}`));
  }

  /** CIPHER: every truth (open and out), who keeps it, and its clues, off-page ones flagged. */
  private renderCipher(c: CipherState | null): void {
    const head = el('label', 'dp-label', 'CIPHER');
    if (!c || c.truths.length === 0) {
      this.cipherBox.replaceChildren(head, el('div', 'dp-cipher-none', c ? `none yet · ${c.replies} replies` : 'none yet'));
      return;
    }
    this.cipherBox.replaceChildren(
      head,
      el('div', 'dp-cipher-none', `${c.replies} replies · last run at ${c.lastRun ?? '—'}`),
      ...c.truths.map((t) => {
        const box = el('div', `dp-cipher-truth ${t.state}`);
        box.append(
          el('div', 'dp-cipher-head', `${t.id} · ${t.kind} · ${t.state} · ${t.knownBy.join(', ') || 'nobody here'}`),
          el('div', 'dp-cipher-text', t.truth),
          el('div', 'dp-cipher-meta', `comes out when: ${t.comesOutWhen}\nchanges: ${t.changes}\nhints: ${t.clueIdeas}`),
          ...t.clues.map((k) => el('div', `dp-cipher-clue${k.onPage ? '' : ' off'}`, `${k.onPage ? '' : 'OFF PAGE '}${k.text}`)),
        );
        return box;
      }),
    );
  }

  private renderResidual(): void {
    const hhmm = (at: number) => {
      const d = new Date(at);
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };
    this.residualList.replaceChildren(
      ...this.residualRuns.map((r, i) => {
        const row = el('div', 'dp-residual-row');
        const parts = [hhmm(r.at), r.kind];
        if (r.error) parts.push(`failed: ${r.error}`);
        else {
          parts.push(`${r.applied.length} applied`);
          if (r.refused.length > 0) parts.push(`${r.refused.length} refused`);
        }
        parts.push(`${(r.ms / 1000).toFixed(1)} s`);
        const sum = el('button', 'dp-residual-sum', parts.join(' · '));
        sum.type = 'button';
        sum.addEventListener('click', () => {
          this.residualOpen = this.residualOpen === i ? null : i;
          this.renderResidual();
        });
        row.append(sum);
        if (this.residualOpen === i) {
          const detail = el('div', 'dp-residual-detail');
          detail.append(
            el('pre', 'dp-residual-raw', r.raw ?? '(no answer)'),
            el('div', 'dp-residual-lists', [...r.applied.map((a) => `+ ${a}`), ...r.refused.map((x) => `− ${x}`), ...(r.tokensIn !== null ? [`tokens ${r.tokensIn} in · ${r.tokensOut ?? '?'} out`] : [])].join('\n')),
          );
          row.append(detail);
        }
        return row;
      }),
    );
  }

  setLink(s: LinkStatus): void {
    const label = s === 'ok' ? '// LINK OK' : s === 'lost' ? '// LINK LOST' : '// LINK DOWN';
    this.linkEl.textContent = label;
    this.linkEl.dataset.status = s;
  }

  /** Her current model (`null` = not known yet). */
  setModel(m: { model: string; provider: string } | null): void {
    this.modelEl.textContent = m ? `MODEL ${m.provider} · ${m.model}` : 'MODEL —';
  }

  /** Builds a `.dp-slider-row`: a small-caps label, the range input, and a live `NN%` readout. */
  private makeSlider(cls: string, label: string, ariaLabel: string, onChange: (v: number) => void): Slider {
    const wrap = el('div', 'dp-slider-row');
    wrap.append(el('span', 'dp-slider-label', label));
    const input = el('input', cls);
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.value = '0';
    input.setAttribute('aria-label', ariaLabel);
    const valueEl = el('span', 'dp-slider-value', '0%');
    const paint = () => {
      valueEl.textContent = `${input.value}%`;
    };
    const throttled = throttle(SLIDER_THROTTLE_MS);
    const fraction = () => Number(input.value) / 100;
    input.addEventListener('input', () => {
      paint();
      if (this.applying) return;
      throttled(() => onChange(fraction()));
    });
    input.addEventListener('change', () => {
      paint();
      if (this.applying) return;
      onChange(fraction());
    });
    wrap.append(input, valueEl);
    return {
      wrap,
      input,
      setValue(v: number) {
        input.value = String(Math.round(v * 100));
        paint();
      },
    };
  }

  private syncAtmosphere(a: Atmosphere): void {
    this.ambientColor.value = a.ambient;
    this.ambientLevel.setValue(a.ambientLevel);
    this.weatherSelect.value = a.weather;
    this.weatherLevel.setValue(a.weatherLevel);
    this.fogLevel.setValue(a.fog);
  }

  private syncLights(lights: LightDef[]): void {
    const seen = new Set<string>();
    for (const light of lights) {
      seen.add(light.id);
      const row = this.lightRows.get(light.id) ?? this.buildLightRow(light);
      row.color.value = light.color;
      row.intensity.setValue(light.intensity);
      row.flicker.setValue(light.flicker);
    }
    for (const [id, row] of this.lightRows) {
      if (!seen.has(id)) {
        row.root.remove();
        this.lightRows.delete(id);
      }
    }
  }

  private buildLightRow(light: LightDef): LightRow {
    const rowEl = el('div', 'dp-light-row');
    rowEl.dataset.lightId = light.id;

    const head = el('div', 'dp-light-head');
    head.append(el('span', 'dp-light-label', light.label));

    const color = el('input', 'dp-light-color');
    color.type = 'color';
    color.setAttribute('aria-label', `${light.label} color`);
    color.addEventListener('change', () => {
      if (this.applying) return;
      this.send({ type: 'dev_action', tool: 'set_light', args: { light_id: light.id, color: color.value } });
    });
    head.append(color);

    const intensity = this.makeSlider('dp-light-intensity', 'INTENSITY', `${light.label} intensity`, (v) => {
      this.send({ type: 'dev_action', tool: 'set_light', args: { light_id: light.id, intensity: v } });
    });
    const flicker = this.makeSlider('dp-light-flicker', 'FLICKER', `${light.label} flicker`, (v) => {
      this.send({ type: 'dev_action', tool: 'set_light', args: { light_id: light.id, flicker: v } });
    });

    rowEl.append(head, intensity.wrap, flicker.wrap);
    this.lightsList.append(rowEl);
    const row: LightRow = { root: rowEl, intensity, color, flicker };
    this.lightRows.set(light.id, row);
    return row;
  }

  private renderPresets(sceneId: string): void {
    this.presetButtons.innerHTML = '';
    const scene = this.scenes.get(sceneId);
    const agentSounds = (scene?.sound?.sounds ?? []).filter((s) => s.agent);
    this.roomSoundSelect.replaceChildren(...agentSounds.map((s) => Object.assign(el('option', undefined, s.name), { value: s.name })));
    this.roomSoundRow.hidden = agentSounds.length === 0;
    if (!scene) return;
    for (const name of Object.keys(scene.presets)) {
      const btn = el('button', 'dp-preset-btn', name);
      btn.type = 'button';
      btn.addEventListener('click', () => {
        this.send({ type: 'dev_action', tool: 'apply_mood', args: { name } });
      });
      this.presetButtons.append(btn);
    }
  }

  private runSimulate(): void {
    const tool = this.simTool.value.trim();
    if (!tool) return;
    const raw = this.simArgs.value.trim() || '{}';
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(raw);
    } catch {
      this.log('error', `invalid JSON args: ${raw}`);
      return;
    }
    this.send({ type: 'dev_action', tool, args, as: 'agent' });
  }
}
