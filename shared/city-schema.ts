/**
 * The city's 3D description for the rendered map (map/city/, spec 2026-10-25 §2): district styles, structures (the
 * Ribbon), landmarks, terrain and render settings. Only the map generator reads it; the game's server never does.
 * Heights and lengths are in map px (the map is 4608×3072 at 1×); points are map %.
 */
import { z } from 'zod';
import type { Pt } from './map-schema';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a colour as #rrggbb');
const share = z.number().min(0).max(1);
const range = z.tuple([z.number().min(0), z.number().min(0)]);
const pt = z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)]);
const ID = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase letters, digits and dashes');

const districtSchema = z.object({
  /** Building heights before any boost. */
  height: range,
  /** A lot's width and depth; every streetEvery[0]th column and [1]th row is a street. */
  lot: range,
  streetEvery: z.tuple([z.number().int().min(2), z.number().int().min(2)]),
  /** The lot grid's angle (absent: a seeded angle within ±18°). */
  angleDeg: z.number().min(-90).max(90).optional(),
  /** Now and then a much taller building: height × (1 + rand⁶ · tallGain). */
  tallGain: z.number().min(0).max(5),
  brick: share,
  brokenRoof: share,
  ruin: share,
  emptyLot: share,
  setback: share,
  fireInLot: share,
  /** What survives a blackout (phase 2): a share of buildings on generators, red roof lights on the tallest, fires lit in the dark. */
  blackout: z.object({ backup: share, roofLights: z.number().int().min(0), fires: z.number().int().min(0), /** The chance a night slot is dark (phase 3; the game reads it, the renderer never). */ outage: share.optional() }).optional(),
  windowLit: share,
  windowColors: z.array(hex).min(1),
  pools: z.object({ colors: z.array(hex).min(1), count: z.number().int().min(0).max(200), power: z.number().min(0), reach: z.number().min(1), radius: z.number().min(0.1).max(20) }),
  signColors: z.array(hex).min(1),
  signShare: share,
  deepZoom: z.boolean(),
  /** Shares of blocks that get neon tracing the roof edge, a rooftop billboard and a lit marquee (the Strand,
   * 2026-10-26); blocks by a structure get the full share, the rest a third of it. */
  details: z.object({ roofNeon: share, boards: share, marquees: share }).optional(),
  /** A quarter of winding streets (Velvet, 2026-10-26): the Row (map % points), lanes wandering off it, paper lanterns
   * across them every `lanternEvery` px, and optionally a house (the Glass Orchid) with a glowing glass roof at a place. */
  streets: z
    .object({
      row: z.array(pt).min(2),
      width: z.number().min(2),
      lanes: z.object({ count: z.number().int().min(0).max(80), width: z.number().min(1), length: range }),
      lanternEvery: z.number().min(4),
      lanternColors: z.array(hex).min(1),
      /** The row houses' lit walls (absent: the district's window colours). */
      wallColors: z.array(hex).min(1).optional(),
      /** A red-light stretch: along a lane from `from` to `to` (map %), `width` map px across, the
       * lanterns are red and hung three times as close, the row houses' walls `walls`, their signs and shopfronts `colors`, and a red
       * glow washes the street. */
      redLight: z.object({ from: pt, to: pt, width: z.number().min(4), colors: z.array(hex).min(1), walls: z.array(hex).min(1) }).optional(),
      house: z.object({ near: ID, w: z.number().min(4), d: z.number().min(4), h: z.number().min(2), glass: hex }).optional(),
      /** Where the Row ends, a lantern square of this radius (map px). */
      square: z.object({ radius: z.number().min(6), /** A lantern stair from the square up to a point (map %) at height z (the Cat's scaffold). */ climb: z.object({ to: pt, z: z.number().min(0) }).optional() }).optional(),
    })
    .optional(),
  /** A rock isle (Tidal Isle, 2026-10-26; Alcatraz for reference): quay apron and cliffs at the water, slopes to a ridge,
   * buildings on pads with retaining walls, switchback roads, the QDF on the high end. Its own buildings: no block grid. */
  isle: z
    .object({
      /** The ridge along the isle's long axis (map % ends), its crest `high` at `from` (the QDF's end) to `low` at `to`. */
      ridge: z.object({ from: pt, to: pt, high: z.number().min(1), low: z.number().min(1) }),
      /** The quay apron's height and depth (map px); where noise passes `cliffShare` the apron gives out to a cliff. */
      quay: z.number().min(0),
      apron: z.number().min(0),
      cliffShare: z.number().min(-1).max(1),
      cliff: z.number().min(1),
      /** The rock step off the apron, and how deep (map px) a face runs before the slope eases. */
      ledge: z.number().min(0),
      face: z.number().min(1),
      /** Pads cut into the slope: how many, how far off the ridge, the most ground a pad may cut through. */
      pads: z.number().int().min(1),
      spread: z.number().min(1),
      maxCut: z.number().min(1),
      /** Switchback roads: each from a shore point (map %) to a point (default: the ridge), legs at ±`turn`° (60) about `leg` px. */
      roads: z.object({
        paths: z.array(z.object({ from: pt, to: pt.optional(), turn: z.number().min(10).max(85).optional(), leg: z.number().min(8).optional() })).min(1),
        leg: z.number().min(8),
      }),
      trees: z.number().int().min(0),
      qdf: z.object({ at: pt, w: z.number().min(4), d: z.number().min(4), h: z.number().min(4) }),
      stairs: z.object({ near: ID }),
      /** How far (map px) the natural shore wanders in and out of the drawn border. */
      coast: z.object({ amp: z.number().min(0) }),
    })
    .optional(),
  /** Water works (Drownworks, 2026-10-26): settling bays glowing `bayColor` in a grid at `angleDeg` (one beside place `near`,
   * the rest kept at `share`), catwalks across them, pump houses, pipe racks between, a floodwall along the coast. */
  works: z
    .object({
      near: ID,
      angleDeg: z.number().min(-90).max(90),
      bay: z.object({ w: z.number().min(10), d: z.number().min(10) }),
      gap: z.number().min(8),
      share,
      catwalks: z.number().int().min(1),
      bayColor: hex,
      /** Of the slots without a bay, the share that hold a filtration hall. */
      halls: share,
      /** Of those, the share that are a pair of round clarifier tanks instead of a hall. */
      clarifiers: share,
      /** Water towers standing on their own by the roads. */
      towers: z.number().int().min(0),
      /** Residential neighbourhoods among the works: how many, how far apart their centres (map px), and the radius of
       * slots round each that are housing. */
      neighbourhoods: z.object({ count: z.number().int().min(0), apart: z.number().min(0), radius: z.number().min(0) }),
      /** The grid broken into zones, each turned `turn` degrees (a range) off the district's angle, centres `apart` px. */
      zones: z.object({ count: z.number().int().min(1), apart: z.number().min(0), turn: range }),
      /** Piers out from the coast every `every` px, `length` long, with barges, dock cranes and floodlight masts. */
      harbour: z.object({ every: z.number().min(10), length: range }),
      /** Highways along the seams between zones: road width (map px) and the shortest seam that gets one. */
      highway: z.object({ width: z.number().min(6), min: z.number().min(0) }),
    })
    .optional(),
  /** Gone under (the Marsh, 2026-10-26): no land, the bay runs in; blocks stand in the water, drowned to `waterline`
   * behind a dark stain; the grid's streets are canals with boats and plank bridges; rooftop fires, the Drowned Choir's
   * candle rings; a broken seawall on the bay side with dead pump towers; the drowned bank at a place, in its lagoon. */
  flooded: z
    .object({
      waterline: z.number().min(0.5),
      boats: share,
      bridges: share,
      roofFires: share,
      choir: z.number().int().min(0),
      pumps: z.number().int().min(0),
      bank: z.object({ near: ID, w: z.number().min(4), d: z.number().min(4), h: z.number().min(4) }),
      /** Neighbours it shares a misty, wooded ridge with on the ground between them. */
      ridgeWith: z.array(ID).optional(),
    })
    .optional(),
  /** A city core of glass towers (Nexus): towers on plots between avenues, rising from the district's
   * `height` along the district's border to `peak` `falloff` map px in from it (a little more round the Sentinel), some stepped back at the crown, some
   * with a spire, light strips up their corners and neon round their crowns. The tower at a place with its emblem; a second
   * tower beside it (`offset` map px) with a diamond; a round plaza at the tower's foot, `gap` px in front of it, with lit
   * rings and a blue spire; drawn `squash` as deep as it is wide, so it reads as a circle on the ground at the view's tilt. Heights and sizes in map px. */
  core: z
    .object({
      /** At a place (`near`, its pin up the tower) or at a point (`at`, map %); its glass `tint`. */
      tower: z.object({ near: ID.optional(), at: pt.optional(), w: z.number().min(4), d: z.number().min(4), h: z.number().min(10), emblem: hex, tint: hex.optional(), panel: hex.optional() }),
      /** The streets' light colours (kerb lines, lamps, pools); Nexus's cold white-blue when left out. */
      streetLight: z.object({ kerb: hex, lamp: hex, glow: hex }).optional(),
      second: z.object({ offset: z.tuple([z.number(), z.number()]), w: z.number().min(4), d: z.number().min(4), h: z.number().min(10), emblem: hex, tint: hex.optional() }),
      plaza: z.object({ radius: z.number().min(6), squash: z.number().min(0.2).max(1), gap: z.number().min(0), ring: hex, spire: hex }),
      peak: z.number().min(10),
      falloff: z.number().min(50),
      fill: share,
      crowns: share,
      spires: share,
      strips: share,
      neon: z.array(hex).min(1),
      /** Quarters, each its own colour (colour by neighbourhood, not by height): `count` centres
       * scattered over the district, each plot takes its nearest's palette. A `warm` quarter is amber glass, its panes lit gold. The
       * tallest towers lean toward the quarter named `lean`. */
      quarters: z.array(z.object({ name: ID, colors: z.array(hex).min(1), warm: z.boolean().optional(), weight: z.number().min(0) })).min(1),
      quarterCount: z.number().int().min(1),
      lean: ID,
      /** A boulevard cutting across the grid through the plaza, at `angleDeg` (map degrees), `width` map px. */
      boulevard: z.object({ angleDeg: z.number().min(-90).max(90), width: z.number().min(4) }),
      /** Edges that blend into a neighbour: within `reach` map px of its border, towers take more and
       * more of its look (its window colours, brick, heights) instead of glass, with glass of the quarter named `step` between;
       * `lanterns` strings its paper lanterns over the avenues near the line (Velvet). */
      blend: z.array(z.object({ with: ID, reach: z.number().min(10), step: ID, lanterns: z.boolean().optional() })),
      /** Plots that merge with the next into one broad, heavy tower. */
      broad: share,
      /** Avenues: road width, and a streetlight every `lampEvery` map px of it, sides staggered. */
      avenue: z.object({ width: z.number().min(1), lampEvery: z.number().min(4) }),
    })
    .optional(),
  /** The grid's streets drawn as roads (map px wide), a dim lamp every `lampEvery` pieces (the Strand). */
  gridRoads: z.object({ width: z.number().min(1), lampEvery: z.number().int().min(1) }).optional(),
  /** A seafront on the district's coast (the Strand): a boardwalk along it, a Ferris wheel on a pier and
   * a long old pier with a building at its end, each from the coast nearest a place's pin. Heights and lengths in map px. */
  waterfront: z
    .object({
      boardwalk: z.object({ width: z.number().min(4), stallEvery: z.number().min(4), colors: z.array(hex).min(1) }),
      /** `pier`: how far out from the shore the wheel stands (negative: inland, over the boardwalk). */
      wheel: z.object({ near: ID, height: z.number().min(10), pier: z.number().min(-40), color: hex }),
      pier: z.object({ near: ID, length: z.number().min(10), width: z.number().min(2) }),
    })
    .optional(),
  /** A government enclave on a plateau (Mirage Heights, the Shelf, 2026-10-27): a mall `mall` px wide down the plateau's
   * long axis, the Council Chamber (`chamber` px) at its head with the spire tower beside it, ministries (`ministry`
   * px long) lining the mall, the courts across a square, a wooded park, officials' homes on a `homes.slot` grid, SDG
   * posts every `posts` px round the rim; nothing within `rim` px of the edge. Map px. */
  enclave: z
    .object({
      rim: z.number().min(0),
      mall: z.number().min(6),
      chamber: z.number().min(10),
      tower: z.object({ w: z.number().min(4), h: z.number().min(10) }),
      /** More towers round the Chamber, and the depth either side of the mall that is government offices, not homes. */
      towers: z.number().int().min(0),
      quarter: z.number().min(0),
      /** Brutalist concrete, cyberpunk dressing: slot windows lit at `slots`, neon edges and ad boards (`boards` of the
       * blocks) in `neon`. */
      slots: share,
      neon: z.array(hex).min(1),
      boards: share,
      /** Share of blocks with neon edges, and the floodlight washing every block's concrete. */
      neonShare: share,
      flood: hex,
      ministry: range,
      windows: z.array(hex).min(1),
      parkTrees: z.number().int().min(0),
      parkRadius: z.number().min(0),
      homes: z.object({ slot: z.number().min(10), size: range }),
      posts: z.number().min(20),
    })
    .optional(),
  /** A hill of old money (Cloudridge, 2026-10-27): ground rising over `falloff` px from the edge to `peak` px, higher
   * toward the north (`northTilt`), ridges at `ridgeScale`; roads winding along the slopes, joined by switchbacks,
   * `entries` ways in with gatehouses, a lamp every `lampEvery` px;
   * villas `villa` px wide every `villaEvery` px along the roads (`villaShare` of the spots), `pools` of them with a lit
   * pool, windows in `windows`; `trees` pines on the rest. Map px. */
  hill: z
    .object({
      peak: z.number().min(4),
      falloff: z.number().min(10),
      northTilt: share,
      ridgeScale: z.number().min(10),
      /** Roads: seeds `roadApart` px apart, each walking up to `roadLength` px along the slope, climbing up to `climb`
       * px per px. */
      roadApart: z.number().min(20),
      roadLength: z.number().min(20),
      climb: z.number().min(0),
      entries: z.number().int().min(0),
      road: z.number().min(2),
      lampEvery: z.number().min(4),
      villa: range,
      villaEvery: z.number().min(10),
      villaShare: share,
      pools: share,
      windows: z.array(hex).min(1),
      trees: z.number().int().min(0),
    })
    .optional(),
  /** Arcologies (Helios Towers: "primarily 5 eco super structures, though there would be surrounding
   * infrastructure"): `count` towers, the first at `first` (map %) with the golden `emblem`, footprints and heights from
   * the ranges, gold `glass`; sky gardens at every setback; skybridges between neighbours within `bridgeReach`; grounds
   * `grounds` px round each base with a ring road and service gates; utility blocks on a `utility.slot` grid between. */
  arcologies: z
    .object({
      count: z.number().int().min(1),
      first: pt,
      footprint: range,
      height: range,
      glass: z.array(hex).min(1),
      emblem: hex,
      /** The one design all five share: their plan and their crown. */
      plan: z.enum(['square', 'cross', 'octagon', 'twin']),
      crown: z.enum(['triangle', 'spire', 'ring', 'dome', 'blade']),
      angleDeg: z.number().min(-90).max(90),
      bridgeReach: z.number().min(0),
      grounds: z.number().min(0),
      utility: z.object({ slot: z.number().min(10), height: range }),
    })
    .optional(),
  /** Heavy industry (Iron Reach, 2026-10-27): steelworks (blast furnaces, stoves, casthouse glow, rolling mill),
   * refineries, gas holders, tank farms lit `cyan`, chimney pairs `chimney` px tall, pipe racks between plants within `rackReach`, pines
   * along the west edge `pines.depth` px deep. Plants are squared to `angleDeg`, at least `apart` px apart. Map px. */
  industry: z
    .object({
      angleDeg: z.number().min(-90).max(90),
      steelworks: z.number().int().min(0),
      furnace: z.number().min(10),
      /** The steelworks drawn this much bigger than life, so they read among the blocks. */
      scale: z.number().min(0.5).max(4),
      gasholders: z.number().int().min(0),
      /** Refineries: cracking columns strung with lamps, spherical tanks, a flare stack `flare` px tall burning on top. */
      refineries: z.number().int().min(0),
      flare: z.number().min(10),
      tanks: z.number().int().min(0),
      cyan: hex,
      chimneys: z.number().int().min(0),
      chimney: z.number().min(10),
      apart: z.number().min(0),
      rackReach: z.number().min(0),
      pines: z.object({ count: z.number().int().min(0), depth: z.number().min(10) }),
      /** The works between the plants: slots `slot` px with `street` px between, a lamp every `lampEvery` street
       * pieces, a floodlight over `lights` of the slots; yards' crates in `crates`. */
      grid: z.object({ slot: range, street: z.number().min(2), lampEvery: z.number().int().min(1), lights: share }),
      crates: z.array(hex).min(1),
      /** Blending into a neighbour (Dockside): the works spill `blendReach` px over the shared border onto its free
       * ground and take its look near the line; an interchange of `tracks` parallel tracks `offset` px inside the
       * shared border, trains on `trains` of them. */
      blendWith: ID.optional(),
      /** Neighbours whose blocks the works give way to near their shared border, over `edgeReach` px (Cloudridge, Helios). */
      edgeBlend: z.array(ID).optional(),
      edgeReach: z.number().min(0).optional(),
      /** A derrick tower on the wooded west edge, lit, as painted; pines thick round it within `forest` px. */
      derrick: z.object({ at: pt, height: z.number().min(10), forest: z.number().min(0) }).optional(),
      /** The truck plaza and cargo lift at the Spine's foot, where the port's road ends. */
      spineFoot: pt.optional(),
      /** The Spine's deck height there, for the cargo lift. */
      spineDeck: z.number().min(10),
      blendReach: z.number().min(0),
      interchange: z.object({ tracks: z.number().int().min(0), offset: z.number().min(0), trains: share }),
    })
    .optional(),
  /** A container port on the district's coast (Dockside, 2026-10-27): straight quays (the natural shore leaves them be),
   * ships berthed along them under red gantry cranes, a container yard behind each quay under floodlight masts, sheds
   * behind that; wide container piers out into open water; ships at anchor and tugs in the bay. Map px. */
  port: z
    .object({
      /** Quay apron depth, and the container yard's depth behind it (a range: each terminal its own). */
      quay: z.number().min(6),
      yard: range,
      /** Container yards further inland along the railway: how many, their size (map px, a range), turned up to `turn`°. */
      inlandYards: z.object({ count: z.number().int().min(0), size: range, turn: z.number().min(0).max(45) }),
      /** The railway: a trunk `offset` px in from the longest quay, a marshalling yard of `tracks` parallel tracks
       * `yardLength` long, the share of tracks with a train standing, a signal every `signalEvery` px; a branch toward
       * `branchTo` (map %) to the district's border, for a neighbour's line to carry on. */
      rail: z.object({ offset: z.number().min(40), tracks: z.number().int().min(0), yardLength: z.number().min(40), trains: share, signalEvery: z.number().min(20), branchTo: pt.optional() }),
      /** Share of the coast that is terminal (the rest is plain quay with sheds). */
      terminals: share,
      ships: z.object({ length: range, beam: range, gap: range }),
      cranes: z.object({ height: z.number().min(10), reach: z.number().min(10), every: z.number().min(10) }),
      containers: z.array(hex).min(1),
      tiers: range,
      piers: z.object({ count: z.number().int().min(0), length: range, width: z.number().min(20) }),
      /** Floodlight masts along the yard's lanes: one every `masts` px. */
      masts: z.number().min(20),
      anchored: z.number().int().min(0),
      tugs: z.number().int().min(0),
      /** Tall brick chimneys inland. */
      stacks: z.number().int().min(0),
      /** The truck road out of the port toward `toward` (map %; the Spine's foot), `width` px wide. */
      road: z.object({ toward: pt, width: z.number().min(4) }).optional(),
      /** Warehouses over the rest of the district's ground: slots `slot` px with `street` px between, squared to
       * `angleDeg`, a lamp every `lampEvery` street pieces, a pool of light over `lights` of the slots. */
      warehouses: z.object({ slot: range, street: z.number().min(2), angleDeg: z.number().min(-90).max(90), lampEvery: z.number().int().min(1), lights: share }),
    })
    .optional(),
  /** Taller, busier and less brick toward a structure (Karasu toward the Ribbon). */
  nearStructure: z
    .object({
      id: ID,
      boostStart: z.number().min(0),
      boostDistance: z.number().min(1),
      boostPower: z.number().min(0.1),
      boostGain: z.number().min(0),
      litGain: z.number().min(0),
      brickNear: share,
      setbackNear: share,
      signShareNear: share,
      /** Height scale away from the structure (Old Town is low). */
      farScale: z.number().min(0.1).max(2),
    })
    .optional(),
});

