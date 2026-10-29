// npm run st-publish: builds the public SillyTavern package into its local checkout and commits it (you push).
//   npm run st-publish -- --message "Second Socket: a new neon flicker"          a patch version
//   npm run st-publish -- --minor --message "Ines joins the cast"                 a minor version
//   --repo <dir>   the package checkout (default ~/Projects/lowlight-sillytavern)
// Steps: the public build and the cast into the checkout, the package files, the version and changelog, the guard
// over every file that would be committed, then one commit. It never pushes.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKAGE_ALLOW, checkShipList, publicAudio } from './guard';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const repo = path.resolve(arg('repo') ?? path.join(os.homedir(), 'Projects/lowlight-sillytavern'));
const message = arg('message');
const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' });

if (!message) {
  console.error('Give the changelog line: --message "…"');
  process.exit(1);
}
if (!fs.existsSync(path.join(repo, '.git'))) {
  console.error(
    `${repo} isn't a git checkout yet. Create it once:\n  mkdir -p ${repo} && cd ${repo} && git init -b main\n  git config user.email johdavken@users.noreply.github.com\n  git remote add origin git@github.com:johdavken/lowlight-sillytavern.git`,
  );
  process.exit(1);
}
if (!/@users\.noreply\.github\.com$/.test(git('config', 'user.email') || '')) console.warn('Note: this checkout commits as a personal address; the public repo was meant to use the GitHub noreply one.');

// The version: the last published one (the manifest in HEAD; a failed run's leftovers don't count), bumped. First: 1.0.0.
let was: string | null = null;
try {
  was = (JSON.parse(git('show', 'HEAD:manifest.json')) as { version: string }).version;
} catch {
  was = null;
}
const [maj, min, pat] = (was ?? '0.0.0').split('.').map(Number);
const version = !was ? '1.0.0' : process.argv.includes('--minor') ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`;
const manifestPath = path.join(repo, 'manifest.json');

// 1. The public build and the cast (the cast folder is rebuilt; its cast.json is read first, for each character's since).
const tsx = path.join(root, 'node_modules', '.bin', 'tsx');
run(tsx, [path.join(here, 'build.ts'), '--rooms', 'all', '--public', '--out', repo]);
const castDir = path.join(repo, 'cast');
if (fs.existsSync(castDir)) for (const f of fs.readdirSync(castDir)) if (f !== 'cast.json') fs.rmSync(path.join(castDir, f), { recursive: true, force: true });
run(tsx, [path.join(here, 'export-cast.ts'), '--package', repo, '--version', version]);

// 2. The package files and the third-party notices.
for (const f of fs.readdirSync(path.join(here, 'package'))) if (f !== 'CHANGELOG.md') fs.copyFileSync(path.join(here, 'package', f), path.join(repo, f));
fs.writeFileSync(path.join(repo, 'THIRD-PARTY-LICENSES.md'), thirdParty());

// 3. The guard, over everything git would commit, before the version and changelog are written.
const files = git('ls-files', '--cached', '--others', '--exclude-standard').split('\n').filter(Boolean);
const allowed = publicAudio(fs.readFileSync(path.join(root, 'sounds', 'CREDITS.md'), 'utf8') + '\n' + fs.readFileSync(path.join(repo, 'CREDITS.md'), 'utf8'));
const bad = checkShipList(files, allowed, PACKAGE_ALLOW);
if (bad.length) {
  console.error(`Not published: these may not ship:\n  ${bad.join('\n  ')}`);
  process.exit(1);
}

// The manifest (named Lowlight) and the changelog, from the last published one.
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, display_name: 'Lowlight', author: 'Lowlight', version, homePage: 'https://github.com/johdavken/lowlight-sillytavern' }, null, 2) + '\n');
let before = '';
try {
  before = git('show', 'HEAD:CHANGELOG.md').replace(/^# Changelog\n+/, '');
} catch {
  before = '';
}
fs.writeFileSync(path.join(repo, 'CHANGELOG.md'), `# Changelog\n\n## ${version} · ${new Date().toISOString().slice(0, 10)}\n- ${message}\n\n${before}`.trimEnd() + '\n');

// 4. One commit.
git('add', '-A');
git('commit', '-q', '-m', `Lowlight ${version}: ${message}`);
console.log(`Lowlight ${version} committed in ${repo} (${files.length} files). Push it when you're ready: git -C ${repo} push`);

/** Notices for the packages the bundle carries (PixiJS and its dependencies, pixi-filters, zod, yaml) and the fonts. */
function thirdParty(): string {
  const roots = ['pixi.js', 'pixi-filters', 'zod', 'yaml', '@fontsource/vt323', '@fontsource/ibm-plex-mono', '@fontsource/teko'];
  const seen = new Map<string, string>();
  const visit = (name: string) => {
    if (seen.has(name)) return;
    const dir = path.join(root, 'node_modules', name);
    const pj = path.join(dir, 'package.json');
    if (!fs.existsSync(pj)) return;
    const p = JSON.parse(fs.readFileSync(pj, 'utf8')) as { version?: string; license?: string; dependencies?: Record<string, string> };
    const file = fs.readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f));
    seen.set(name, `## ${name} ${p.version ?? ''}\n\nLicense: ${p.license ?? 'see below'}\n\n${file ? fs.readFileSync(path.join(dir, file), 'utf8').trim() : ''}\n`);
    for (const d of Object.keys(p.dependencies ?? {})) if (!d.startsWith('@types/')) visit(d);
  };
  for (const r of roots) visit(r);
  return `# Third-party licenses\n\nThe extension's bundle (lowlight-room.js, lowlight-room.css) includes these packages.\n\n${[...seen.values()].join('\n')}`;
}
