import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Config } from './types.js';

export class MaskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MaskError';
  }
}

interface MaskResult {
  maskedText: string;
  sessionId: string;
}

export class Masker {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private readonly cfg: Config;

  constructor(cfg: Config) {
    this.cfg = cfg;
  }

  async connect(): Promise<void> {
    if (this.client) return;
    this.transport = new StdioClientTransport({
      command: 'npx',
      args: ['-y', 'pseudonym-mcp', '--lang', this.cfg.mask.lang, '--engines', 'hybrid'],
    });
    this.client = new Client({ name: 'sortai', version: '0.1.0' }, { capabilities: {} });
    try {
      await this.client.connect(this.transport);
    } catch (err) {
      this.client = null;
      const m = err instanceof Error ? err.message : String(err);
      throw new MaskError(`Failed to start pseudonym-mcp: ${m}`);
    }
  }

  async mask(text: string): Promise<MaskResult> {
    if (!this.client) throw new MaskError('Masker not connected. Call connect() first.');
    const result = await this.client.callTool({
      name: 'mask_text',
      arguments: { text },
    });
    const parsed = extractJson(result);
    const maskedText = typeof parsed.masked_text === 'string' ? parsed.masked_text : text;
    const sessionId = typeof parsed.session_id === 'string' ? parsed.session_id : '';
    return { maskedText, sessionId };
  }

  async unmask(text: string, sessionId: string): Promise<string> {
    if (!this.client) throw new MaskError('Masker not connected. Call connect() first.');
    if (!sessionId) return text;
    const result = await this.client.callTool({
      name: 'unmask_text',
      arguments: { text, session_id: sessionId },
    });
    const parsed = extractJson(result);
    return typeof parsed.unmasked_text === 'string' ? parsed.unmasked_text :
           typeof parsed.text === 'string' ? parsed.text : text;
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close().catch(() => undefined);
      this.client = null;
    }
    this.transport = null;
  }
}

function extractJson(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object') return {};
  const r = result as { content?: Array<{ type?: string; text?: string }>; structuredContent?: unknown };
  if (r.structuredContent && typeof r.structuredContent === 'object') {
    return r.structuredContent as Record<string, unknown>;
  }
  const textBlock = r.content?.find(b => b.type === 'text' && typeof b.text === 'string');
  if (!textBlock?.text) return {};
  try {
    const parsed = JSON.parse(textBlock.text) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