const tier = z.object({ share, depth: range, height: range });
/** One end of the delta. `fork`: channels splitting outward; `comb`: ribs peeling off along the last stretch; `fan`
 * (the Strand): long lit boulevards spreading from the very end, each stopping at the coast or where it
 * leaves `within`'s border. */
const deltaEnd = z.object({
  branches: z.number().int().min(0).max(12),
  length: range,
  spread: z.number().min(0).max(270),
  turn: z.number().min(-180).max(180).optional(),
  style: z.enum(['fork', 'comb', 'fan']).optional(),
  along: z.number().int().min(1).optional(),
  within: ID.optional(),
  /** A fan's boulevard width (map px). */
  width: z.number().min(4).optional(),
  /** A fan's boulevards swing this share of the way toward the fan's middle as they go (0: straight spokes). */
  bend: z.number().min(0).max(1).optional(),
  /** Branches tried off each of a fan's boulevards (one that would run into another road is dropped). */
  offshoots: z.number().int().min(0).max(6).optional(),
});
const structureSchema = z.object({
  id: ID,
  kind: z.literal('canyon'),
  route: z.array(pt).min(2),
  /** Levels at the route's start and end (tapering between). */
  levels: z.tuple([z.number().int().min(1).max(12), z.number().int().min(1).max(12)]),
  levelHeight: z.number().min(1),
  gap: z.number().min(2),
  depth: z.number().min(2),
  resample: z.number().min(1),
  stackJitter: z.tuple([z.number(), z.number()]),
  towerShare: share,
  towerLevels: z.number().int().min(0),
  brickShare: share,
  tiers: z.object({ first: tier, second: tier }),
  details: z.object({
    stairs: share,
    cables: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
    cableSag: range,
    laundry: share,
    laundryBelowLevel: z.number().int().min(1),
    pipes: share,
    aircon: share,
    ceilings: share,
    girders: share,
    bridges: share,
    bridgeFromLevel: z.number().int().min(1),
    shacks: share,
    billboards: share,
    hangingSigns: share,
    shopfrontBase: share,
    shopfrontPerLevel: share,
  }),
  darkness: z.object({ levels: z.number().min(0), density: z.number().min(0) }),
  gapLights: z.object({ every: z.number().int().min(1), base: z.number().min(0), perLevel: z.number().min(0), gain: z.number().min(0) }),
  wallColors: z.array(hex).min(1),
  shopColors: z.array(hex).min(1),
  /** Both ends fanning out into smaller canyons (a river's delta): how many, how long, how widely spread and which way the fan turns (degrees; + is clockwise on the map). */
  delta: z
    .object({
      start: z.union([deltaEnd, z.array(deltaEnd).min(1)]),
      /** One style, or several together (the Strand: the comb's ribs along the tail and the fan from the very end). */
      end: z.union([deltaEnd, z.array(deltaEnd).min(1)]),
    })
    .optional(),
});

