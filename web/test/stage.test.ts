import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Stage, outfitFor, type FigureSource } from '../src/ui/stage';

let stages: Stage[] = [];
afterEach(() => {
  for (const s of stages) s.dispose();
  stages = [];
});
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(ok: (url: string) => boolean = () => true, aspect = 2 / 3) {
  document.body.innerHTML = '<div id="stage-figures"></div>';
  const root = document.getElementById('stage-figures')!;
  const stage = new Stage(root, { probe: async (url) => (ok(url) ? { aspect } : null) });
  stages.push(stage);
  return { root, stage };
}
const sprite = (url: string): FigureSource => ({ kind: 'sprite', url, crop: { top: 0, bottom: 0.5 } });
const left = (root: HTMLElement) => root.querySelector<HTMLElement>('.stage-left')!;
const right = (root: HTMLElement) => root.querySelector<HTMLElement>('.stage-right')!;

describe('Stage', () => {
  it('draws both figures from their sprites, sized by the crop', async () => {
    const { root, stage } = setup();
    stage.setLeft([sprite('/api/persona/sprite')], 'Hicks', '#7fe9ff');
    stage.setRight([sprite('/api/agents/nix/sprite')], 'Nix', '#ff4f8b');
    await flush();
    const art = right(root).querySelector<HTMLElement>('.stage-art')!;
    expect(art.style.backgroundImage).toContain('/api/agents/nix/sprite');
    expect(right(root).dataset.kind).toBe('sprite');
    expect(Number(right(root).style.getPropertyValue('--fig-w'))).toBeCloseTo(4 / 3);
    expect(Number(right(root).style.getPropertyValue('--fig-bh'))).toBeCloseTo(2);
    expect(right(root).getAttribute('aria-label')).toBe('Nix');
    expect(left(root).getAttribute('aria-label')).toBe('Hicks');
    expect(right(root).style.getPropertyValue('--fig-accent')).toBe('#ff4f8b');
  });

  it('a snapped sprite (pixel) draws with hard pixels, on its own side only; a smooth one after it clears it', async () => {
    const { root, stage } = setup();
    stage.setRight([{ ...sprite('/nix'), pixel: true } as FigureSource], 'Nix', '#fff');
    stage.setLeft([sprite('/me')], 'Me', '#fff');
    await flush();
    expect(right(root).dataset.pixel).toBe('');
    expect(left(root).dataset.pixel).toBeUndefined();
    stage.setRight([sprite('/cass')], 'Cass', '#fff');
    await flush();
    expect(right(root).dataset.pixel).toBeUndefined();
  });

  it("a sprite's height sets the figure's --fig-height; a fallback stands at full height", async () => {
    const { root, stage } = setup((url) => url !== '/missing');
    stage.setRight([{ ...sprite('/ember'), height: 0.86 } as FigureSource], 'Ember', '#fff');
    stage.setLeft([sprite('/hicks')], 'Hicks', '#fff');
    await flush();
    expect(right(root).style.getPropertyValue('--fig-height')).toBe('0.86');
    expect(left(root).style.getPropertyValue('--fig-height')).toBe('1');
    stage.setRight([{ ...sprite('/missing'), height: 0.86 } as FigureSource, { kind: 'monogram', letter: 'E' }], 'Ember', '#fff');
    await flush();
    expect(right(root).style.getPropertyValue('--fig-height')).toBe('1');
  });

  it('marks the speaker and changes nothing else: no lit, dimmed or streaming look', async () => {
    const { root, stage } = setup();
    stage.setLeft([sprite('/a')], 'Hicks', '#fff');
    stage.setRight([sprite('/b')], 'Nix', '#fff');
    stage.setSpeaker('right');
    expect(right(root).classList.contains('speaking')).toBe(true);
    expect(left(root).classList.contains('speaking')).toBe(false);
    for (const f of [left(root), right(root)]) for (const c of ['lit', 'dimmed', 'streaming']) expect(f.classList.contains(c)).toBe(false);
    stage.setSpeaker('left');
    expect(left(root).classList.contains('speaking')).toBe(true);
    expect(right(root).classList.contains('speaking')).toBe(false);
  });

  it('falls back down the chain when a sprite fails to load (Review Focus 5)', async () => {
    const { root, stage } = setup((url) => !url.includes('sprite'));
    stage.setRight([sprite('/api/agents/nix/sprite'), { kind: 'portrait', url: '/api/agents/nix/avatar' }, { kind: 'monogram', letter: 'N' }], 'Nix', '#ff4f8b');
    await flush();
    await flush();
    expect(right(root).dataset.kind).toBe('portrait');
  });

  it('monogram and silhouette need no image', async () => {
    const { root, stage } = setup(() => false);
    stage.setRight([sprite('/x'), { kind: 'monogram', letter: 'N' }], 'Nix', '#fff');
    stage.setLeft([{ kind: 'silhouette' }], 'YOU', '#fff');
    await flush();
    await flush();
    expect(right(root).dataset.kind).toBe('monogram');
    expect(right(root).querySelector('.stage-art')!.textContent).toBe('N');
    expect(left(root).dataset.kind).toBe('silhouette');
  });

  it("a sprite that isn't 2:3 keeps its own proportions, also after a live re-crop (Review Focus 4)", async () => {
    const { root, stage } = setup(() => true, 1);
    stage.setRight([sprite('/square')], 'Nix', '#fff');
    await flush();
    const fig = right(root);
    expect(Number(fig.style.getPropertyValue('--fig-bw'))).toBeCloseTo(2); // square: width = height = 2
    expect(Number(fig.style.getPropertyValue('--fig-bh'))).toBeCloseTo(2);
    stage.setCrop('right', { top: 0, bottom: 0.25 });
    expect(Number(fig.style.getPropertyValue('--fig-bw'))).toBeCloseTo(4);
    expect(Number(fig.style.getPropertyValue('--fig-bh'))).toBeCloseTo(4);
  });

  it('setCrop re-sizes a figure live', async () => {
    const { root, stage } = setup();
    stage.setRight([sprite('/b')], 'Nix', '#fff');
    await flush();
    stage.setCrop('right', { top: 0, bottom: 1 });
    expect(Number(right(root).style.getPropertyValue('--fig-bh'))).toBeCloseTo(1);
  });
  describe('expressions', () => {
    const withFaces = (faces: Record<string, string>): FigureSource => ({ kind: 'sprite', url: '/s.png', crop: { top: 0, bottom: 0.5 }, expressions: faces });
    const art = (root: HTMLElement) => right(root).querySelector<HTMLElement>('.stage-art')!;
    const settle = async () => {
      for (let i = 0; i < 4; i++) await flush();
    };

    it('setExpression swaps the art to that face, keeping the crop; null goes back to the sprite', async () => {
      const { root, stage } = setup();
      stage.setRight([withFaces({ happy: '/h.png' })], 'Nix', '#fff');
      await settle();
      const w = right(root).style.getPropertyValue('--fig-w');
      const by = right(root).style.getPropertyValue('--fig-by');
      stage.setExpression('right', 'happy');
      expect(art(root).style.backgroundImage).toContain('/h.png');
      expect(right(root).style.getPropertyValue('--fig-w')).toBe(w);
      expect(right(root).style.getPropertyValue('--fig-by')).toBe(by);
      stage.setExpression('right', null);
      expect(art(root).style.backgroundImage).toContain('/s.png');
    });

    it('a name she no longer has shows the plain sprite (Review Focus 4)', async () => {
      const { root, stage } = setup();
      stage.setRight([withFaces({ happy: '/h.png' })], 'Nix', '#fff');
      await settle();
      stage.setExpression('right', 'smug');
      expect(art(root).style.backgroundImage).toContain('/s.png');
    });

    it('a face whose image fails to load is dropped: asking for it shows the sprite', async () => {
      const { root, stage } = setup((url) => url !== '/h.png');
      stage.setRight([withFaces({ happy: '/h.png', sad: '/sad.png' })], 'Nix', '#fff');
      await settle();
      stage.setExpression('right', 'happy');
      expect(art(root).style.backgroundImage).toContain('/s.png');
      stage.setExpression('right', 'sad');
      expect(art(root).style.backgroundImage).toContain('/sad.png');
    });

    it('a face asked for before the figure resolves shows once it does', async () => {
      const { root, stage } = setup();
      stage.setRight([withFaces({ happy: '/h.png' })], 'Nix', '#fff');
      stage.setExpression('right', 'happy');
      await settle();
      expect(art(root).style.backgroundImage).toContain('/h.png');
    });

    it('a portrait figure ignores setExpression', async () => {
      const { root, stage } = setup((url) => url !== '/s.png');
      stage.setRight([withFaces({ happy: '/h.png' }), { kind: 'portrait', url: '/p.png' }], 'Nix', '#fff');
      await settle();
      stage.setExpression('right', 'happy');
      expect(right(root).dataset.kind).toBe('portrait');
      expect(art(root).style.backgroundImage).toBe('');
    });
  });
  describe('outfits', () => {
    const dressed = (outfits: Record<string, string>, faces: Record<string, string> = { happy: '/e/happy' }): FigureSource => ({
      kind: 'sprite',
      url: '/s.png',
      crop: { top: 0, bottom: 0.5 },
      expressions: faces,
      outfits,
    });
    const bg = (root: HTMLElement) => right(root).querySelector<HTMLElement>('.stage-art')!.style.backgroundImage;
    const settle = async () => {
      for (let i = 0; i < 4; i++) await flush();
    };

    it('setOutfit swaps the base layer and keeps the crop', async () => {
      const { root, stage } = setup();
      stage.setRight([dressed({ indoors: '/o/indoors' })], 'Nix', '#fff');
      await settle();
      const bh = right(root).style.getPropertyValue('--fig-bh');
      stage.setOutfit('right', 'indoors');
      expect(bg(root)).toContain('/o/indoors');
      expect(bg(root)).not.toContain('/s.png');
      expect(right(root).style.getPropertyValue('--fig-bh')).toBe(bh);
    });

    it('an expression stacks over the current outfit, face first', async () => {
      const { root, stage } = setup();
      stage.setRight([dressed({ indoors: '/o/indoors' })], 'Nix', '#fff');
      await settle();
      stage.setOutfit('right', 'indoors');
      stage.setExpression('right', 'happy');
      expect(bg(root)).toBe('url("/e/happy"), url("/o/indoors")');
      stage.setExpression('right', null);
      expect(bg(root)).toBe('url("/o/indoors")');
    });

    it('setOutfit(null) and an unknown outfit show the sprite, keeping the face', async () => {
      const { root, stage } = setup();
      stage.setRight([dressed({ indoors: '/o/indoors' })], 'Nix', '#fff');
      await settle();
      stage.setExpression('right', 'happy');
      stage.setOutfit('right', 'indoors');
      stage.setOutfit('right', null);
      expect(bg(root)).toBe('url("/e/happy"), url("/s.png")');
      stage.setOutfit('right', 'gala');
      expect(bg(root)).toBe('url("/e/happy"), url("/s.png")');
    });

    it('an outfit whose image fails to load shows the sprite', async () => {
      const { root, stage } = setup((url) => url !== '/o/indoors');
      stage.setRight([dressed({ indoors: '/o/indoors' })], 'Nix', '#fff');
      await settle();
      stage.setOutfit('right', 'indoors');
      expect(bg(root)).toBe('url("/s.png")');
    });

    it('outfit and face both failing show the plain sprite alone', async () => {
      const { root, stage } = setup((url) => url === '/s.png');
      stage.setRight([dressed({ indoors: '/o/indoors' })], 'Nix', '#fff');
      await settle();
      stage.setOutfit('right', 'indoors');
      stage.setExpression('right', 'happy');
      expect(bg(root)).toBe('url("/s.png")');
    });

    it('setOutfit before the figure resolves applies once it does', async () => {
      const { root, stage } = setup();
      stage.setRight([dressed({ indoors: '/o/indoors' })], 'Nix', '#fff');
      stage.setOutfit('right', 'indoors');
      await settle();
      expect(bg(root)).toBe('url("/o/indoors")');
    });

    it('the last setOutfit wins over an earlier outfit that loads late', async () => {
      document.body.innerHTML = '<div id="stage-figures"></div>';
      const root = document.getElementById('stage-figures')!;
      let releaseA: () => void = () => {};
      const stage = new Stage(root, {
        probe: (url) =>
          url === '/o/a' ? new Promise((r) => (releaseA = () => r({ aspect: 2 / 3 }))) : Promise.resolve({ aspect: 2 / 3 }),
      });
      stages.push(stage);
      stage.setRight([dressed({ a: '/o/a', b: '/o/b' })], 'Nix', '#fff');
      stage.setOutfit('right', 'a');
      stage.setOutfit('right', 'b');
      await settle();
      releaseA();
      await settle();
      expect(bg(root)).toBe('url("/o/b")');
    });

    it('the first paint waits for the wanted outfit instead of flashing the sprite (load, reconnect)', async () => {
      document.body.innerHTML = '<div id="stage-figures"></div>';
      const root = document.getElementById('stage-figures')!;
      let release: () => void = () => {};
      const stage = new Stage(root, {
        probe: (url) =>
          url === '/o/indoors' ? new Promise((r) => (release = () => r({ aspect: 2 / 3 }))) : Promise.resolve({ aspect: 2 / 3 }),
      });
      stages.push(stage);
      stage.setRight([dressed({ indoors: '/o/indoors' })], 'Nix', '#fff');
      stage.setOutfit('right', 'indoors');
      await settle();
      expect(bg(root)).not.toContain('/s.png');
      release();
      await settle();
      expect(bg(root)).toBe('url("/o/indoors")');
    });

    it('a new figure without outfits ignores a stale outfit name', async () => {
      const { root, stage } = setup();
      stage.setRight([dressed({ indoors: '/o/indoors' })], 'Nix', '#fff');
      await settle();
      stage.setOutfit('right', 'indoors');
      stage.setRight([sprite('/cass.png')], 'Cass', '#fff');
      await settle();
      expect(bg(root)).toBe('url("/cass.png")');
    });

    it('outfitFor maps a scene, and gives null for an unmapped scene, no map or no scene', () => {
      const map = { 'lowlight-intake': 'indoors' };
      expect(outfitFor(map, 'lowlight-intake')).toBe('indoors');
      expect(outfitFor(map, 'noodle-stall')).toBeNull();
      expect(outfitFor(undefined, 'lowlight-intake')).toBeNull();
      expect(outfitFor(map, null)).toBeNull();
      expect(outfitFor(map, 'constructor')).toBeNull();
    });
  });
});

