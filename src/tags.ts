import type { Config } from './types.js';

export function normalizeTag(raw: unknown, cfg: Config, freeForm = false): string | null {
  if (typeof raw !== 'string') return null;
  let tag = raw.trim();
  if (!tag) return null;
  if (!tag.startsWith('#')) tag = '#' + tag;
  tag = cfg.tags.aliases[tag] ?? tag;
  const allowed = new Set([...cfg.tags.allowed, cfg.tags.autoTag]);
  if (allowed.has(tag)) return tag;
  if (freeForm || cfg.tags.freeForm) {
    if (/^#[A-Za-z0-9_-]+$/.test(tag)) return tag;
    return null;
  }
  return null;
}

export function mergeTags(cfg: Config, ...lists: (string[] | undefined | null)[]): string[] {
  const seen: string[] = [];
  for (const list of lists) {
    if (!list) continue;
    for (const raw of list) {
      const normalized = normalizeTag(raw, cfg, cfg.tags.freeForm);
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

export function isMetaTag(tag: string, cfg: Config): boolean {
  if (tag === cfg.tags.autoTag) return true;
  if (tag === '#Duplikat' || tag === '#PrawdopodobnaKopia') return true;
  return false;
}

export class TagDiscovery {
  private readonly counts = new Map<string, number>();

  record(tag: string): void {
    this.counts.set(tag, (this.counts.get(tag) ?? 0) + 1);
  }

  entries(): Array<{ tag: string; count: number }> {
    return [...this.counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  get size(): number {
    return this.counts.size;
  }
}
