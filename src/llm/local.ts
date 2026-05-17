import type { Config } from '../types.js';

export class OllamaUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OllamaUnavailableError';
  }
}

export async function callOllama(prompt: string, cfg: Config, timeoutMs = 90_000): Promise<string> {
  const url = `${cfg.llm.ollamaUrl.replace(/\/$/, '')}/api/generate`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.llm.model,
        prompt,
        stream: false,
        format: 'json',
        options: {
          temperature: cfg.llm.temperature,
          num_predict: cfg.llm.numPredict,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Ollama HTTP ${res.status}: ${await res.text().catch(() => '')}`);
    }
    const data = (await res.json()) as { response?: string };
    return (data.response ?? '').trim();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new OllamaUnavailableError(`Ollama timeout after ${timeoutMs}ms at ${url}`);
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new OllamaUnavailableError(`Ollama call failed: ${msg}`);
  } finally {
    clearTimeout(t);
  }
}
