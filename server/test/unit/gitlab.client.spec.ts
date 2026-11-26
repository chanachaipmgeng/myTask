import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GitLabClient } from '../../src/integrations/gitlab/gitlab.client';

describe('GitLabClient', () => {
  it('paginates with x-next-page until exhausted', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      const pageMatch = /(?:\?|&)page=(\d+)/.exec(url);
      const page = pageMatch ? Number(pageMatch[1]) : 1;
      if (page === 1) {
        return new Response(JSON.stringify([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'x-next-page': '2' },
        });
      }
      if (page === 2) {
        return new Response(JSON.stringify([{ id: 3, name: 'C' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('unexpected', { status: 500 });
    };

    const client = new GitLabClient('https://gl.example', 'token', fetchImpl);
    const projects = await client.listProjects();
    assert.equal(projects.length, 3);
    assert.equal(projects[2]?.id, 3);
    assert.ok(calls.length >= 2);
  });

  it('computes commit span from first to last commit date', () => {
    const span = GitLabClient.commitSpan([
      { committed_date: '2026-11-10T08:00:00Z' },
      { created_at: '2026-11-12T09:00:00Z' },
      { committed_date: '2026-11-08T07:00:00Z' },
    ]);
    assert.equal(span.firstCommitOn, '2026-11-08');
    assert.equal(span.lastCommitOn, '2026-11-12');
    assert.equal(span.commitCount, 3);
  });

  it('summarizes discussions into review rounds and unresolved threads', () => {
    const summary = GitLabClient.discussionSummary([
      {
        notes: [
          { system: false, resolvable: true, resolved: true, body: 'nit' },
          { system: false, resolvable: true, resolved: false, body: 'fix please' },
        ],
      },
      {
        individual_note: true,
        notes: [{ system: false, resolvable: false, body: 'lgtm' }],
      },
      {
        notes: [{ system: true, body: 'approved' }],
      },
    ]);
    assert.equal(summary.unresolvedThreads, 1);
    assert.ok(summary.reviewRounds >= 1);
    assert.equal(summary.noteCount, 3);
  });

  it('maps latest pipeline status to CI status', () => {
    assert.equal(GitLabClient.latestCiStatus([{ status: 'success' }]), 'passed');
    assert.equal(GitLabClient.latestCiStatus([{ status: 'failed' }]), 'failed');
    assert.equal(GitLabClient.latestCiStatus([{ status: 'running' }]), 'running');
    assert.equal(GitLabClient.latestCiStatus([]), 'unknown');
  });

  it('fetches MR commits and pipelines paths', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      return new Response(JSON.stringify([{ id: 'abc', committed_date: '2026-11-01T00:00:00Z' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const client = new GitLabClient('https://gl.example', 'tok', fetchImpl);
    const commits = await client.getMrCommits(42, 7);
    assert.equal(commits.length, 1);
    assert.ok(calls[0]?.includes('/projects/42/merge_requests/7/commits'));
  });

  it('creates a branch via POST repository/branches', async () => {
    const calls: { url: string; method: string }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, method: String(init?.method ?? 'GET') });
      return new Response(
        JSON.stringify({
          name: 'feat/OP-1-demo',
          web_url: 'https://gl.example/group/proj/-/tree/feat/OP-1-demo',
          commit: { short_id: 'abc1234', title: 'init' },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    };
    const client = new GitLabClient('https://gl.example', 'tok', fetchImpl);
    const branch = await client.createBranch(99, { branch: 'feat/OP-1-demo', ref: 'main' });
    assert.equal(branch.name, 'feat/OP-1-demo');
    assert.equal(calls[0]?.method, 'POST');
    assert.ok(calls[0]?.url.includes('/projects/99/repository/branches'));
    assert.ok(calls[0]?.url.includes('branch=feat%2FOP-1-demo'));
    assert.ok(calls[0]?.url.includes('ref=main'));
  });
});
