import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CircuitBreaker,
  isIdempotentMethod,
  parseRetryAfterMs,
} from '../../src/common/http-resilience';
import { TtlCache } from '../../src/common/ttl-cache';
import { GitLabClient, resetGitLabCircuitBreakers } from '../../src/integrations/gitlab/gitlab.client';
import {
  OpenProjectClient,
  resetOpenProjectCircuitBreakers,
} from '../../src/integrations/openproject/openproject.client';
import { DEFAULT_OPENPROJECT_MAPPING, mapWorkPackage } from '../../src/integrations/openproject/openproject.mapper';

test('parseRetryAfterMs parses seconds, caps at maxMs, and rejects invalid headers', () => {
  assert.equal(parseRetryAfterMs('3'), 3000);
  assert.equal(parseRetryAfterMs('120', 30_000), 30_000);
  assert.equal(parseRetryAfterMs(''), null);
  assert.equal(parseRetryAfterMs('not-a-date'), null);
});

test('isIdempotentMethod allows GET/HEAD and excludes POST/PATCH', () => {
  assert.equal(isIdempotentMethod('GET'), true);
  assert.equal(isIdempotentMethod('head'), true);
  assert.equal(isIdempotentMethod('POST'), false);
  assert.equal(isIdempotentMethod('PATCH'), false);
});

test('CircuitBreaker opens at threshold and resets after cooldown + success', () => {
  let now = 1_000;
  const cb = new CircuitBreaker(3, 5_000, () => now);
  cb.assertClosed('OP');
  cb.recordFailure();
  cb.recordFailure();
  assert.equal(cb.isOpen(), false);
  cb.recordFailure();
  assert.equal(cb.isOpen(), true);
  assert.throws(() => cb.assertClosed('OP'), /circuit breaker open/);

  now += 5_001;
  assert.equal(cb.isOpen(), false);
  cb.assertClosed('OP');
  cb.recordSuccess();
  assert.equal(cb.isOpen(), false);
});

test('OpenProjectClient retries idempotent GET on 500/429 and never retries POST mutations', async () => {
  resetOpenProjectCircuitBreakers();
  let getCalls = 0;
  const mockGetFetch: typeof fetch = async () => {
    getCalls += 1;
    if (getCalls === 1) {
      return new Response('rate limit', { status: 429, headers: { 'Retry-After': '0' } });
    }
    return new Response(JSON.stringify({ id: 42, subject: 'Demo' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const opGet = new OpenProjectClient('https://op.example.test', 'tok', mockGetFetch);
  const wp = await opGet.getWorkPackage(42);
  assert.equal(wp.id, 42);
  assert.equal(getCalls, 2);

  let postCalls = 0;
  const mockPostFetch: typeof fetch = async () => {
    postCalls += 1;
    return new Response('server error', { status: 500 });
  };
  const opPost = new OpenProjectClient('https://op-post.example.test', 'tok', mockPostFetch);
  await assert.rejects(() => opPost.postActivityComment(42, 'hello'), /OpenProject 500/);
  assert.equal(postCalls, 1);
});

test('GitLabClient never retries POST mutations on 500', async () => {
  resetGitLabCircuitBreakers();
  let postCalls = 0;
  const mockFetch: typeof fetch = async () => {
    postCalls += 1;
    return new Response('boom', { status: 502 });
  };
  const gl = new GitLabClient('https://gl.example.test', 'tok', mockFetch);
  await assert.rejects(() => gl.createBranch(10, { branch: 'feat/x', ref: 'main' }), /GitLab 502/);
  assert.equal(postCalls, 1);
});

test('TtlCache.getOrSet deduplicates concurrent in-flight factory calls', async () => {
  const cache = new TtlCache<number>(10_000, 10);
  let runs = 0;
  const factory = async () => {
    runs += 1;
    await new Promise((r) => setTimeout(r, 15));
    return 99;
  };
  const [a, b] = await Promise.all([cache.getOrSet('k', factory), cache.getOrSet('k', factory)]);
  assert.equal(a, 99);
  assert.equal(b, 99);
  assert.equal(runs, 1);
});

test('mapWorkPackage preserves opUpdatedAt from OpenProject WP for N+1 prevention', () => {
  const mapped = mapWorkPackage(
    {
      id: 101,
      subject: 'Sync check',
      updatedAt: '2026-11-26T09:15:00Z',
      createdAt: '2026-11-20T09:00:00Z',
      _links: {
        status: { title: 'In Progress' },
        type: { title: 'DEV-Feature' },
        project: { title: 'Core' },
      },
    },
    {
      mapping: DEFAULT_OPENPROJECT_MAPPING,
      hoursPerMd: 6.5,
      personByOpUser: new Map(),
      spentHours: new Map(),
      today: '2026-11-26',
    },
  );
  assert.equal(mapped.opUpdatedAt, '2026-11-26T09:15:00Z');
});
