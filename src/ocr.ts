import path from 'node:path';
import { ocr } from 'macos-vision';
import type { Config } from './types.js';

export async function extractOcrText(filePath: string, cfg: Config): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (!cfg.scan.ocrExtensions.includes(ext)) return '';

  try {
    const text = (await ocr(filePath)) as string;
    return text.slice(0, cfg.ocr.maxChars);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`  ⚠️  OCR error for ${filePath}: ${msg}\n`);
    return '';
  }
}
