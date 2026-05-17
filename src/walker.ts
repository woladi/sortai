import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Config } from './types.js';

export async function walkFiles(root: string, cfg: Config): Promise<string[]> {
  const excluded = new Set(cfg.scan.excludeFolders);
  const out: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (excluded.has(entry.name)) continue;
        await walk(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }

  await walk(root);
  return out.sort();
}

export function isExcludedPath(p: string, cfg: Config): boolean {
  const excluded = new Set(cfg.scan.excludeFolders);
  return p.split(path.sep).some(part => excluded.has(part));
}
