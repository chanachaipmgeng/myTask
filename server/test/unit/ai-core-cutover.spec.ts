import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { aiCoreEnabled, AiCoreClient } from '../../src/ai/ai-core.client';
import { readConfig } from '../../src/config';

describe('ai-core cutover (2A flag)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restoreAll();
  });

  it('aiCoreEnabled requires both URL and API key', () => {
    assert.equal(aiCoreEnabled('', ''), false);
    assert.equal(aiCoreEnabled('http://127.0.0.1:8088', ''), false);
    assert.equal(aiCoreEnabled('', 'dev-key'), false);
    assert.equal(aiCoreEnabled('http://127.0.0.1:8088', 'dev-key'), true);
    assert.equal(aiCoreEnabled('  http://127.0.0.1:8088/  ', '  key  '), true);
  });

  it('readConfig maps AI_CORE_URL and AI_CORE_API_KEY', () => {
    const off = readConfig({
      NODE_ENV: 'development',
      TOKEN_ENC_KEY: 'dev-only-insecure-key-change-me-please',
    });
    assert.equal(off.aiCoreUrl, '');
    assert.equal(off.aiCoreApiKey, '');
    assert.equal(aiCoreEnabled(off.aiCoreUrl, off.aiCoreApiKey), false);

    const on = readConfig({
      NODE_ENV: 'development',
      TOKEN_ENC_KEY: 'dev-only-insecure-key-change-me-please',
      AI_CORE_URL: 'http://127.0.0.1:8088/',
      AI_CORE_API_KEY: 'dev-key',
    });
    assert.equal(on.aiCoreUrl, 'http://127.0.0.1:8088');
    assert.equal(on.aiCoreApiKey, 'dev-key');
    assert.equal(aiCoreEnabled(on.aiCoreUrl, on.aiCoreApiKey), true);
  });

  it('AiCoreClient.generate posts to /v1/llm/generate with X-API-Key', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({ text: 'สวัสดีจาก ai-core', model: 'gemini-flash', provider: 'gemini' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    const client = new AiCoreClient('http://ai-core.test/', 'secret-key');
    const result = await client.generate([{ role: 'user', content: 'สรุปงาน' }], {
      system: 'คุณคือผู้ช่วย myTask',
      mode: 'answer',
      temperature: 0.1,
      maxOutputTokens: 256,
    });

    assert.equal(result.text, 'สวัสดีจาก ai-core');
    assert.equal(result.provider, 'gemini');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, 'http://ai-core.test/v1/llm/generate');
    const headers = calls[0]?.init?.headers as Record<string, string>;
    assert.equal(headers['X-API-Key'], 'secret-key');
    assert.equal(headers['Content-Type'], 'application/json');
    const body = JSON.parse(String(calls[0]?.init?.body ?? '{}')) as {
      messages: unknown[];
      system?: string;
      mode?: string;
    };
    assert.equal(body.system, 'คุณคือผู้ช่วย myTask');
    assert.equal(body.mode, 'answer');
    assert.deepEqual(body.messages, [{ role: 'user', content: 'สรุปงาน' }]);
  });

  it('AiCoreClient.generate throws on non-OK so callers can fall back to rule-based', async () => {
    globalThis.fetch = (async () =>
      new Response('upstream down', { status: 502 })) as typeof fetch;

    const client = new AiCoreClient('http://ai-core.test', 'secret-key');
    await assert.rejects(() => client.generate([{ role: 'user', content: 'hi' }]), /502/);
  });

  it('flag-off path: empty AI_CORE_* keeps gemini-only config semantics', () => {
    const cfg = readConfig({
      NODE_ENV: 'development',
      TOKEN_ENC_KEY: 'dev-only-insecure-key-change-me-please',
      GEMINI_API_KEY: 'direct-gemini-key',
      AI_CORE_URL: '',
      AI_CORE_API_KEY: '',
    });
    assert.equal(aiCoreEnabled(cfg.aiCoreUrl, cfg.aiCoreApiKey), false);
    assert.equal(cfg.geminiApiKey, 'direct-gemini-key');
  });
});
