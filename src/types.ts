export interface PathRule {
  pattern: string;
  flags?: string;
  tags: string[];
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
  };
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
