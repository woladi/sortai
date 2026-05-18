import path from 'node:path';
import { existsSync } from 'node:fs';
import { walkFiles } from '../walker.js';
import { isMetaTag } from '../tags.js';
import { expandHome } from '../config.js';
import { readMacosTags } from './read-tags.js';
import type { Config } from '../types.js';

export interface MoveOp {
  from: string;
  to: string;
  primaryTag: string;
  allTags: string[];
}

export interface SkipOp {
  path: string;
  reason: string;
}

export interface OrganizePlan {
  moves: MoveOp[];
  skips: SkipOp[];
  conflicts: number;
}

function dedupName(desired: string, taken: Set<string>): string {
  const key = desired.toLowerCase();
  if (!taken.has(key) && !existsSync(desired)) {
    taken.add(key);
    return desired;
  }
  const dir = path.dirname(desired);
  const ext = path.extname(desired);
  const base = path.basename(desired, ext);
  for (let n = 2; n < 10_000; n++) {
    const cand = path.join(dir, `${base}_${n}${ext}`);
    const ck = cand.toLowerCase();
    if (!taken.has(ck) && !existsSync(cand)) {
      taken.add(ck);
      return cand;
    }
  }
  taken.add(key);
  return desired;
}

export function pickPrimaryTag(tags: string[], cfg: Config): string | null {
  const filtered = tags.filter(t => !isMetaTag(t, cfg));
  if (filtered.length === 0) return null;
  for (const p of cfg.organize.priority) {
    if (filtered.includes(p)) return p;
  }
  return filtered[0];
}

export function folderForTag(tag: string, cfg: Config): string {
  if (cfg.organize.folderMap[tag]) return cfg.organize.folderMap[tag];
  return tag.replace(/^#/, '');
}

export async function buildOrganizePlan(root: string, cfg: Config): Promise<OrganizePlan> {
  const files = await walkFiles(root, cfg);
  const moves: MoveOp[] = [];
  const skips: SkipOp[] = [];
  const taken = new Set<string>();
  let conflicts = 0;

  const target = path.resolve(expandHome(cfg.organize.target));

  for (const file of files) {
    const tags = await readMacosTags(file);
    const primary = pickPrimaryTag(tags, cfg);

    if (!primary) {
      if (cfg.organize.unsorted === 'skip') {
        skips.push({ path: file, reason: 'brak tagów (skip)' });
        continue;
      }
      if (cfg.organize.unsorted === 'keep') {
        skips.push({ path: file, reason: 'brak tagów (zostawiam w miejscu)' });
        continue;
      }
      const desired = path.join(target, cfg.organize.unsortedFolder, path.basename(file));
      if (path.resolve(desired) === path.resolve(file)) {
        skips.push({ path: file, reason: 'już w docelowym miejscu' });
        continue;
      }
      const final = dedupName(desired, taken);
      if (final !== desired) conflicts++;
      moves.push({ from: file, to: final, primaryTag: '', allTags: tags });
      continue;
    }

    const folder = folderForTag(primary, cfg);
    const desired = path.join(target, folder, path.basename(file));
    if (path.resolve(desired) === path.resolve(file)) {
      skips.push({ path: file, reason: 'już w docelowym miejscu' });
      continue;
    }
    const final = dedupName(desired, taken);
    if (final !== desired) conflicts++;
    moves.push({ from: file, to: final, primaryTag: primary, allTags: tags });
  }

  return { moves, skips, conflicts };
}
