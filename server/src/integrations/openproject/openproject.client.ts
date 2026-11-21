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
  status?: string;
  admin?: boolean;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  _links?: {
    customField1?: { title?: string; href?: string };
    customField2?: { title?: string; href?: string };
    customField3?: { title?: string; href?: string };
    [key: string]: unknown;
  };
}

export interface OpTimeEntry {
  id: number;
  hours?: string | null;
  spentOn?: string;
  comment?: { raw?: string; html?: string } | string | null;
  _links?: {
    workPackage?: { href?: string | null; title?: string };
    user?: { href?: string | null; title?: string };
    project?: { href?: string | null; title?: string };
    activity?: { href?: string | null; title?: string };
  };
}

export interface OpRelation {
  id: number;
  type?: string;
  reverseType?: string;
  _links?: {
    from?: { href?: string | null; title?: string };
    to?: { href?: string | null; title?: string };
  };
}

export interface OpAttachment {
  id: number;
  fileName?: string;
  fileSize?: number;
  contentType?: string;
  createdAt?: string;
  _links?: {
    downloadLocation?: { href?: string | null };
    staticDownloadLocation?: { href?: string | null };
  };
}

export interface OpProject {
  id: number;
  name?: string;
  identifier?: string;
  active?: boolean;
  _links?: { self?: { href?: string } };
}

export interface OpStatus {
  id: number;
  name?: string;
  isClosed?: boolean;
  color?: string;
  _links?: { self?: { href?: string } };
}

export interface OpType {
  id: number;
  name?: string;
  color?: string;
  isMilestone?: boolean;
  _links?: { self?: { href?: string } };
}

export interface OpVersion {
  id: number;
  name?: string;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
  _links?: { self?: { href?: string }; definingProject?: { href?: string } };
}

