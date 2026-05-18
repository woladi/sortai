import type { Config, FileMetadata, LlmRequest, SampledFile, Taxonomy, TaxonomyCategory, LanguageCode } from '../types.js';
import { mergeTags, normalizeTag, isStrictTag, strictTagHasEvidence, TagDiscovery, TAG_SHAPE } from '../tags.js';
import { BAD_COMMENT_PHRASES } from '../defaults.js';
import type { Masker } from '../mask.js';
import { buildPrompt, buildTaxonomyPrompt, parseJsonSafe } from './prompt.js';
import { callOllama } from './local.js';
import { callAnthropic, callOpenAi } from './cloud.js';

async function dispatchProvider(prompt: string, cfg: Config): Promise<string> {
  switch (cfg.llm.provider) {
    case 'anthropic':
      return callAnthropic(prompt, cfg);
    case 'openai':
      return callOpenAi(prompt, cfg);
    case 'ollama':
    default:
      return callOllama(prompt, cfg);
  }
}

export async function inferTagsAndComment(
  req: LlmRequest,
  cfg: Config,
  masker?: Masker,
  discovery?: TagDiscovery,
): Promise<FileMetadata> {
  const fallback: FileMetadata = {
    tags: mergeTags(cfg, req.preTags).slice(0, 6),
    comment: `Plik: ${req.fileName}.`,
  };

  let promptOcr = req.ocrText;
  let sessionId = '';
  if (masker && req.ocrText.trim()) {
    try {
      const m = await masker.mask(req.ocrText);
      promptOcr = m.maskedText;
      sessionId = m.sessionId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`  ⚠️  Mask failed, sending raw OCR: ${msg}\n`);
    }
  }

  const prompt = buildPrompt(req, cfg, promptOcr);

  let raw: string;
  try {
    raw = await dispatchProvider(prompt, cfg);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`  ⚠️  ${msg}\n`);
    return fallback;
  }

  if (!raw) return fallback;

  const data = parseJsonSafe(raw) as { tags?: unknown; comment?: unknown };
  const rawTags = Array.isArray(data.tags) ? data.tags : [];

  const evidence = (req.fileName + ' ' + req.ocrText).toLowerCase();
  const cleaned: string[] = [];
  const allowedSet = new Set([...cfg.tags.allowed, cfg.tags.autoTag]);
  for (const t of rawTags) {
    const n = normalizeTag(t, cfg, cfg.tags.freeForm);
    if (!n) continue;
    if (isStrictTag(n, cfg)) {
      if (strictTagHasEvidence(n, evidence, cfg)) cleaned.push(n);
    } else {
      cleaned.push(n);
    }
    if (cfg.tags.freeForm && !allowedSet.has(n)) {
      discovery?.record(n);
    }
  }

  applyContextualGuards(cleaned, req, cfg, evidence);

  const strictFound = cleaned.filter(t => isStrictTag(t, cfg));
  const restLlm = cleaned.filter(t => !isStrictTag(t, cfg));
  let final = mergeTags(cfg, strictFound, req.preTags, restLlm);

  if (req.ext === '.pdf' && req.ocrText.trim() && !final.includes('#Skan')) {
    final = mergeTags(cfg, final, ['#Skan']);
  }

  let comment = typeof data.comment === 'string' ? data.comment.trim() : '';
  if (isBadComment(comment)) {
    comment = `Plik: ${req.fileName}.`;
  }

  if (masker && sessionId && comment) {
    try {
      comment = await masker.unmask(comment, sessionId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`  ⚠️  Unmask failed: ${msg}\n`);
    }
  }

  return {
    tags: final.slice(0, 6),
    comment: comment.slice(0, 500),
  };
}

export async function inferTaxonomy(
  samples: SampledFile[],
  langs: LanguageCode[],
  userContext: string,
  cfg: Config,
  hint?: string,
): Promise<Taxonomy> {
  const prompt = buildTaxonomyPrompt(samples, langs, userContext, hint);
  // Taksonomia to duży JSON (8-15 kategorii z aliasami, evidence, examples) —
  // domyślne 300 tokenów ucinają output w połowie. Wymuszamy 2000.
  const taxCfg: Config = { ...cfg, llm: { ...cfg.llm, numPredict: Math.max(cfg.llm.numPredict, 2000) } };
  const raw = await dispatchProvider(prompt, taxCfg);
  const data = parseJsonSafe(raw) as { categories?: unknown; summary?: unknown };
  const categories = Array.isArray(data.categories) ? data.categories : [];

  const parsed: TaxonomyCategory[] = [];
  for (const c of categories) {
    if (!c || typeof c !== 'object') continue;
    const obj = c as Record<string, unknown>;
    const name = typeof obj.name === 'string' ? obj.name.trim() : '';
    if (!name) continue;
    const normalized = name.startsWith('#') ? name : `#${name}`;
    if (!TAG_SHAPE.test(normalized)) continue;
    parsed.push({
      name: normalized,
      description: typeof obj.description === 'string' ? obj.description : '',
      aliases: Array.isArray(obj.aliases)
        ? obj.aliases.filter((x): x is string => typeof x === 'string').map(s => s.startsWith('#') ? s : `#${s}`)
        : [],
      strictEvidence: Array.isArray(obj.strict_evidence)
        ? obj.strict_evidence.filter((x): x is string => typeof x === 'string')
        : [],
      isStrict: Boolean(obj.is_strict),
      examples: Array.isArray(obj.examples)
        ? obj.examples.filter((x): x is string => typeof x === 'string')
        : [],
    });
  }

  return {
    categories: parsed,
    summary: typeof data.summary === 'string' ? data.summary : '',
  };
}

function isBadComment(c: string): boolean {
  if (!c) return true;
  const low = c.toLowerCase();
  if (BAD_COMMENT_PHRASES.some(p => low.includes(p))) return true;
  if (low.length < 10) return true;
  return false;
}

function applyContextualGuards(
  cleaned: string[],
  req: LlmRequest,
  cfg: Config,
  evidence: string,
): void {
  const financialBlock = new Set(['#Bank', '#Kredyt', '#KartaKredytowa', '#Wyciag', '#Podatki']);
  const preSet = new Set(req.preTags);
  const isCv = preSet.has('#CV');
  const noOcr = !req.ocrText.trim() && ['.png', '.jpg', '.jpeg', '.webp', '.heic'].includes(req.ext);

  const remove = (predicate: (t: string) => boolean): void => {
    for (let i = cleaned.length - 1; i >= 0; i--) {
      if (predicate(cleaned[i])) cleaned.splice(i, 1);
    }
  };

  if (isCv) remove(t => financialBlock.has(t));

  const strictSet = new Set(cfg.tags.strict);
  if (noOcr) remove(t => strictSet.has(t));

  if (cleaned.includes('#Bank')) {
    const bankKeywords = ['bank', 'iban', 'rachunek', 'wyciąg', 'prowizja', 'account'];
    if (!bankKeywords.some(k => evidence.includes(k))) {
      const idx = cleaned.indexOf('#Bank');
      if (idx >= 0) cleaned.splice(idx, 1);
    }
  }

  if (cleaned.includes('#Grafika') && cleaned.includes('#CV')) {
    const idx = cleaned.indexOf('#CV');
    if (idx >= 0) cleaned.splice(idx, 1);
  }
}