/** The Spine (spec 2026-10-25, Spine pass): a superhighway on enormous pylons, people living in the pylons and in habs hung
 * under the deck. Heights in map px; the route in map %. */
const spineSchema = z.object({
  id: ID,
  kind: z.literal('spine'),
  route: z.array(pt).min(2),
  deckHeight: z.number().min(10),
  deckWidth: z.number().min(4),
  pylonEvery: z.number().min(10),
  pylon: z.object({ w: z.number().min(1), d: z.number().min(1) }),
  /** One hab ring's height: a place's level on the Spine is its ring. */
  ringHeight: z.number().min(1),
  landmark: z.object({ place: ID, name: z.string(), w: z.number().min(1), d: z.number().min(1) }).optional(),
  hangers: share,
  market: z.object({ place: ID, radius: z.number().min(1) }).optional(),
  haulerStop: z.object({ place: ID }).optional(),
  catwalk: z.object({ place: ID, side: z.union([z.literal(1), z.literal(-1)]) }).optional(),
  lampEvery: z.number().min(4),
  /** Half-width of the 8× corridor around the deck (map px). */
  corridor: z.number().min(0),
  /** How far under the deck the city's roofs must stay (map px). */
  underClearance: z.number().min(0),
});

const anchor = z.union([pt, z.object({ place: ID })]);
const landmarkSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('tower-sign'), at: anchor, height: z.number().min(1), shape: z.enum(['cat', 'planet']), color: hex, besideStructure: z.boolean().optional(), size: z.number().min(0.2).max(5).optional(), strength: z.number().min(1).optional(), /** On the cliff face, as the rooms show it: `height` is then the sign's own height, seated, on scaffolding. */ onCliff: z.boolean().optional() }),
  z.object({ kind: z.literal('freight-lift'), at: z.object({ place: ID }), carLevel: z.number().int().min(1) }),
  z.object({ kind: z.literal('wall-sign'), at: z.object({ place: ID }), level: z.number().int().min(1), shape: z.literal('bowl'), color: hex }),
]);

