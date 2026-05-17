import type { Config } from './types.js';

export function normalizeTag(raw: unknown, cfg: Config): string | null {
  if (typeof raw !== 'string') return null;
  let tag = raw.trim();
  if (!tag) return null;
  if (!tag.startsWith('#')) tag = '#' + tag;
  tag = cfg.tags.aliases[tag] ?? tag;
  const allowed = new Set([...cfg.tags.allowed, cfg.tags.autoTag]);
  return allowed.has(tag) ? tag : null;
}

export function mergeTags(cfg: Config, ...lists: (string[] | undefined | null)[]): string[] {
  const seen: string[] = [];
  for (const list of lists) {
    if (!list) continue;
    for (const raw of list) {
      const normalized = normalizeTag(raw, cfg);
      if (normalized && !seen.includes(normalized)) {
        seen.push(normalized);
      }
    }
  }
  return seen;
}

export function isStrictTag(tag: string, cfg: Config): boolean {
  return cfg.tags.strict.includes(tag);
}

export function strictTagHasEvidence(tag: string, evidence: string, cfg: Config): boolean {
  const keywords = cfg.tags.strictEvidence[tag] ?? [];
  if (keywords.length === 0) return false;
  const haystack = evidence.toLowerCase();
  return keywords.some(kw => haystack.includes(kw.toLowerCase()));
}
