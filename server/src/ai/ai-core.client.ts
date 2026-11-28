/**
 * Minimal fetch client for shared ai-core-service (Phase 1 LLM generate).
 * Enabled only when both AI_CORE_URL and AI_CORE_API_KEY are set (2A flag).
 */

export type AiCoreLlmMessage = {
  role: 'user' | 'assistant' | 'model' | 'system';
  content: string;
};

export type AiCoreGenerateOptions = {
  system?: string;
  mode?: 'answer' | 'light';
  temperature?: number;
  maxOutputTokens?: number;
  model?: string;
  timeoutMs?: number;
};

export type AiCoreGenerateResult = {
  text: string;
  model: string;
  provider: string;
};

export function aiCoreEnabled(url?: string | null, apiKey?: string | null): boolean {
  return Boolean((url ?? '').trim() && (apiKey ?? '').trim());
}

export class AiCoreClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private root(): string {
    return this.baseUrl.replace(/\/+$/, '');
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  async health(): Promise<{ status: string }> {
    const res = await fetch(`${this.root()}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`ai-core health ${res.status}`);
    return (await res.json()) as { status: string };
  }

  async generate(
    messages: AiCoreLlmMessage[],
    opts: AiCoreGenerateOptions = {},
  ): Promise<AiCoreGenerateResult> {
    const res = await fetch(`${this.root()}/v1/llm/generate`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        messages,
        system: opts.system,
        mode: opts.mode ?? 'answer',
        temperature: opts.temperature ?? 0.2,
        maxOutputTokens: opts.maxOutputTokens ?? 1024,
        model: opts.model,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`ai-core generate ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as AiCoreGenerateResult;
  }
}

export function createAiCoreClient(url: string, apiKey: string): AiCoreClient {
  return new AiCoreClient(url.trim(), apiKey.trim());
}
