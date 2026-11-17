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

  it('PATCHes startDate and dueDate with lockVersion via patchDates', async () => {
    const calls: { url: string; method: string; body?: string }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
      if (method === 'PATCH' && url.includes('/work_packages/42')) {
        return new Response(JSON.stringify({ id: 42, lockVersion: 10 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('unexpected', { status: 500 });
    };

    const client = new OpenProjectClient('https://op.example', 'token', fetchImpl);
    const patched = await client.patchDates(
      42,
      { startDate: '2026-11-10', dueDate: '2026-11-20' },
      9,
    );
    assert.equal(patched.lockVersion, 10);

    const patch = calls.find((c) => c.method === 'PATCH');
    assert.ok(patch);
    const body = JSON.parse(patch!.body ?? '{}') as {
      lockVersion: number;
      startDate?: string | null;
      dueDate?: string | null;
    };
    assert.equal(body.lockVersion, 9);
    assert.equal(body.startDate, '2026-11-10');
    assert.equal(body.dueDate, '2026-11-20');
  });

  it('listUsers and paginateUsers fetch users with pagination', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/api/v3/users') && url.includes('offset=1')) {
        return new Response(
          JSON.stringify({
            total: 3,
            count: 2,
            pageSize: 2,
            offset: 1,
            _embedded: {
              elements: [
                { id: 101, name: 'User 101', login: 'user1', email: 'u1@example.com' },
                { id: 102, name: 'User 102', login: 'user2', email: 'u2@example.com' },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/api/v3/users') && url.includes('offset=2')) {
        return new Response(
          JSON.stringify({
            total: 3,
            count: 1,
            pageSize: 2,
            offset: 2,
            _embedded: {
              elements: [
                { id: 103, name: 'User 103', login: 'user3', email: 'u3@example.com' },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('not found', { status: 404 });
    };

    const client = new OpenProjectClient('https://op.example', 'token', fetchImpl);
    const users: number[] = [];
    for await (const user of client.paginateUsers({ pageSize: 2 })) {
      users.push(user.id);
    }
    assert.deepEqual(users, [101, 102, 103]);
  });
});
