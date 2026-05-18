export interface PathRule {
  pattern: string;
  flags?: string;
  tags: string[];
}

export type OrganizeStrategy = 'flat' | 'nested' | 'custom';
export type OrganizeUnsorted = 'keep' | 'move' | 'skip';
export type OrganizeMultiTag = 'primary';

export interface OrganizeConfig {
  enabled: boolean;
  target: string;
  strategy: OrganizeStrategy;
  priority: string[];
  folderMap: Record<string, string>;
  unsorted: OrganizeUnsorted;
  unsortedFolder: string;
  multiTag: OrganizeMultiTag;
}

export interface Config {
  scan: {
    folder: string;
    excludeFolders: string[];
    skipExtensions: string[];
    ocrExtensions: string[];
    videoExtensions: string[];
  };
  ocr: {
    maxChars: number;
    llmMaxChars: number;
    startPage: number;
    maxPages: number;
  };
  llm: {
    provider: 'ollama' | 'anthropic' | 'openai';
    model: string;
    temperature: number;
    numPredict: number;
    ollamaUrl: string;
    apiKey?: string;
  };
  mask: {
    enabled: boolean;
    lang: 'en' | 'pl';
  };
  dedup: {
    enabled: boolean;
    maxFileSizeMB: number;
  };
  tags: {
    allowed: string[];
    strict: string[];
    aliases: Record<string, string>;
    strictEvidence: Record<string, string[]>;
    pathRules: PathRule[];
    autoTag: string;
    freeForm: boolean;
  };
  organize: OrganizeConfig;
  context: string;
}

export interface FileMetadata {
  tags: string[];
  comment: string;
}

export interface ProcessStats {
  ok: number;
  preOnly: number;
  skipped: number;
  errors: number;
  total: number;
}

export type LlmRequest = {
  fileName: string;
  ext: string;
  preTags: string[];
  ocrText: string;
};

export interface TaxonomyCategory {
  name: string;
  description: string;
  aliases: string[];
  strictEvidence: string[];
  isStrict: boolean;
  examples: string[];
}

export interface Taxonomy {
  categories: TaxonomyCategory[];
  summary: string;
}

export interface SampledFile {
  path: string;
  name: string;
  ext: string;
  ocrText: string;
}

export type LanguageCode = 'pl' | 'en';

export interface LanguageDetectionResult {
  dominant: LanguageCode;
  scores: Record<LanguageCode, number>;
  bilingual: boolean;
}
