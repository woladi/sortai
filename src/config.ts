import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { z } from 'zod';
import { DEFAULT_CONFIG } from './defaults.js';
import type { Config } from './types.js';

const PathRuleSchema = z.object({
  pattern: z.string(),
  flags: z.string().optional(),
  tags: z.array(z.string()),
});

const ConfigSchema = z.object({
  scan: z.object({
    folder: z.string(),
    excludeFolders: z.array(z.string()),
    skipExtensions: z.array(z.string()),
    ocrExtensions: z.array(z.string()),
    videoExtensions: z.array(z.string()),
  }),
  ocr: z.object({
    maxChars: z.number().int().positive(),
    llmMaxChars: z.number().int().positive(),
    startPage: z.number().int().positive().default(1),
    maxPages: z.number().int().positive().default(2),
  }),
  llm: z.object({
    provider: z.enum(['ollama', 'anthropic', 'openai']),
    model: z.string(),
    temperature: z.number(),
    numPredict: z.number().int().positive(),
    ollamaUrl: z.string().url(),
    apiKey: z.string().optional(),
  }),
  mask: z.object({
    enabled: z.boolean(),
    lang: z.enum(['en', 'pl']),
  }),
  dedup: z.object({
    enabled: z.boolean().default(true),
    maxFileSizeMB: z.number().int().positive().default(200),
  }).default({ enabled: true, maxFileSizeMB: 200 }),
  tags: z.object({
    allowed: z.array(z.string()),
    strict: z.array(z.string()),
    aliases: z.record(z.string(), z.string()),
    strictEvidence: z.record(z.string(), z.array(z.string())),
    pathRules: z.array(PathRuleSchema),
    autoTag: z.string(),
  }),
  context: z.string(),
});

export const DEFAULT_CONFIG_PATH = path.join(
  process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'),
  'sortai',
  'config.json',
);

export function expandHome(p: string): string {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

export async function loadConfig(customPath?: string): Promise<{ config: Config; path: string; created: boolean }> {
  const cfgPath = customPath ? path.resolve(expandHome(customPath)) : DEFAULT_CONFIG_PATH;

  if (!existsSync(cfgPath)) {
    await fs.mkdir(path.dirname(cfgPath), { recursive: true });
    await fs.writeFile(cfgPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
    return { config: DEFAULT_CONFIG, path: cfgPath, created: true };
  }

  const raw = await fs.readFile(cfgPath, 'utf8');
  const parsed = JSON.parse(raw);
  const config = ConfigSchema.parse(parsed);
  return { config, path: cfgPath, created: false };
}
