import type { Config, SampledFile, Taxonomy, TaxonomyCategory, LanguageCode } from '../types.js';
import { inferTaxonomy } from '../llm/index.js';

export async function generateTaxonomy(
  samples: SampledFile[],
  langs: LanguageCode[],
  userContext: string,
  cfg: Config,
  hint?: string,
): Promise<Taxonomy> {
  return inferTaxonomy(samples, langs, userContext, cfg, hint);
}

export function applyTaxonomyToConfig(taxonomy: Taxonomy, cfg: Config): Config {
  const allowed = new Set<string>();
  const strict: string[] = [];
  const aliases: Record<string, string> = {};
  const strictEvidence: Record<string, string[]> = {};

  for (const cat of taxonomy.categories) {
    allowed.add(cat.name);
    for (const a of cat.aliases) {
      if (a !== cat.name) aliases[a] = cat.name;
    }
    if (cat.isStrict) {
      strict.push(cat.name);
      if (cat.strictEvidence.length > 0) {
        strictEvidence[cat.name] = cat.strictEvidence;
      }
    }
  }

  allowed.add(cfg.tags.autoTag);
  allowed.add('#Duplikat');
  allowed.add('#PrawdopodobnaKopia');
  allowed.add('#Skan');
  allowed.add('#Screenshot');
  allowed.add('#Foto');
  allowed.add('#Grafika');
  allowed.add('#Email');
  allowed.add('#Nagranie');

  return {
    ...cfg,
    tags: {
      ...cfg.tags,
      allowed: [...allowed],
      strict,
      aliases: { ...cfg.tags.aliases, ...aliases },
      strictEvidence: { ...cfg.tags.strictEvidence, ...strictEvidence },
    },
  };
}

export function taxonomyFromConfig(cfg: Config): Taxonomy {
  const cats: TaxonomyCategory[] = cfg.tags.allowed
    .filter(t => t !== cfg.tags.autoTag)
    .map(name => ({
      name,
      description: '',
      aliases: Object.entries(cfg.tags.aliases)
        .filter(([, target]) => target === name)
        .map(([alias]) => alias),
      strictEvidence: cfg.tags.strictEvidence[name] ?? [],
      isStrict: cfg.tags.strict.includes(name),
      examples: [],
    }));
  return { categories: cats, summary: '' };
}