export interface OpMembership {
  id: number;
  _links?: {
    self?: { href?: string };
    project?: { href?: string | null; title?: string };
    principal?: { href?: string | null; title?: string };
    roles?: { href?: string | null; title?: string }[];
  };
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
      offset += 1;
    }
  }

  async listTimeEntries(params: {
    pageSize?: number;
    offset?: number;
    spentFrom?: string | null;
    spentTo?: string | null;
    userId?: number | null;
    workPackageId?: number | null;
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
    if (params.userId) {
      filters.push({ user: { operator: '=', values: [String(params.userId)] } });
    }
    if (params.workPackageId) {
      filters.push({ workPackage: { operator: '=', values: [String(params.workPackageId)] } });
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
    userId?: number | null;
    workPackageId?: number | null;
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
      offset += 1;
    }
  }

  async searchWorkPackages(queryText: string, params?: { pageSize?: number }): Promise<OpWorkPackage[]> {
    const q = queryText.trim();
    if (!q) {
      return [];
    }
    const filters = [{ subjectOrId: { operator: '**', values: [q] } }];
    const query = new URLSearchParams({
      pageSize: String(params?.pageSize ?? 20),
      offset: '1',
      filters: JSON.stringify(filters),
    });
    const page = await this.get<OpCollection<OpWorkPackage>>(`/api/v3/work_packages?${query.toString()}`);
    return page._embedded?.elements ?? [];
  }

  async getWorkPackageRelations(wpId: number): Promise<OpRelation[]> {
    const data = await this.get<OpCollection<OpRelation>>(
      `/api/v3/work_packages/${wpId}/relations?pageSize=100`,
    );
    return data._embedded?.elements ?? [];
  }

  async getWorkPackageAttachments(wpId: number): Promise<OpAttachment[]> {
    const data = await this.get<OpCollection<OpAttachment>>(
      `/api/v3/work_packages/${wpId}/attachments?pageSize=100`,
    );
    return data._embedded?.elements ?? [];
  }

  async listWorkPackageTimeEntries(wpId: number): Promise<OpTimeEntry[]> {
    const entries: OpTimeEntry[] = [];
    for await (const entry of this.paginateTimeEntries({ workPackageId: wpId })) {
      entries.push(entry);
    }
    return entries;
  }

  async createTimeEntry(payload: {
    workPackageId: number;
    hours: string;
    spentOn: string;
    comment?: string;
    activityId?: number;
  }): Promise<OpTimeEntry> {
    const body: Record<string, unknown> = {
      hours: payload.hours,
      spentOn: payload.spentOn,
      _links: {
        workPackage: { href: `/api/v3/work_packages/${payload.workPackageId}` },
      },
    };
    if (payload.comment) {
      body['comment'] = { raw: payload.comment };
    }
    if (payload.activityId) {
      (body['_links'] as Record<string, unknown>)['activity'] = {
        href: `/api/v3/time_entries/activities/${payload.activityId}`,
      };
    }
    return this.request<OpTimeEntry>('/api/v3/time_entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async listProjects(params?: { pageSize?: number }): Promise<OpProject[]> {
    const projects: OpProject[] = [];
    const pageSize = params?.pageSize ?? 100;
    let offset = 1;
    for (;;) {
      const query = new URLSearchParams({ pageSize: String(pageSize), offset: String(offset) });
      const page = await this.get<OpCollection<OpProject>>(`/api/v3/projects?${query.toString()}`);
      const elements = page._embedded?.elements ?? [];
      projects.push(...elements);
      if (elements.length < pageSize) {
        break;
      }
      offset += 1;
    }
    return projects;
  }

  async listStatuses(): Promise<OpStatus[]> {
    const data = await this.get<OpCollection<OpStatus>>('/api/v3/statuses?pageSize=200');
    return data._embedded?.elements ?? [];
  }

  async listTypes(): Promise<OpType[]> {
    const data = await this.get<OpCollection<OpType>>('/api/v3/types?pageSize=200');
    return data._embedded?.elements ?? [];
  }

  async listVersions(projectId: number): Promise<OpVersion[]> {
    const data = await this.get<OpCollection<OpVersion>>(
      `/api/v3/projects/${projectId}/versions?pageSize=200`,
    );
    return data._embedded?.elements ?? [];
  }

  /**
   * สมาชิกของโปรเจกต์ (หรือทั้งหมดถ้าไม่ระบุ) — OpenProject `/api/v3/memberships`
   * `project` รับ identifier หรือ numeric id
   */
  async listMemberships(params?: { project?: string; pageSize?: number }): Promise<OpMembership[]> {
    const memberships: OpMembership[] = [];
    const pageSize = params?.pageSize ?? 100;
    let offset = 1;
    const filters: unknown[] = [];
    if (params?.project?.trim()) {
      filters.push({ project: { operator: '=', values: [params.project.trim()] } });
    }
    for (;;) {
      const query = new URLSearchParams({ pageSize: String(pageSize), offset: String(offset) });
      if (filters.length) {
        query.set('filters', JSON.stringify(filters));
      }
      const page = await this.get<OpCollection<OpMembership>>(`/api/v3/memberships?${query.toString()}`);
      const elements = page._embedded?.elements ?? [];
      memberships.push(...elements);
      if (elements.length < pageSize) {
        break;
      }
      offset += 1;
    }
    return memberships;
  }

  async patchStatus(opId: number, statusId: number, lockVersion: number): Promise<OpWorkPackage> {
    return this.request<OpWorkPackage>(`/api/v3/work_packages/${opId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lockVersion,
        _links: {
          status: { href: `/api/v3/statuses/${statusId}` },
        },
      }),
    });
  }

  userIdFromTimeEntry(entry: OpTimeEntry): number | null {
    return idFromHref(entry._links?.user?.href);
  }

  async listUsers(params?: {
    pageSize?: number;
    offset?: number;
    status?: string;
  }): Promise<OpCollection<OpUser>> {
    const filters: unknown[] = [];
    if (params?.status) {
      filters.push({ status: { operator: '=', values: [params.status] } });
    }
    const query = new URLSearchParams({
      pageSize: String(params?.pageSize ?? 100),
      offset: String(params?.offset ?? 1),
    });
    if (filters.length > 0) {
      query.set('filters', JSON.stringify(filters));
    }
    return this.get<OpCollection<OpUser>>(`/api/v3/users?${query.toString()}`);
  }

  async *paginateUsers(params?: {
    status?: string;
    pageSize?: number;
  }): AsyncGenerator<OpUser> {
    const pageSize = params?.pageSize ?? 100;
    let offset = 1;
    for (;;) {
      const page = await this.listUsers({ ...params, pageSize, offset });
      const elements = page._embedded?.elements ?? [];
      for (const item of elements) {
        yield item;
      }
      if (elements.length < pageSize) {
        break;
      }
      offset += 1;
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

  async getWorkPackage(id: number): Promise<OpWorkPackage> {
    return this.get<OpWorkPackage>(`/api/v3/work_packages/${id}`);
  }

  /** PATCH assignee on a work package. Caller must pass the current lockVersion. */
  async patchAssignee(opId: number, opUserId: number, lockVersion: number): Promise<OpWorkPackage> {
    return this.request<OpWorkPackage>(`/api/v3/work_packages/${opId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lockVersion,
        _links: {
          assignee: { href: `/api/v3/users/${opUserId}` },
        },
      }),
    });
  }

  /** PATCH startDate / dueDate on a work package. Caller must pass the current lockVersion. */
  async patchDates(
    opId: number,
    dates: { startDate?: string | null; dueDate?: string | null },
    lockVersion: number,
  ): Promise<OpWorkPackage> {
    const payload: Record<string, unknown> = { lockVersion };
    if (dates.startDate !== undefined) {
      payload['startDate'] = dates.startDate;
    }
    if (dates.dueDate !== undefined) {
      payload['dueDate'] = dates.dueDate;
    }
    return this.request<OpWorkPackage>(`/api/v3/work_packages/${opId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async postActivityComment(wpId: number, commentMarkdown: string): Promise<void> {
    await this.request<unknown>(`/api/v3/work_packages/${wpId}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment: { raw: commentMarkdown } }),
    });
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
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
