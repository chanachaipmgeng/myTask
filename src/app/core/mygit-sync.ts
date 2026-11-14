import { Injectable } from '@angular/core';

/**
 * Local stand-in for mygit. The fixture is a file shipped with this app.
 * There is no repo host. Pull only: scores are never written back.
 * File counts are not read and are not a score.
 */
export const MYGIT_FIXTURE_PATH = '/fixtures/mygit-commits.json';

export interface MyGitCommit {
  sha: string;
  message: string;
  mergedAt: string;
  ticketId: string;
  reviewRounds: number;
  reopenCount: number;
}

export interface MyGitMatch {
  sha: string;
  message: string;
  mergedAt: string;
  ticketId: string;
  reviewRounds: number;
  reopenCount: number;
  reviewBefore: number | null;
  reviewAfter: number | null;
  mrLink?: string;
}

export interface MyGitUnmatched {
  sha: string;
  message: string;
  mergedAt: string;
  ticketId: string;
}

export interface MyGitSyncResult {
  matched: MyGitMatch[];
  unmatched: MyGitUnmatched[];
}

@Injectable({ providedIn: 'root' })
export class MyGitSyncAdapter {
  async pull(): Promise<MyGitCommit[]> {
    const response = await fetch(MYGIT_FIXTURE_PATH);
    if (!response.ok) {
      throw new Error('อ่านไฟล์ตัวอย่างของ mygit ไม่ได้');
    }
    const body: unknown = await response.json();
    return mapMyGitCommits(body);
  }
}

export function mapMyGitCommits(body: unknown): MyGitCommit[] {
  const records = commitRecords(body);
  const commits = records.map((record, index) => mapCommit(record, `รายการ ${index + 1}`));
  const seen = new Set<string>();
  for (const commit of commits) {
    if (seen.has(commit.sha)) {
      throw new Error(`sha ซ้ำ ${commit.sha}`);
    }
    seen.add(commit.sha);
  }
  return commits;
}

function commitRecords(body: unknown): unknown[] {
  if (Array.isArray(body)) {
    return body;
  }
  if (body && typeof body === 'object' && Array.isArray((body as { commits?: unknown }).commits)) {
    return (body as { commits: unknown[] }).commits;
  }
  throw new Error('ไฟล์ mygit ต้องเป็นรายการ commit');
}

function mapCommit(raw: unknown, label: string): MyGitCommit {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${label} ไม่ใช่ commit`);
  }
  const row = raw as Record<string, unknown>;
  const sha = requiredText(row['sha'], label, 'sha');
  return {
    sha,
    message: textValue(row['message']),
    mergedAt: textValue(row['mergedAt']),
    ticketId: textValue(row['ticketId']),
    reviewRounds: wholeNumber(row['reviewRounds'], label, 'reviewRounds'),
    reopenCount: wholeNumber(row['reopenCount'], label, 'reopenCount'),
  };
}

function requiredText(value: unknown, label: string, field: string): string {
  const text = textValue(value);
  if (!text) {
    throw new Error(`${label} ขาด ${field}`);
  }
  return text;
}

function textValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

function wholeNumber(value: unknown, label: string, field: string): number {
  const number = typeof value === 'number' ? value : Number(textValue(value));
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${label} ค่า ${field} ต้องเป็นจำนวนเต็มไม่ติดลบ`);
  }
  return number;
}
