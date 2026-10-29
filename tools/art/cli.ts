/**
 * Art pipeline CLI.
 *   npm run art -- <scene> --stage guide
 *   npm run art -- <scene> --stage build [--from depth|split|fill|pixel|glow|install] [--force] [--overwrite-glow]
 *   npm run art -- <scene> --promote
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { BUILD_STEPS, runBuild, runGuide, runPromote, type Step } from './pipeline';
import { loadArtSpec, readSpecPack } from './spec';
import { SceneRegistry } from '../../server/src/scenes';

const USAGE = 'usage: npm run art -- <scene> (--stage guide | --stage build [--from <step>] [--force] [--overwrite-glow] | --promote)';

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      stage: { type: 'string' },
      from: { type: 'string' },
      force: { type: 'boolean', default: false },
      'overwrite-glow': { type: 'boolean', default: false },
      promote: { type: 'boolean', default: false },
    },
  });
  const scene = positionals[0];
  if (!scene) throw new Error(USAGE);
  if (values.from !== undefined && !(BUILD_STEPS as readonly string[]).includes(values.from)) {
    throw new Error(`--from must be one of: ${BUILD_STEPS.join(', ')}`);
  }

  if (values.promote) {
    const { registry } = await SceneRegistry.load(path.join('scenes', readSpecPack(path.join('art', 'scenes', `${scene}.md`))));
    const source = registry.get(scene);
    if (!source) throw new Error(`unknown scene '${scene}'`);
    const spec = loadArtSpec(path.join('art', 'scenes', `${scene}.md`), source);
    runPromote({ scene, target: spec.target });
  } else if (values.stage === 'guide') {
    await runGuide({ scene });
  } else if (values.stage === 'build') {
    if (!fs.existsSync(path.join('art', 'work', scene, 'master.png'))) {
      throw new Error(`no master.png — run --stage guide, make the image in ChatGPT, save it to art/work/${scene}/master.png`);
    }
    await runBuild({ scene, from: values.from as Step | undefined, force: values.force, overwriteGlow: values['overwrite-glow'] });
  } else {
    throw new Error(USAGE);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
