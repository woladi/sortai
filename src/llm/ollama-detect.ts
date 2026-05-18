export interface OllamaModel {
  name: string;
  size: number;
  modified: string;
}

export interface OllamaProbeResult {
  reachable: boolean;
  models: OllamaModel[];
  error?: string;
}

export async function probeOllama(url: string, timeoutMs = 2_000): Promise<OllamaProbeResult> {
  const base = url.replace(/\/$/, '');
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/api/tags`, { signal: controller.signal });
    if (!res.ok) {
      return { reachable: false, models: [], error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as { models?: Array<{ name?: unknown; size?: unknown; modified_at?: unknown }> };
    const models: OllamaModel[] = (data.models ?? [])
      .filter((m): m is { name: string; size: number; modified_at: string } =>
        typeof m.name === 'string' && typeof m.size === 'number' && typeof m.modified_at === 'string')
      .map(m => ({ name: m.name, size: m.size, modified: m.modified_at }));
    return { reachable: true, models };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { reachable: false, models: [], error: msg };
  } finally {
    clearTimeout(t);
  }
}

export function modelSizeLabel(bytes: number): string {
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(0)} MB`;
}

export const SUGGESTED_OLLAMA_MODELS = [
  { name: 'mistral-nemo', note: '12B — dobry baseline, szybkie' },
  { name: 'qwen2.5:14b', note: '14B — lepsza taksonomia' },
  { name: 'llama3.1', note: '8B — najszybsze, słabsze taksonomie' },
];
