import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { OpenProjectClient } from '../../src/integrations/openproject/openproject.client';

describe('OpenProjectClient.patchAssignee', () => {
  it('GETs lockVersion then PATCHes assignee href', async () => {
    const calls: { url: string; method: string; body?: string }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
      if (method === 'GET' && url.includes('/work_packages/42')) {
        return new Response(JSON.stringify({ id: 42, lockVersion: 7 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (method === 'PATCH') {
        return new Response(JSON.stringify({ id: 42, lockVersion: 8 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('unexpected', { status: 500 });
    };

    const client = new OpenProjectClient('https://op.example', 'token', fetchImpl);
    const wp = await client.getWorkPackage(42);
    assert.equal(wp.lockVersion, 7);
    const patched = await client.patchAssignee(42, 99, wp.lockVersion ?? 0);
    assert.equal(patched.lockVersion, 8);

    const patch = calls.find((c) => c.method === 'PATCH');
    assert.ok(patch);
    const body = JSON.parse(patch!.body ?? '{}') as {
      lockVersion: number;
      _links: { assignee: { href: string } };
    };
    assert.equal(body.lockVersion, 7);
    assert.equal(body._links.assignee.href, '/api/v3/users/99');
  });
});
