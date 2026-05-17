import { promises as fs, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Config } from './types.js';

export interface DuplicateGroup {
  hash: string;
  files: string[];
}

export interface DedupResult {
  groupByFile: Map<string, DuplicateGroup>;
  totalGroups: number;
  totalDuplicates: number;
  skippedLarge: number;
  hashedFiles: number;
}

async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export async function findDuplicates(files: string[], cfg: Config): Promise<DedupResult> {
  const empty: DedupResult = {
    groupByFile: new Map(),
    totalGroups: 0,
    totalDuplicates: 0,
    skippedLarge: 0,
    hashedFiles: 0,
  };
  if (!cfg.dedup.enabled || files.length < 2) return empty;

  const maxBytes = cfg.dedup.maxFileSizeMB * 1024 * 1024;
  const hashes = new Map<string, string[]>();
  let skippedLarge = 0;
  let hashedFiles = 0;

  const BATCH = 8;
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async f => {
        try {
          const st = await fs.stat(f);
          if (!st.isFile()) return;
          if (st.size > maxBytes) {
            skippedLarge++;
            return;
          }
          if (st.size === 0) return;
          const h = await hashFile(f);
          if (!hashes.has(h)) hashes.set(h, []);
          hashes.get(h)!.push(f);
          hashedFiles++;
        } catch {
          // unreadable or transient; skip silently
        }
      }),
    );
  }

  const groupByFile = new Map<string, DuplicateGroup>();
  let totalGroups = 0;
  let totalDuplicates = 0;
  for (const [hash, paths] of hashes) {
    if (paths.length > 1) {
      totalGroups++;
      totalDuplicates += paths.length;
      const group: DuplicateGroup = { hash, files: paths };
      for (const p of paths) groupByFile.set(p, group);
    }
  }

  return { groupByFile, totalGroups, totalDuplicates, skippedLarge, hashedFiles };
}
