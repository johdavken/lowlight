/**
 * The desktop app (spec 2026-10-09 preview build §2.2): starts the game server in this process on a free
 * 127.0.0.1 port, then opens one sandboxed window on it. Saves live in userData; content is read-only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';
import { app, BrowserWindow, dialog, ipcMain, Menu, screen, session, shell } from 'electron';
import { startFailureMessage } from './messages';
import { desktopFolders, readBugRelay, serverEnv, userDataFolder, type DesktopFolders } from './paths';
import { gateData, markVersion } from './version-gate';
import { defaultWindow, fitOnScreen, MIN_HEIGHT, MIN_WIDTH, readWindowState, writeWindowState } from './window-state';

type Server = { url: string; close(): Promise<void> };

/** How long quitting waits for the server to finish in-flight responses before exiting anyway. */
const CLOSE_CAP_MS = 3000;

app.setName('Lowlight');
app.setPath('userData', process.env.LOWLIGHT_TEST === '1' && process.env.LOWLIGHT_USER_DATA ? process.env.LOWLIGHT_USER_DATA : userDataFolder(app.getPath('appData'), app.isPackaged));

const here = path.dirname(fileURLToPath(import.meta.url));
/** Packaged: package.json's version. Unpackaged (`npm run desktop`): the repo's, two folders up from dist/desktop. */
const version: string = app.isPackaged ? app.getVersion() : (JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'package.json'), 'utf8')) as { version: string }).version;

/** A test build's tag (BUILD tab §4.2), from the packaged app's own package.json; null for a release or unpackaged. */
const build: string | null = (() => {
  if (!app.isPackaged) return null;
  try {
    const tag = (JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8')) as { lowlightBuild?: unknown }).lowlightBuild;
    return typeof tag === 'string' && tag !== '' ? tag : null;
  } catch {
    return null;
  }
})();

const folders: DesktopFolders = desktopFolders(
  app.getPath('userData'),
  app.isPackaged ? path.join(process.resourcesPath, 'content') : path.join(here, '..', '..', 'build', 'stage', 'content'),
  app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(here, '..', 'web'),
);

/**
 * The log is written synchronously, so its last lines survive a blocking dialog or a crash. Logging never
 * stops the game: a log that can't be opened or written leaves the console as it was.
 */
let logFd: number | null = null;
function openLog(): void {
  try {
    fs.mkdirSync(folders.logs, { recursive: true });
    const file = path.join(folders.logs, 'server.log');
    try {
      if (fs.existsSync(file)) fs.renameSync(file, path.join(folders.logs, 'server.prev.log'));
    } catch {
      // A locked previous log (Windows): overwrite this one instead.
    }
    logFd = fs.openSync(file, 'w');
  } catch (err) {
    console.error('server.log unavailable:', err);
    return;
  }
  for (const level of ['log', 'warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      try {
        if (logFd !== null) fs.writeSync(logFd, `${args.map((a) => (typeof a === 'string' ? a : a instanceof Error ? (a.stack ?? a.message) : inspect(a))).join(' ')}\n`);
      } catch {
        // A full disk: the console still has it.
      }
    };
  }
  console.log(`Lowlight ${version}${build ? ` · ${build}` : ''} · ${process.platform} · Electron ${process.versions.electron} · Node ${process.versions.node}`);
}

/** The running server, once started: closed on quit and on a failure. */
let server: Server | null = null;

/** Opens a folder in the file manager; shell.openPath reports a failure as a string, which goes to the log. */
function openFolder(dir: string): void {
  void shell.openPath(dir).then((error) => {
    if (error) console.warn(`could not open ${dir}: ${error}`);
  });
}

/** Saves every window's place and closes the server (capped at CLOSE_CAP_MS), then exits with `code`. */
function shutDown(code: number): void {
  for (const w of BrowserWindow.getAllWindows()) saveWindowState(w);
  const closing = server ? server.close().catch((err: unknown) => console.error(err)) : Promise.resolve();
  void Promise.race([closing, new Promise((r) => setTimeout(r, CLOSE_CAP_MS))]).finally(() => app.exit(code));
}

let failing = false;
/** The native failure dialog (spec §5.2), then quit. Shown once even if several errors arrive. */
function fail(message: string): void {
  if (failing) return;
  failing = true;
  console.error(message);
  const detail = `Log: ${path.join(folders.logs, 'server.log')}`;
  // Before the app is ready only the plain error box can be shown.
  if (!app.isReady()) {
    dialog.showErrorBox('Lowlight', `${message}\n\n${detail}`);
    app.exit(1);
    return;
  }
  const choice = dialog.showMessageBoxSync({
    type: 'error',
    title: 'Lowlight',
    message,
    detail,
    buttons: ['Open log folder', 'Quit'],
    defaultId: 1,
    cancelId: 1,
  });
  if (choice === 0) openFolder(folders.logs);
  shutDown(1);
}

