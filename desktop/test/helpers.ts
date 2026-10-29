import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** A userData folder under a Windows-like home with a space and a non-ASCII letter. */
export function tempUserData(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'Jöhn Smith-'));
  const ud = path.join(home, 'AppData', 'Lowlight');
  fs.mkdirSync(ud, { recursive: true });
  return ud;
}

export function write(root: string, rel: string, body: string): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body);
}
