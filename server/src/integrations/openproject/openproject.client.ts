import { idFromHref, OpActivity, OpWorkPackage } from './openproject.mapper';

export interface OpCollection<T> {
  _embedded?: { elements?: T[] };
  total?: number;
  count?: number;
  pageSize?: number;
  offset?: number;
}

export interface OpUser {
  id: number;
  name?: string;
  login?: string;
  email?: string;
}

export interface OpTimeEntry {
  id: number;
  hours?: string | null;
  spentOn?: string;
  _links?: { workPackage?: { href?: string | null } };
}

export class OpenProjectClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async listWorkPackages(params: {
    pageSize?: number;
    offset?: number;
    updatedSince?: string | null;
    projects?: string[];
  }): Promise<OpCollection<OpWorkPackage>> {
    const filters: unknown[] = [];
    if (params.updatedSince) {
      const now = new Date().toISOString();
      filters.push({ updatedAt: { operator: '<>d', values: [params.updatedSince, now] } });
    }
    if (params.projects && params.projects.length > 0) {
      filters.push({ project: { operator: '=', values: params.projects } });
    }
    const query = new URLSearchParams({
      pageSize: String(params.pageSize ?? 100),
      offset: String(params.offset ?? 1),
    });
    if (filters.length > 0) {
      query.set('filters', JSON.stringify(filters));
    }
    return this.get<OpCollection<OpWorkPackage>>(`/api/v3/work_packages?${query.toString()}`);
  }

  async *paginateWorkPackages(params: {
    updatedSince?: string | null;
    projects?: string[];
    pageSize?: number;
  }): AsyncGenerator<OpWorkPackage> {
    const pageSize = params.pageSize ?? 100;
    let offset = 1;
    for (;;) {
      const page = await this.listWorkPackages({ ...params, pageSize, offset });
      const elements = page._embedded?.elements ?? [];
      for (const item of elements) {
        yield item;
      }
      if (elements.length < pageSize) {
        break;
      }
      offset += pageSize;
    }
  }

  async listTimeEntries(params: {
    pageSize?: number;
    offset?: number;
    spentFrom?: string | null;
    spentTo?: string | null;
  }): Promise<OpCollection<OpTimeEntry>> {
    const filters: unknown[] = [];
    if (params.spentFrom || params.spentTo) {
      filters.push({
        spentOn: {
          operator: '<>d',
          values: [params.spentFrom ?? '1970-01-01', params.spentTo ?? new Date().toISOString().slice(0, 10)],
        },
      });
    }
    const query = new URLSearchParams({
      pageSize: String(params.pageSize ?? 200),
      offset: String(params.offset ?? 1),
    });
    if (filters.length > 0) {
      query.set('filters', JSON.stringify(filters));
    }
    return this.get<OpCollection<OpTimeEntry>>(`/api/v3/time_entries?${query.toString()}`);
  }

  async *paginateTimeEntries(params: {
    spentFrom?: string | null;
    spentTo?: string | null;
    pageSize?: number;
  }): AsyncGenerator<OpTimeEntry> {
    const pageSize = params.pageSize ?? 200;
    let offset = 1;
    for (;;) {
      const page = await this.listTimeEntries({ ...params, pageSize, offset });
      const elements = page._embedded?.elements ?? [];
      for (const item of elements) {
        yield item;
      }
      if (elements.length < pageSize) {
        break;
      }
      offset += pageSize;
    }
  }

  async getActivities(workPackageId: number): Promise<OpActivity[]> {
    const data = await this.get<OpCollection<OpActivity>>(
      `/api/v3/work_packages/${workPackageId}/activities?pageSize=200`,
    );
    return data._embedded?.elements ?? [];
  }

  async getUser(userId: number): Promise<OpUser | null> {
    try {
      return await this.get<OpUser>(`/api/v3/users/${userId}`);
    } catch {
      return null;
    }
  }

  workPackageIdFromTimeEntry(entry: OpTimeEntry): number | null {
    return idFromHref(entry._links?.workPackage?.href);
  }

  private async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  private async request<T>(path: string, init: RequestInit, attempt = 0): Promise<T> {
    const url = `${this.baseUrl.replace(/\/+$/, '')}${path}`;
    const auth = Buffer.from(`apikey:${this.token}`).toString('base64');
    const response = await this.fetchImpl(url, {
      ...init,
      headers: {
        Accept: 'application/hal+json, application/json',
        Authorization: `Basic ${auth}`,
        ...(init.headers ?? {}),
      },
    });
    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      const wait = Math.min(8_000, 500 * 2 ** attempt);
      await sleep(wait);
      return this.request<T>(path, init, attempt + 1);
    }
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenProject ${response.status} ${path}: ${body.slice(0, 300)}`);
    }
    return (await response.json()) as T;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