describe('Stage: no centre figure (the others are in the who\'s-here strip)', () => {
  it('each figure has its art and its own light filter, which sprite art uses', () => {
    const { root } = setup();
    const ids = [left(root), right(root)].map((f) => {
      expect([...f.children].map((c) => c.getAttribute('class'))).toEqual(['stage-art', 'stage-light-fx']);
      const filter = f.querySelector('filter')!;
      expect(f.style.getPropertyValue('--fig-filter')).toBe(`url(#${filter.id})`);
      return filter.id;
    });
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("the light is cut by her own drawn pixels, not a separate mask (no pale fringe past her edge at any window size)", () => {
    const { root } = setup();
    const filter = right(root).querySelector('filter')!;
    const last = filter.lastElementChild!;
    expect(last.tagName).toBe('feComposite');
    expect(last.getAttribute('operator')).toBe('in');
    expect(last.getAttribute('in2')).toBe('SourceGraphic');
    const floods = [...filter.querySelectorAll('feFlood')].map((f) => f.getAttribute('style'));
    expect(floods).toEqual(['flood-color: var(--light-l)', 'flood-color: var(--light-r)', 'flood-color: var(--glow-l)', 'flood-color: var(--glow-r)']);
    const css = readFileSync(path.resolve('web/src/ui/style.css'), 'utf8');
    expect(css).toMatch(/\.stage-figure\[data-kind='sprite'\] \.stage-art \{ filter: var\(--fig-filter, none\); \}/);
    expect(css).not.toMatch(/mask-image: var\(--fig-mask/);
  });

  it('has only the two side figures', () => {
    const { root } = setup();
    expect(root.querySelector('.stage-centre')).toBeNull();
    expect(root.querySelectorAll('.stage-figure')).toHaveLength(2);
  });

  it('null marks neither side (someone else here is speaking)', () => {
    const { root, stage } = setup();
    stage.setSpeaker(null);
    expect(root.querySelectorAll('.stage-figure.speaking')).toHaveLength(0);
  });
});
