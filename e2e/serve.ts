import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../server/src/app';
import type { Config } from '../server/src/config';
import { buildWeb } from './build-once';
import { DIRECT, GOOD_KEY, SECOND } from './fixtures';
import { BUG_RELAY_PORT, STUB_OR_LOG_PORT, gamePort } from './ports';
import { startFakeOpenRouter } from './fake-openrouter';
import { PNG } from 'pngjs';
import { BIG, CHAIR, JOB, MISSION, READY, WAITS } from '../shared/quests.fixture';

/**
 * Two test rooms in Nix's pack, independent of which of her real rooms are flat: `zz-flat-test`
 * (1536×864: a lamp with dust, a screen, lightning in two window shapes with a 20 px post between them at x 1090–1110, weather hidden) and `zz-legacy-test` (a 480 copy of
 * the default Workspace), and `zz-songs-a` / `zz-songs-b` (Workspace copies sharing two 3 s tones).
 */
function writeTestRooms(packDir: string): void {
  const flat = path.join(packDir, 'zz-flat-test');
  fs.mkdirSync(flat, { recursive: true });
  const [W, H] = [1536, 864];
  const room = new PNG({ width: W, height: H });
  const glow = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const lamp = x >= 200 && x < 260 && y >= 200 && y < 260;
      const screen = x >= 660 && x < 740 && y >= 270 && y < 330;
      room.data.set(lamp ? [255, 150, 60, 255] : screen ? [40, 200, 230, 255] : [40, 24, 64, 255], o);
      if (lamp) glow.data.set([255, 150, 60, 255], o);
    }
  }
  fs.writeFileSync(path.join(flat, 'room.png'), PNG.sync.write(room));
  fs.writeFileSync(path.join(flat, 'room_e_lamp.png'), PNG.sync.write(glow));
  fs.mkdirSync(path.join(flat, 'sound', 'keep'), { recursive: true });
  // A CC0 cue (public: the public repo has no restricted sounds to borrow).
  fs.copyFileSync('web/public/sound/mission/tick.ogg', path.join(flat, 'sound', 'keep', 'kettle.ogg'));
  fs.writeFileSync(
    path.join(flat, 'scene.json'),
    JSON.stringify({
      id: 'zz-flat-test',
      name: 'Flat Test',
      description: 'A flat e2e room.',
      resolution: [W, H],
      layers: [{ id: 'room', src: 'room.png', parallax: 0, emissiveLights: { lamp: 'room_e_lamp.png' } }],
      lights: [
        { id: 'lamp', label: 'lamp', pos: [230, 230], color: '#ff963c', intensity: 0.7, radius: 350, flicker: 0, dust: true },
        { id: 'screens', label: 'screens', pos: [700, 300], color: '#7fe9ff', intensity: 0.4, radius: 200, flicker: 0 },
      ],
      weatherHidden: true,
      // A sound the agent can play (the room-sounds e2e plays it from the dev panel).
      sound: { indoor: true, sounds: [{ name: 'kettle', src: 'sound/keep/kettle.ogg', agent: { about: 'a test kettle clicking off' } }] },
      effects: [
        { kind: 'screen', rect: [660, 270, 80, 60], light: 'screens', scroll: 10 },
        { kind: 'lightning' },
      ],
      weatherArea: [
        [[1000, 100], [1090, 100], [1090, 300], [1000, 300]],
        [[1110, 100], [1200, 100], [1200, 300], [1110, 300]],
      ],
      defaults: { ambient: '#1a1030', ambientLevel: 0.35, weather: 'rain', weatherLevel: 0.6, fog: 0.2, timeOfDay: 'night' },
      presets: {},
    }),
  );
  // Two short tones in the pack's _music, and two rooms sharing them (songs: shuffle, pause, carry on).
  fs.mkdirSync(path.join(packDir, '_music'), { recursive: true });
  for (const [name, freq] of [['zz-tone-a.ogg', 330], ['zz-tone-b.ogg', 440]] as const) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=3`, '-af', 'volume=-20dB', '-c:a', 'libopus', '-b:a', '64k', '-ar', '48000', '-ac', '2', path.join(packDir, '_music', name)]);
  }
  for (const [id, songs] of [['zz-songs-a', ['zz-tone-a.ogg', 'zz-tone-b.ogg']], ['zz-songs-b', ['zz-tone-b.ogg', 'zz-tone-a.ogg']]] as const) {
    const dir = path.join(packDir, id);
    fs.cpSync('./scenes/default/workspace', dir, { recursive: true });
    const def = JSON.parse(fs.readFileSync(path.join(dir, 'scene.json'), 'utf8')) as { sound?: Record<string, unknown> };
    fs.writeFileSync(path.join(dir, 'scene.json'), JSON.stringify({ ...def, id, name: id, sound: { ...def.sound, music: { songs } } }));
  }
  const legacy = path.join(packDir, 'zz-legacy-test');
  fs.cpSync('./scenes/default/workspace', legacy, { recursive: true });
  const def = JSON.parse(fs.readFileSync(path.join(legacy, 'scene.json'), 'utf8')) as { id: string; name: string };
  fs.writeFileSync(path.join(legacy, 'scene.json'), JSON.stringify({ ...def, id: 'zz-legacy-test', name: 'Legacy Test' }));
}

/** This server's slot's port (E2E_SLOT, from e2e/serve-all.ts; 0 when run on its own). */
const PORT = gamePort();
const TOKEN = 'e2e-smoke-test-token-0000';

export { E2E_ENCOUNTERS, E2E_OPENING, E2E_SUGGESTION } from './fake-openrouter';
/** The one gig brief e2e/direct's gig test runs. */
export const E2E_GIG = { title: 'E2E Line', text: 'Make the line go away before the audit.' };
/** The slip e2e/direct's slip test runs: medium, at The Tilt beside the hack (Glass Orchid is in another district's panel). */
export const E2E_SLIP = { title: 'E2E Floor', text: 'In, lift, out.' };

async function main(): Promise<void> {
  // In this process, not `npm run build && ...` through a shell, so the server stays one process
  // tree Playwright can signal. serve-all.ts builds once for all its slots (E2E_PREBUILT).
  if (process.env.E2E_PREBUILT !== '1') buildWeb();

  // The bug-report relay: POST takes a report (as the Worker answers), GET lists what it took.
  const reports: unknown[] = [];
  const relay = http.createServer((req, res) => {
    if (req.method !== 'POST') return void res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(reports));
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      reports.push(JSON.parse(raw));
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise<void>((resolve) => relay.listen(BUG_RELAY_PORT, '127.0.0.1', resolve));

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-room-e2e-'));
  const dataDir = path.join(tmpDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  // The real cast, copied, plus SECOND: a direct contact with no rooms of her own (so the neutral
  // default rooms) and no look (a monogram), on the fake OpenRouter like everyone else.
  const charactersDir = path.join(tmpDir, 'characters');
  fs.cpSync('./characters', charactersDir, { recursive: true });
  fs.mkdirSync(path.join(charactersDir, SECOND.id));
  fs.writeFileSync(
    path.join(charactersDir, SECOND.id, 'character.json'),
    JSON.stringify({ name: SECOND.name, pronoun: 'she', identity: 'identity.md', bio: 'bio.md', facts: [SECOND.fact], backend: { provider: 'openrouter', model: DIRECT.models[0].id } }, null, 2),
  );
  fs.writeFileSync(path.join(charactersDir, SECOND.id, 'bio.md'), `${SECOND.bio}\n`);
  fs.writeFileSync(path.join(charactersDir, SECOND.id, 'identity.md'), `${SECOND.identityLine} You speak plainly and briefly.\n`);
  // nix-direct's schedule of its own, so a Studio edit to her live one can't move where the specs start: the Intake
  // from 20:00 (where a new game finds her), the rooftop at 04:00, home at 05:00, Hae's from 18:30.
  const directFile = path.join(charactersDir, DIRECT.id, 'character.json');
  const direct = JSON.parse(fs.readFileSync(directFile, 'utf8')) as object;
  fs.writeFileSync(
    directFile,
    JSON.stringify({
      ...direct,
      schedule: [
        { from: '20:00', to: '04:00', room: 'karasu/lowlight-intake' },
        { from: '04:00', to: '05:00', room: 'karasu/ribbon-rooftop' },
        { from: '05:00', to: '15:00', room: 'karasu/nix-apartment' },
        { from: '18:30', to: '20:00', room: 'karasu/noodle-stall' },
      ],
    }, null, 2),
  );
  // Photos (photos spec §8): one untagged photo for Nix, made here, so one always fits whatever her schedule says.
  const nixDir = path.join(charactersDir, DIRECT.id);
  fs.mkdirSync(path.join(nixDir, 'photos'), { recursive: true });
  fs.writeFileSync(path.join(nixDir, 'photos', 'e2e-test.webp'), await sharp({ create: { width: 60, height: 90, channels: 3, background: '#ff4f8b' } }).webp().toBuffer());
  const nixJson = JSON.parse(fs.readFileSync(path.join(nixDir, 'character.json'), 'utf8')) as { photos?: unknown[] };
  nixJson.photos = [...(nixJson.photos ?? []), { id: 'e2e-test', caption: 'a pink square, for the e2e' }];
  fs.writeFileSync(path.join(nixDir, 'character.json'), JSON.stringify(nixJson, null, 2));

  // The direct twin (characters/nix-direct): her identity is her own identity.md in the repo; here, the
  // linked key and recent models (as the game writes them); OpenRouter is the fake below.
  fs.writeFileSync(
    path.join(dataDir, 'settings.json'),
    JSON.stringify({ version: 1, keys: { openrouter: GOOD_KEY }, recentModels: DIRECT.models.map((m) => m.id), characterModels: {} }),
  );
  const openrouterBaseUrl = await startFakeOpenRouter({ logPort: STUB_OR_LOG_PORT });

  // No persona.json: the default player stays 'you' (who you are is chosen per playthrough at NEW GAME).
  const personaDir = path.join(tmpDir, 'persona');
  fs.mkdirSync(personaDir, { recursive: true });

  // The real scenes, copied so the test rooms below never touch ./scenes.
  const scenesDir = path.join(tmpDir, 'scenes');
  fs.cpSync('./scenes', scenesDir, { recursive: true });
  writeTestRooms(path.join(scenesDir, 'karasu'));
  // Room exits (e2e/exits.spec.ts): a side room off the map, reached from the intake's back door.
  const side = path.join(scenesDir, 'karasu', 'zz-side-room');
  fs.cpSync('./scenes/default/workspace', side, { recursive: true });
  const sideDef = JSON.parse(fs.readFileSync(path.join(side, 'scene.json'), 'utf8')) as object;
  fs.writeFileSync(path.join(side, 'scene.json'), JSON.stringify({ ...sideDef, id: 'zz-side-room', name: 'Side Room' }));
  const intakeFile = path.join(scenesDir, 'karasu', 'lowlight-intake', 'scene.json');
  const intake = JSON.parse(fs.readFileSync(intakeFile, 'utf8')) as object;
  fs.writeFileSync(intakeFile, JSON.stringify({ ...intake, exits: [{ to: 'karasu/zz-side-room', way: 'out the back door' }] }));

  // A lore book of its own (e2e/smoke "lore:"): an entry for the intake, where nix-direct starts, and one by key.
  const loreDir = path.join(tmpDir, 'lore');
  fs.mkdirSync(loreDir, { recursive: true });
  fs.writeFileSync(path.join(loreDir, 'e2e-intake.md'), '---\ntitle: E2E Intake Lore\nplaces: [lowlight-intake]\n---\nThe intake has a blue door.\n');
  // The district load screen's text for Karasu (the intake's district): its only key is never typed, so it's never in a prompt.
  fs.writeFileSync(path.join(loreDir, 'e2e-karasu.md'), "---\ntitle: Karasu\nkeys: [e2e-never-typed]\n---\nKarasu is Lowlight's oldest district.\n");
  fs.writeFileSync(path.join(loreDir, 'e2e-orchid.md'), '---\ntitle: E2E Orchid Lore\nkeys: [velvet orchid]\n---\nThe Velvet Orchid sells umbrellas.\n');
  // Lore words on hover (jobs.spec): Back Door's door, with a street version the card shows instead.
  fs.writeFileSync(path.join(loreDir, 'e2e-steel-doors.md'), '---\ntitle: Steel Doors\nkeys: [steel door]\n---\nInsider: the doors are SDG surplus.\n');
  fs.writeFileSync(path.join(loreDir, 'e2e-steel-doors-on-the-street.md'), '---\ntitle: Steel doors on the street\nkeys: [back door]\n---\nEvery stall on the Ribbon has one. Nobody asks where they came from.\n');

  // Gig briefs (e2e/direct "gig:"): one easy job at The Tilt, so the hack window deals a single card.
  const gigsDir = path.join(tmpDir, 'gigs');
  fs.mkdirSync(gigsDir, { recursive: true });
  fs.writeFileSync(
    path.join(gigsDir, 'e2e-line.md'),
    `---\ntitle: ${E2E_GIG.title}\ntier: easy\nplace: the-tilt\nclient: A courier\ntarget: Voltaic · depot ledger\ntake: one line of debt\n---\n${E2E_GIG.text}\n`,
  );
  fs.writeFileSync(
    path.join(gigsDir, 'e2e-floor.md'),
    `---\ntitle: ${E2E_SLIP.title}\ntier: medium\nkind: slip\nplace: the-tilt\nclient: A dancer\ntarget: Glass Orchid · back office\ntake: a ledger page\n---\n${E2E_SLIP.text}\n`,
  );

  // The splash library: the Nix image on, a second copy off (e2e/splash-library.spec.ts flips them).
  const splashDir = path.join(tmpDir, 'splash');
  fs.mkdirSync(splashDir, { recursive: true });
  fs.copyFileSync('./world/splash/nix-wall.webp', path.join(splashDir, 'nix-wall.webp'));
  fs.copyFileSync('./world/splash/nix-wall.webp', path.join(splashDir, 'second.webp'));
  const logo = { x: 67, y: 117, width: 727 };
  fs.writeFileSync(
    path.join(splashDir, 'splashes.json'),
    JSON.stringify({ version: 1, splashes: [
      { id: 'nix-wall', name: 'Nix against the wall', file: 'nix-wall.webp', width: 1531, height: 1027, on: true, logo },
      { id: 'second', name: 'Second', file: 'second.webp', width: 1531, height: 1027, on: false, logo },
    ] }),
  );
  // The arrival screen's districts folder of its own, so a Studio edit to the live subtitles can't break arrival.spec.
  const districtsDir = path.join(tmpDir, 'districts');
  fs.mkdirSync(districtsDir, { recursive: true });
  fs.copyFileSync('./world/districts/karasu.webp', path.join(districtsDir, 'karasu.webp'));
  fs.writeFileSync(path.join(districtsDir, 'districts.json'), JSON.stringify({ karasu: { subtitle: 'Old Town · The Ribbon' } }));
  // A quest line at the Intake (e2e/quests.spec.ts): the shared test quest, for Nix or Hicks.
  const questsDir = path.join(tmpDir, 'quests');
  fs.mkdirSync(questsDir, { recursive: true });
  // Paper Trail with HAND waiting for 06:00 at the Intake (quest waits), and a quest that waits for CONTINUE.
  // Venn takes any SDG face from a two-face library (stranger faces).
  fs.writeFileSync(
    path.join(questsDir, 'paper-trail.md'),
    WAITS.replace('after: null', 'after: null\npitch: A Sentinel wants one page from the ledger.').replace(/(stranger: Arlo Venn[^\n]*\n)/, '$1face: any sdg\n'),
  );
  const extrasDir = path.join(tmpDir, 'extras');
  fs.mkdirSync(extrasDir, { recursive: true });
  for (const id of ['sdg-01', 'sdg-02']) fs.copyFileSync(`./world/extras/${id === 'sdg-01' ? 'sdg-07' : 'sdg-02'}.png`, path.join(extrasDir, `${id}.png`));
  fs.writeFileSync(path.join(extrasDir, 'extras.json'), JSON.stringify(['sdg-01', 'sdg-02'].map((id) => ({ id, file: `${id}.png`, tags: ['sdg'] }))));
  fs.writeFileSync(path.join(questsDir, 'ready-test.md'), READY);
  // A mission at the Intake (e2e/missions.spec.ts), with its checks rolling 80 (a fail), then 3 (passes) from then on.
  fs.writeFileSync(path.join(questsDir, 'night-shift.md'), MISSION.replace('starts: haes-noodles', 'starts: lowlight-intake').replace('pay: 400\n---', 'pay: 400\nart: night-shift.png\n---'));
  // Its picture (quest art): any wide room picture stands in.
  fs.mkdirSync(path.join(questsDir, 'art'), { recursive: true });
  fs.copyFileSync('./scenes/tidal/ferry-stairs/room.png', path.join(questsDir, 'art', 'night-shift.png'));
  process.env.NIX_TEST_ROLLS = '80,3';
  // A small job at the Intake (e2e/jobs.spec.ts): tier 1 so a Nobody sees it; its door's talk is the red check, a kick
  // blows it without a roll, and the ledger cracks. With Night Shift it makes a pool of two, so both post every night.
  fs.writeFileSync(
    path.join(questsDir, 'back-door.md'),
    JOB.replace('tier: 2', 'tier: 1')
      .replace('starts: haes-noodles', 'starts: lowlight-intake')
      .replace(/\[check cool 50\]/g, '[check cool 50 red]')
      .replace(/(- wait: Wait for the shift change\. → inside \[clock \+1h\]\n)/g, '$1- kick: Kick the door in. → turned [alarm +1]\n')
      .replace('- grab: Take it all. → paid / part [check reflex 50]', '- grab: Crack the ledger terminal. → paid / part [crack 6 ice]'),
  );
  // A big job at the Intake (e2e/big-jobs.spec.ts), played by Cass with Trusted rep in Karasu (a playthrough of its own),
  // so the other specs' player keeps a Nobody's boards. The take marks the ferry and the Tilt; every route's gig resolves clean without its window.
  fs.writeFileSync(
    path.join(questsDir, 'north-gate.md'),
    BIG.replace('starts: haes-noodles', 'starts: lowlight-intake')
      .replace('go: 03:00', 'go: 05:30')
      .replace('marks: ferry-stairs "the courier came through here", lowlight-intake "the gate\'s paperwork"', 'marks: ferry-stairs "the courier came through here", the-tilt "the guard drinks here"')
      .replace('reveals: the-tilt "the guard drinks here"\n', ''),
  );
  process.env.NIX_TEST_REP = 'cass@karasu:50';
  process.env.NIX_TEST_GIG = 'clean';
  // One of Nix's own clients' jobs (e2e/intake.spec.ts), at Hae's so the Intake's pool stays as jobs.spec counts it:
  // trust is its stake, it posts all day, and its skim ends CLEAN without a roll (the roll list belongs to missions.spec).
  fs.writeFileSync(
    path.join(questsDir, 'client-test.md'),
    JOB.replace('title: Back Door', 'title: Client Test')
      .replace('tier: 2', 'tier: 1')
      .replace('with: [hicks, ember, nix-direct]', 'with: [nix-direct]')
      .replace('minutes: 30\n', 'minutes: 30\nposts: 00:00-23:59\ntrust: 1 / 1\npitch: A client needs a hand.\n')
      .replace('- skim: Take what fits in a pocket. → part', '- skim: Take what fits in a pocket. → paid'),
  );
  // The arrangement (e2e/arrangement.spec.ts): a cut-down Chair and two jobs with Nix in their crew, all at the Tilt (no other
  // board there, so both jobs post every night); Cass starts with Nix at trust 6 (high), in a playthrough of its own.
  fs.writeFileSync(path.join(questsDir, 'chair-test.md'), CHAIR.replace('title: The Chair', 'title: Chair Test').replace('starts: lowlight-intake', 'starts: the-tilt'));
  for (const [id, title] of [['chair-job', 'Chair Job'], ['chair-job-2', 'Chair Job Two']]) {
    fs.writeFileSync(
      path.join(questsDir, `${id}.md`),
      JOB.replace('title: Back Door', `title: ${title}`)
        .replace('tier: 2', 'tier: 1')
        .replace('starts: haes-noodles', 'starts: the-tilt')
        .replace('- skim: Take what fits in a pocket. → part', '- skim: Take what fits in a pocket. → paid'),
    );
  }
  process.env.NIX_TEST_TRUST = 'cass@nix-direct:6';
  // The fixer's stock (small jobs spec §5): a free burner at the Intake, so the cover spec needn't earn sol first.
  const gearDir = path.join(tmpDir, 'gear');
  fs.mkdirSync(gearDir, { recursive: true });
  for (const f of ['decks.md', 'words.md']) fs.copyFileSync(`./world/gear/${f}`, path.join(gearDir, f));
  fs.writeFileSync(path.join(gearDir, 'stock.md'), '---\nplace: lowlight-intake\nitems:\n  - burner · 0 · 1\n---\n');
  // Crew (e2e/crew.spec.ts): the Intake hires runners and ears; a sure-thing trait keeps rolls clean, and the seed is pinned.
  const crewDir = path.join(tmpDir, 'crew');
  fs.mkdirSync(crewDir, { recursive: true });
  fs.writeFileSync(path.join(crewDir, 'names.md'), '## karasu\n- Juno Sato\n- Pell Okoro\n- Ren Takagi\n- Mika Arai\n');
  fs.writeFileSync(path.join(crewDir, 'traits.md'), 'sure · Sure Thing · + · odds any +90 · any · Never misses.\n');
  fs.writeFileSync(path.join(crewDir, 'pitches.md'), '## runner GREEN\n- "Fast."\n## ears GREEN\n- "Quiet."\n');
  fs.writeFileSync(
    path.join(crewDir, 'errands.md'),
    [
      '---\nkind: run\nlabel: Run a package\ntag: SOL\nsuits: runner, ears\nhours: 2\nrisk: low\nblurb: Across the city and back.\nclean:\n  - effect: sol 200\n  - "{name} ran it."\nmessy:\n  - effect: sol 200\n  - "{name} ran it, late."\nblown:\n  - "{name} lost it."\n',
      '---\nkind: case\nlabel: Case {job}\ntag: PREP\nsuits: runner, ears\nhours: 2\nrisk: low\nneeds: job\nclean:\n  - effect: prep cased=clean\n  - "{name} cased it."\nmessy:\n  - effect: prep cased=messy\n  - "{name} was seen."\nblown:\n  - "{name} was made."\n---\n',
    ].join(''),
  );
  const crewMap = JSON.parse(fs.readFileSync('./map/lowlight.json', 'utf8')) as { places: { id: string; hires?: string[] }[] };
  for (const p of crewMap.places) if (p.id === 'lowlight-intake') p.hires = ['runner', 'ears'];
  const mapFile = path.join(tmpDir, 'map.json');
  fs.writeFileSync(mapFile, JSON.stringify(crewMap));
  process.env.NIX_TEST_CREW_SEED = 'e2e-crew';

  const cfg: Config = {
    port: PORT,
    token: TOKEN,
    dataDir,
    charactersDir,
    scenesDir,
    personaDir,
    loreDir,
    splashDir,
    districtsDir,
    gigsDir,
    questsDir,
    gearDir,
    extrasDir,
    crewDir,
    mapFile,
    webDist: 'dist/web',
    openrouterBaseUrl,
    playthroughsDir: path.join(dataDir, 'playthroughs'),
    autoPlaythrough: true,
    bugRelayUrl: `http://127.0.0.1:${BUG_RELAY_PORT}/`,
  };

  const built = await buildApp(cfg);
  const { app } = built;
  for (const id of [DIRECT.id, SECOND.id]) await (await built.runtime(id))!.checkHealth();
  // Crew (e2e/crew.spec.ts): sol to sign recruits on, as a starting row of the fixer's ledger (no rewind takes it back).
  const pt = built.world.active();
  if (pt) (await built.runtime(DIRECT.id))!.db.setMeta(`fixer.${pt.player}`, JSON.stringify([{ at: 0, sol: 1000 }]));
  // Intake board (e2e/intake.spec.ts): Nix's trust one short of high, so a clean client's job changes her word.
  if (pt) (await built.runtime(DIRECT.id))!.db.setMeta(`standing.${pt.player}`, JSON.stringify({ trust: 4, warmth: 0, moves: [] }));
  // The rendered map's tiles (spec 2026-10-25 §5) are a local render, gitignored: whatever is in a checkout's
  // web/public/map, these servers answer no tiles.json, so every test world shows the painting. The tiles spec serves
  // its own fixture tiles from the browser.
  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/map/tiles') || req.url.startsWith('/map/windows.json')) return reply.code(404).send({ error: 'no render in e2e' });
  });
  await app.listen({ port: cfg.port, host: '127.0.0.1' });
  console.log(`e2e server listening on http://127.0.0.1:${cfg.port}`);

  // Mirrors server/src/main.ts's shutdown: idempotent since Playwright may send SIGTERM then
  // SIGKILL (or both signals in quick succession), and removes the temp DB directory this
  // process created so repeated `npm run e2e` runs don't leak files into the OS tmpdir.
  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    await built.close();
    relay.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

// Run only as the server (specs import the test briefs from this file).
if (process.argv[1]?.endsWith('serve.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
