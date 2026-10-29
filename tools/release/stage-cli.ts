/**
 * `npm run stage`: stages build/stage/content from release.json, as `npm run release` does, for
 * `npm run desktop` and the packaged smoke test run by hand (build:desktop → stage → package:linux → e2e:desktop).
 */
import { ReleaseError, stage } from './stage-run';

try {
  console.log(`staged ${stage(process.cwd())}`);
} catch (err) {
  console.error(err instanceof ReleaseError ? `stage stopped: ${err.message}` : err);
  process.exit(1);
}
