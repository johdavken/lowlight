// The generated city, as data for the Blender render (spec 2026-10-25 §3). Everything is in map px (the map is
// 4608×3072 at 1×): x, y on the ground (y down, as the map's), z up. Blender stretches y by 1/sin(ELEV) itself.

/** A box standing on the ground or on something (z0): a building, a stack, a shack, a ruined wall. */
export interface Box {
  /** Footprint centre. */
  x: number;
  y: number;
  /** Along the angle, and across it. */
  w: number;
  d: number;
  h: number;
  z0: number;
  /** Radians. */
  a: number;
  /** Its lit windows' colour. */
  tint: string;
  /** Share of its windows lit (0: none, a ruin). */
  lit: number;
  brick: 0 | 1;
  /** Picks which of its windows are lit. */
  seed: number;
  district: string;
  kind: 'building' | 'wall' | 'stack' | 'tier' | 'shack' | 'bridge' | 'tower' | 'car' | 'pylon';
  /** 1: a glass curtain wall (the core's towers): dark glass, close-set lit panes, a faint glow in its tint. */
  glass?: 1;
  /** 1: raw concrete (the Shelf's brutalism): pale, mottled, matte. */
  concrete?: 1;
  /** On a generator (blackouts phase 2): its windows keep this share of their light when the grid is down. */
  backup?: number;
}

/**
 * Who powers a light (blackouts phase 2): absent is the grid (out in a blackout); `own` burns either way (fires,
 * candles); `emergency` shows only when the grid is down (roof lights, fires lit in the dark, landmark generators).
 */
export type Supply = 'own' | 'emergency';
/** A generator building's windows in a blackout. */
export const BACKUP = 0.35;
/** A landmark that keeps running (the pumps, the Sentinel). */
export const LANDMARK_BACKUP = 0.5;
/** A landmark's generator light (add x, y, z). */
export const EMERGENCY_LIGHT = { color: '#ffb347', power: 40000, radius: 2, reach: 50, supply: 'emergency' } as const;

export type PropKind = 'tank' | 'ac' | 'mast' | 'rubble' | 'barrel' | 'sign' | 'pine' | 'scree' | 'pylon' | 'lamp' | 'laundry' | 'fan' | 'lattice' | 'shopfront' | 'hanging-sign' | 'billboard' | 'board-frame' | 'ring' | 'clarifier' | 'clarifier-mid' | 'clarifier-edge' | 'crag' | 'container';
/** Small things: roof clutter, rubble, trees, lamps, signs. Glowing kinds carry a colour. */
export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  z0: number;
  w: number;
  d: number;
  h: number;
  a: number;
  color?: string;
  /** Whose power it is on (blackouts): filled at the end of generate() where missing. */
  district?: string;
  supply?: Supply;
}

/** A point light: a pool over a district, a lamp in the Ribbon's gap, a fire. */
export interface Light {
  x: number;
  y: number;
  z: number;
  color: string;
  power: number;
  radius: number;
  /** Cut-off distance (map px): the light stops here. */
  reach: number;
  supply?: Supply;
}

export type StripMaterial = 'walkway' | 'rail' | 'soffit' | 'girder' | 'slab' | 'pipe' | 'floor' | 'stair' | 'road' | 'trail-red' | 'trail-white' | 'street-light' | 'car-red' | 'car-white' | 'concrete' | 'street' | 'bay' | 'bay-dim' | 'bay-mid' | 'bay-edge' | 'bay-out' | 'bay-in' | 'sludge' | 'crane';
/** A flat slab or bar: walkways, rails, girders, roads. A stair runs between its two `ends`. */
export interface Strip {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  z0: number;
  a: number;
  material: StripMaterial;
  ends?: [[number, number, number], [number, number, number]];
  color?: string;
  district?: string;
}

/** A tube along points: cables, neon sign outlines. */
export interface Curve {
  points: [number, number, number][];
  bevel: number;
  material: 'cable' | 'neon';
  color?: string;
  /** A neon's emission (default 38): big neon dims so its bloom stays inside a tile's margin. */
  strength?: number;
  district?: string;
}

/** A volume: the darkness over the Ribbon's low levels. */
export interface Volume {
  kind: 'canyon-dark' | 'mist';
  /** The volume's outline on the ground (map px), closed. */
  outline: [number, number][];
  z0: number;
  z1: number;
  density: number;
}

/** The ground's height on a grid (map px), for the climb to Mirage Heights. */
export interface TerrainGrid {
  x0: number;
  y0: number;
  step: number;
  cols: number;
  rows: number;
  /** Row by row; below 0: no ground here (a district's flat floor). */
  heights: number[];
}

export interface Geometry {
  buildings: Box[];
  props: Prop[];
  lights: Light[];
  strips: Strip[];
  curves: Curve[];
  terrain: TerrainGrid | null;
  /** More heightfields on the same cliff mesh: isles raised out of the bay (Tidal Isle), each with its district's id;
   * `forest` ones (Cloudridge's hill) take a dark wooded floor instead of moonlit rock. */
  islands: (TerrainGrid & { id: string; forest?: 1 })[];
  /** Land: each district's border (map px); everything else is water (the bay, every coast). */
  land: [number, number][][];
  /** Each land polygon's district id, parallel to `land`. */
  landDistricts: string[];
  /** The blackout mask's district table (map px borders): index i+1 in the mask is districts[i]; 0 is none.
   * The bordered districts in map order, then 'spine' and 'ribbon' (their own power, never blacked out in phase 1). */
  districts: { id: string; border: [number, number][] }[];
  /** The mask pass's floor under water and the gaps: rows [row, firstCol, lastCol, index] (mask-floor.ts). */
  maskFloor: { step: number; runs: [number, number, number, number][] } | null;
  /** The land between districts (streets, the Spine's strip): rows of grid cells [row, firstCol, lastCol] at `step` map px. */
  landFill: { step: number; runs: [number, number, number][] } | null;
  volumes: Volume[];
  /** Map px up, for places on a structure. */
  pinHeights: Record<string, number>;
}

export const emptyGeometry = (): Geometry => ({ buildings: [], props: [], lights: [], strips: [], curves: [], terrain: null, islands: [], volumes: [], pinHeights: {}, land: [], landDistricts: [], districts: [], maskFloor: null, landFill: null });