const terrainSchema = z.object({
  plateau: ID,
  height: z.number().min(1),
  risesFrom: z.array(ID).min(1),
  faceStart: share,
  faceJitter: share,
  faceWidth: z.number().min(0.01).max(1),
  crags: z.number().min(0),
  gridStep: z.number().min(1),
  forest: z.number().min(-1).max(1),
  stair: z.boolean(),
  funicular: z.boolean(),
  shacks: z.number().int().min(0),
  /** A lit balustrade along the cliff top (the Shelf). */
  shelf: z.boolean().optional(),
});

const rgb = z.tuple([z.number(), z.number(), z.number()]);
const renderSchema = z.object({
  /** How far (map px) a coast's natural shore wanders out into the water (default 14). */
  shore: z.number().min(0).optional(),
  elevDeg: z.number().min(10).max(89),
  tile: z.number().int().min(64),
  margin: z.number().int().min(0),
  levels: z.array(z.number().int().min(1)).min(1),
  webpQuality: z.number().int().min(1).max(100),
  samples: z.number().int().min(1),
  sky: z.object({ color: hex, strength: z.number().min(0) }),
  moon: z.object({ energy: z.number().min(0), rotation: rgb }),
  rim: z.object({ energy: z.number().min(0), rotation: rgb }),
  fog: z.object({ density: z.number().min(0), color: hex, height: z.number().min(0) }),
  grade: z.object({
    exposure: z.number(),
    look: z.string(),
    bloom: z.object({ threshold: z.number(), size: z.number(), strength: z.number() }),
    lift: rgb,
    gain: rgb,
    contrast: z.number(),
  }),
  wet: z.object({ roofRoughMin: share, puddleRough: z.tuple([share, share]) }),
  blender: z.string(),
});

export type DistrictStyle = z.infer<typeof districtSchema>;
export type SpineStructure = Omit<z.infer<typeof spineSchema>, 'route'> & { route: Pt[] };
export type RibbonStructure = Omit<z.infer<typeof structureSchema>, 'route'> & { route: Pt[] };
export type Landmark = z.infer<typeof landmarkSchema>;
export type Terrain = z.infer<typeof terrainSchema>;
export type RenderSettings = z.infer<typeof renderSchema>;

const SCHEMAS = {
  district: districtSchema,
  structure: z.discriminatedUnion('kind', [structureSchema, spineSchema]),
  landmarks: z.array(landmarkSchema),
  terrain: terrainSchema,
  render: renderSchema,
} as const;
export type CityFileKind = keyof typeof SCHEMAS;

/** One file of map/city/ checked against its kind's schema. */
export function parseCityFile(kind: CityFileKind, raw: unknown): { ok: true; value: unknown } | { ok: false; errors: { path: string; message: string }[] } {
  const r = SCHEMAS[kind].safeParse(raw);
  return r.success ? { ok: true, value: r.data } : { ok: false, errors: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) };
}
