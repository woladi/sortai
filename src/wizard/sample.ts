import path from 'node:path';
import { walkFiles } from '../walker.js';
import { extractOcrText } from '../ocr.js';
import type { Config, SampledFile } from '../types.js';

export interface SampleOptions {
  count: number;
  ocrEligibleOnly: boolean;
  seed?: number;
}

function shuffle<T>(arr: T[], seed?: number): T[] {
  const out = arr.slice();
  let s = seed ?? Date.now();
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export async function pickSampleFiles(
  root: string,
  cfg: Config,
  opts: SampleOptions,
): Promise<string[]> {
  const all = await walkFiles(root, cfg);
  const ocrSet = new Set(cfg.scan.ocrExtensions);
  const filtered = opts.ocrEligibleOnly
    ? all.filter(f => ocrSet.has(path.extname(f).toLowerCase()))
    : all;
  return shuffle(filtered, opts.seed).slice(0, opts.count);
}

export async function ocrSamples(
  files: string[],
  cfg: Config,
  onProgress?: (done: number, total: number, file: string) => void,
): Promise<SampledFile[]> {
  const out: SampledFile[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const ext = path.extname(f).toLowerCase();
    onProgress?.(i, files.length, f);
    let text = '';
    if (cfg.scan.ocrExtensions.includes(ext)) {
      text = await extractOcrText(f, cfg);
    }
    out.push({
      path: f,
      name: path.basename(f),
      ext,
      ocrText: text,
    });
  }
  onProgress?.(files.length, files.length, '');
  return out;
}
