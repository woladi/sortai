import Anthropic from '@anthropic-ai/sdk';
import type { Config } from '../types.js';

export class CloudLlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudLlmError';
  }
}

const SYSTEM_PROMPT =
  'You receive a Polish/English file-classification task. Respond with ONLY a valid JSON object ' +
  'matching {"tags": ["#Tag", ...], "comment": "..."}. No markdown, no commentary.';

export async function callAnthropic(prompt: string, cfg: Config): Promise<string> {
  if (!cfg.llm.apiKey) {
    throw new CloudLlmError('Missing API key for Anthropic provider. Pass --api-key or set ANTHROPIC_API_KEY.');
  }
  const client = new Anthropic({ apiKey: cfg.llm.apiKey });
  try {
    const msg = await client.messages.create({
      model: cfg.llm.model,
      max_tokens: Math.max(cfg.llm.numPredict, 512),
      temperature: cfg.llm.temperature,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();
    return text;
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    throw new CloudLlmError(`Anthropic call failed: ${m}`);
  }
}

export async function callOpenAi(prompt: string, cfg: Config): Promise<string> {
  if (!cfg.llm.apiKey) {
    throw new CloudLlmError('Missing API key for OpenAI provider. Pass --api-key or set OPENAI_API_KEY.');
  }
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.llm.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.llm.model,
        temperature: cfg.llm.temperature,
        max_tokens: Math.max(cfg.llm.numPredict, 512),
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI HTTP ${res.status}: ${await res.text().catch(() => '')}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return (data.choices?.[0]?.message?.content ?? '').trim();
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    throw new CloudLlmError(`OpenAI call failed: ${m}`);
  }
}