process.on('uncaughtException', (err) => {
  console.error(err);
  fail('Lowlight hit an error and has to close.');
});
process.on('unhandledRejection', (err) => {
  console.error(err);
  fail('Lowlight hit an error and has to close.');
});

const windowStateFile = () => path.join(folders.userData, 'window.json');

/** Saved on the window's close and again on quit: app.exit() skips the windows' close events. */
function saveWindowState(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  const b = win.getNormalBounds();
  writeWindowState(windowStateFile(), { width: b.width, height: b.height, x: b.x, y: b.y, maximized: win.isMaximized() });
}

function openWindow(server: Server): BrowserWindow {
  const state = fitOnScreen(readWindowState(windowStateFile(), defaultWindow(screen.getPrimaryDisplay().workArea)), screen.getAllDisplays().map((d) => d.workArea));
  const origin = new URL(server.url).origin;
  const win = new BrowserWindow({
    title: 'Lowlight',
    width: state.width,
    height: state.height,
    ...(state.x !== undefined && state.y !== undefined ? { x: state.x, y: state.y } : {}),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  });
  if (state.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());

  // The page is the game and nothing else: other sites open in the system browser.
  const external = (url: string) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  };
  win.webContents.on('will-navigate', (e, url) => {
    if (new URL(url).origin === origin) return;
    e.preventDefault();
    external(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    external(url);
    return { action: 'deny' };
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      e.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });
  // The window is Lowlight, whatever the page calls itself.
  win.on('page-title-updated', (e) => e.preventDefault());
  win.on('close', () => saveWindowState(win));
  // Windows logging off or shutting down ends the app without before-quit.
  win.on('session-end', () => saveWindowState(win));

  void win.loadURL(server.url);
  return win;
}

const CAPTURE_MAX_WIDTH = 1600;

/** The preload's bridge (window.lowlight): answered only for the game's own page. */
function wireIpc(origin: string): void {
  const fromGame = (e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => {
    try {
      return new URL(e.senderFrame?.url ?? '').origin === origin;
    } catch {
      return false;
    }
  };
  ipcMain.on('lowlight:info', (e) => {
    e.returnValue = fromGame(e) ? { version, build, packaged: app.isPackaged } : null;
  });
  ipcMain.on('lowlight:open-save', (e) => {
    if (fromGame(e)) openFolder(folders.data);
  });
  ipcMain.on('lowlight:open-log', (e) => {
    if (fromGame(e)) openFolder(folders.logs);
  });
  // A bug report's screenshot: the window as it is, at most 1600 px wide; null when it can't be taken.
  ipcMain.handle('lowlight:capture', async (e) => {
    if (!fromGame(e)) return null;
    try {
      const shot = await e.sender.capturePage();
      const sized = shot.getSize().width > CAPTURE_MAX_WIDTH ? shot.resize({ width: CAPTURE_MAX_WIDTH }) : shot;
      return sized.toPNG().toString('base64');
    } catch (err) {
      console.error('screenshot failed:', err);
      return null;
    }
  });
}

/** The page asks for nothing beyond copying its version: every other permission (camera, location, notifications…) is denied. */
function denyPermissions(): void {
  const allowed = (permission: string) => permission === 'clipboard-sanitized-write';
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed(permission));
}

async function main(): Promise<void> {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  // Wired first: a second launch while this one is still starting focuses it once its window exists.
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  await app.whenReady();
  openLog();
  Menu.setApplicationMenu(null);
  denyPermissions();

  let started: Server;
  try {
    const gate = gateData(folders.userData, version);
    if (gate.kind === 'newer') {
      fail(`This save folder was last opened by Lowlight ${gate.dataVersion}, which is newer than this build (${version}). Install the newer build to keep playing.`);
      return;
    }
    if (gate.kind === 'upgraded') console.log(`saves backed up to ${gate.backup}`);
    fs.mkdirSync(folders.data, { recursive: true });
    const { start } = (await import(new URL('../server/start.mjs', import.meta.url).href)) as { start: (env: NodeJS.ProcessEnv, log: (l: string) => void) => Promise<Server> };
    started = await start(serverEnv(folders, process.env, { version, build, bugRelay: readBugRelay(folders.content) }), (l) => console.log(l));
    server = started;
  } catch (err) {
    console.error(err);
    fail(startFailureMessage(err, folders.data));
    return;
  }
  markVersion(folders.userData, version);
  wireIpc(new URL(started.url).origin);

  openWindow(started);
  app.on('window-all-closed', () => app.quit());
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow(started);
  });

  let quitting = false;
  app.on('before-quit', (e) => {
    if (quitting) return;
    quitting = true;
    e.preventDefault();
    shutDown(0);
  });
}

void main();
