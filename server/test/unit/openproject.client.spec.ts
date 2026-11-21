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

  it('searchWorkPackages sends subjectOrId filter', async () => {
    let calledUrl = '';
    const fetchImpl: typeof fetch = async (input) => {
      calledUrl = String(input);
      return new Response(
        JSON.stringify({
          _embedded: { elements: [{ id: 55, subject: 'Fix login' }] },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };
    const client = new OpenProjectClient('https://op.example', 'token', fetchImpl);
    const found = await client.searchWorkPackages('login');
    assert.equal(found.length, 1);
    assert.equal(found[0]?.id, 55);
    assert.ok(calledUrl.includes('subjectOrId'));
    assert.ok(decodeURIComponent(calledUrl).includes('"operator":"**"'));
  });

  it('getWorkPackageRelations returns relation list', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          _embedded: {
            elements: [
              {
                id: 1,
                type: 'blocks',
                _links: {
                  from: { href: '/api/v3/work_packages/10', title: 'A' },
                  to: { href: '/api/v3/work_packages/20', title: 'B' },
                },
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const client = new OpenProjectClient('https://op.example', 'token', fetchImpl);
    const rels = await client.getWorkPackageRelations(10);
    assert.equal(rels.length, 1);
    assert.equal(rels[0]?.type, 'blocks');
  });

  it('createTimeEntry POSTs ISO hours and work package link', async () => {
    let method = '';
    let body = '';
    const fetchImpl: typeof fetch = async (_input, init) => {
      method = init?.method ?? 'GET';
      body = typeof init?.body === 'string' ? init.body : '';
      return new Response(JSON.stringify({ id: 9, hours: 'PT2H', spentOn: '2026-11-20' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const client = new OpenProjectClient('https://op.example', 'token', fetchImpl);
    const entry = await client.createTimeEntry({
      workPackageId: 42,
      hours: 'PT2H',
      spentOn: '2026-11-20',
      comment: 'dev work',
    });
    assert.equal(entry.id, 9);
    assert.equal(method, 'POST');
    const parsed = JSON.parse(body) as {
      hours: string;
      spentOn: string;
      _links: { workPackage: { href: string } };
      comment: { raw: string };
    };
    assert.equal(parsed.hours, 'PT2H');
    assert.equal(parsed.spentOn, '2026-11-20');
    assert.equal(parsed._links.workPackage.href, '/api/v3/work_packages/42');
    assert.equal(parsed.comment.raw, 'dev work');
  });

  it('listTimeEntries filters by user and spentOn range', async () => {
    let calledUrl = '';
    const fetchImpl: typeof fetch = async (input) => {
      calledUrl = String(input);
      return new Response(JSON.stringify({ _embedded: { elements: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const client = new OpenProjectClient('https://op.example', 'token', fetchImpl);
    await client.listTimeEntries({
      userId: 7,
      spentFrom: '2026-11-17',
      spentTo: '2026-11-21',
    });
    const decoded = decodeURIComponent(calledUrl);
    assert.ok(decoded.includes('"user"'));
    assert.ok(decoded.includes('"spentOn"'));
    assert.ok(decoded.includes('7'));
  });

  it('listMemberships filters by project', async () => {
    let calledUrl = '';
    const fetchImpl: typeof fetch = async (input) => {
      calledUrl = String(input);
      return new Response(
        JSON.stringify({
          total: 1,
          count: 1,
          pageSize: 100,
          offset: 1,
          _embedded: {
            elements: [
              {
                id: 1,
                _links: {
                  principal: { title: 'Alice', href: '/api/v3/users/1' },
                  project: { title: 'Demo', href: '/api/v3/projects/demo' },
                  roles: [{ title: 'Member' }],
                },
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };
    const client = new OpenProjectClient('https://op.example', 'token', fetchImpl);
    const items = await client.listMemberships({ project: 'demo' });
    assert.equal(items.length, 1);
    assert.equal(items[0]?._links?.principal?.title, 'Alice');
    assert.ok(calledUrl.includes('/api/v3/memberships'));
    assert.ok(decodeURIComponent(calledUrl).includes('"project"'));
  });
});
