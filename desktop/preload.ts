/**
 * The desktop bridge (window.lowlight; spec 2026-10-09 preview build §2.2). Sandboxed preloads run as
 * CommonJS with only a few Electron modules, so the version arrives over a synchronous IPC call.
 */
import { contextBridge, ipcRenderer } from 'electron';

const info = ipcRenderer.sendSync('lowlight:info') as { version: string; build: string | null; packaged: boolean } | null;

if (info) {
  contextBridge.exposeInMainWorld('lowlight', {
    version: () => info.version,
    build: () => info.build,
    packaged: info.packaged,
    openSaveFolder: () => ipcRenderer.send('lowlight:open-save'),
    openLogFolder: () => ipcRenderer.send('lowlight:open-log'),
    captureScreen: () => ipcRenderer.invoke('lowlight:capture') as Promise<string | null>,
  });
}
