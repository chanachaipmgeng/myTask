import { TtlCache } from '../../common/ttl-cache';
import { AppConfig } from '../../config';
import { connectionToken, getConnection } from '../../data/settings.repo';
import { Db } from '../../db/db.service';
import { GitLabClient, GitLabUserEvent } from './gitlab.client';

export const gitlabEventsCache = new TtlCache<GitLabUserEvent[]>(60_000);

export function encodeGitLabBaseUrl(baseUrl: string, projectIds: readonly string[]): string {
  if (projectIds.length === 0) {
    return baseUrl;
  }
  return `${baseUrl}#projects=${projectIds.join(',')}`;
}

export function parseGitLabBaseUrl(stored: string): { baseUrl: string; projectIds: string[] } {
  const [baseUrl = '', hash = ''] = stored.split('#projects=');
  const projectIds = hash
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return { baseUrl: baseUrl.trim(), projectIds };
}

export async function resolveGitLabConnection(
  db: Db,
  config: AppConfig,
): Promise<{
  client: GitLabClient;
  projectIds: string[];
  baseUrl: string;
} | null> {
  const connection = await getConnection(db, 'gitlab');
  const stored = parseGitLabBaseUrl(connection?.base_url ?? '');
  const baseUrl = (config.gitlab.url || stored.baseUrl).replace(/\/+$/, '');
  const projectIds =
    config.gitlab.projectIds.length > 0 ? config.gitlab.projectIds : stored.projectIds;
  const token =
    config.gitlab.apiToken ||
    connectionToken(connection, config.tokenEncKey, config.tokenEncKeyPrev);
  if (!baseUrl || !token) {
    return null;
  }
  return {
    client: new GitLabClient(baseUrl, token),
    projectIds,
    baseUrl,
  };
}
