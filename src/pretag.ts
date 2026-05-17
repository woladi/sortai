import path from 'node:path';
import type { Config } from './types.js';
import { mergeTags } from './tags.js';

export function preTagFromPath(filePath: string, ocrText: string, cfg: Config): string[] {
  const haystack = filePath
    .replace(/[\\/]/g, ' ')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ') +
    ' ' + ocrText;

  let collected: string[] = [];
  for (const rule of cfg.tags.pathRules) {
    let re: RegExp;
    try {
      re = new RegExp(rule.pattern, rule.flags ?? '');
    } catch {
      continue;
    }
    if (re.test(haystack)) {
      collected = mergeTags(cfg, collected, rule.tags);
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.eml') {
    collected = mergeTags(cfg, collected, ['#Email']);
  } else if (cfg.scan.videoExtensions.includes(ext)) {
    collected = mergeTags(cfg, collected, ['#Nagranie']);
  } else if (['.png', '.jpg', '.jpeg', '.webp', '.heic'].includes(ext) && !ocrText.trim()) {
    collected = mergeTags(cfg, collected, ['#Grafika']);
  }

  return collected;
}
