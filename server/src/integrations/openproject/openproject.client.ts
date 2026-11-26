import { DiscoveredOpCustomField, idFromHref, OpActivity, OpWorkPackage } from './openproject.mapper';

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

export interface OpGroup {
  id: number;
  name?: string;
  _links?: {
    self?: { href?: string };
    memberships?: { href?: string | null };
    members?: { href?: string | null; title?: string }[] | { href?: string | null };
  };
  _embedded?: {
    members?: OpUser[];
    elements?: OpUser[];
  };
}

export interface OpEnumeration {
  id: number;
  name?: string;
  active?: boolean;
  /** เช่น Priority, TimeEntryActivity, DocumentCategory */
  _type?: string;
  color?: string;
  _links?: {
    self?: { href?: string };
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

  /** Watchers ของ work package — best-effort (บาง instance อาจไม่มี endpoint) */
  async listWorkPackageWatchers(
    wpId: number,
  ): Promise<{ id: number; name: string; href?: string }[]> {
    try {
      const data = await this.get<
        OpCollection<{ id?: number; name?: string; _links?: { self?: { href?: string; title?: string } } }>
      >(`/api/v3/work_packages/${wpId}/watchers?pageSize=100`);
      return (data._embedded?.elements ?? [])
        .map((w) => {
          const href = w._links?.self?.href ?? undefined;
          const id = typeof w.id === 'number' ? w.id : idFromHref(href);
          if (id == null) return null;
          return {
            id,
            name: (w.name || w._links?.self?.title || `User ${id}`).trim(),
            ...(href ? { href } : {}),
          };
        })
        .filter((row): row is { id: number; name: string; href?: string } => row != null);
    } catch {
      return [];
    }
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

  async createWorkPackage(
    projectId: string | number,
    payload: {
      subject: string;
      description?: string;
      typeId?: number;
      assigneeId?: number;
      estimatedHours?: number;
      startDate?: string | null;
      dueDate?: string | null;
      customFields?: Record<string, string | null | undefined>;
    },
  ): Promise<OpWorkPackage> {
    const body: Record<string, unknown> = {
      subject: payload.subject,
    };
    if (payload.description) {
      body['description'] = { raw: payload.description };
    }
    if (payload.estimatedHours && payload.estimatedHours > 0) {
      body['estimatedTime'] = `PT${Math.round(payload.estimatedHours)}H`;
    }
    if (payload.startDate) {
      body['startDate'] = payload.startDate;
    }
    if (payload.dueDate) {
      body['dueDate'] = payload.dueDate;
    }
    if (payload.customFields) {
      for (const [k, v] of Object.entries(payload.customFields)) {
        if (/^customField\d+$/.test(k) && v) {
          body[k] = v;
        }
      }
    }
    const links: Record<string, unknown> = {};
    if (payload.typeId) {
      links['type'] = { href: `/api/v3/types/${payload.typeId}` };
    }
    if (payload.assigneeId) {
      links['assignee'] = { href: `/api/v3/users/${payload.assigneeId}` };
    }
    if (Object.keys(links).length > 0) {
      body['_links'] = links;
    }
    const encoded = encodeURIComponent(String(projectId));
    return this.request<OpWorkPackage>(`/api/v3/projects/${encoded}/work_packages`, {
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

  async listGroups(params?: { pageSize?: number }): Promise<OpGroup[]> {
    const groups: OpGroup[] = [];
    const pageSize = params?.pageSize ?? 100;
    let offset = 1;
    for (;;) {
      const query = new URLSearchParams({ pageSize: String(pageSize), offset: String(offset) });
      const page = await this.get<OpCollection<OpGroup>>(`/api/v3/groups?${query.toString()}`);
      const elements = page._embedded?.elements ?? [];
      groups.push(...elements);
      if (elements.length < pageSize) break;
      offset += 1;
    }
    return groups;
  }

  async getGroup(groupId: number): Promise<OpGroup | null> {
    try {
      return await this.get<OpGroup>(`/api/v3/groups/${groupId}`);
    } catch {
      return null;
    }
  }

  /**
   * ดึง user id สมาชิกในกลุ่ม — จาก _embedded.members, _links.members หรือ memberships ของกลุ่ม
   */
  async listGroupMemberUserIds(groupId: number): Promise<number[]> {
    const ids = new Set<number>();

    const collectFromGroup = (group: OpGroup | null | undefined) => {
      if (!group) return;
      for (const member of group._embedded?.members ?? group._embedded?.elements ?? []) {
        if (typeof member?.id === 'number') ids.add(member.id);
      }
      const memberLinks = group._links?.members;
      if (Array.isArray(memberLinks)) {
        for (const link of memberLinks) {
          const id = idFromHref(link?.href);
          if (id != null) ids.add(id);
        }
      }
    };

    collectFromGroup(await this.getGroup(groupId));
    if (ids.size === 0) {
      try {
        collectFromGroup(
          await this.get<OpGroup>(`/api/v3/groups/${groupId}?select=id,name,members,_links,_embedded`),
        );
      } catch {
        // ignore select variants
      }
    }

    if (ids.size === 0) {
      try {
        const page = await this.get<OpCollection<OpMembership>>(
          `/api/v3/memberships?pageSize=200&offset=1&filters=${encodeURIComponent(
            JSON.stringify([{ principal: { operator: '=', values: [`/api/v3/groups/${groupId}`] } }]),
          )}`,
        );
        for (const m of page._embedded?.elements ?? []) {
          // เมื่อ filter ด้วย group เป็น principal — สมาชิกจริงอาจอยู่ใน embedded ของ membership อื่น
          // บาง instance คืน membership ของกลุ่มในโปรเจกต์; ดึง user จาก roles ไม่ได้ — ข้าม
          void m;
        }
      } catch {
        // ignore
      }
    }

    // OpenProject มาตรฐาน: GET group มี members เป็น array ของ user links
    if (ids.size === 0) {
      try {
        const raw = await this.get<{
          id?: number;
          members?: { href?: string; title?: string }[];
          _links?: OpGroup['_links'];
          _embedded?: OpGroup['_embedded'];
        }>(`/api/v3/groups/${groupId}`);
        if (Array.isArray(raw.members)) {
          for (const link of raw.members) {
            const id = idFromHref(link?.href);
            if (id != null) ids.add(id);
          }
        }
        collectFromGroup(raw as OpGroup);
      } catch {
        // ignore
      }
    }

    return [...ids];
  }

  /** รวม Priority + TimeEntryActivity + /enumerations (ถ้ามี) */
  async listEnumerations(): Promise<OpEnumeration[]> {
    const out: OpEnumeration[] = [];
    const seen = new Set<number>();

    const pushAll = (items: OpEnumeration[], fallbackType: string) => {
      for (const item of items) {
        if (typeof item?.id !== 'number' || seen.has(item.id)) continue;
        seen.add(item.id);
        out.push({
          ...item,
          _type: item._type || fallbackType,
          name: item.name ?? `Enumeration ${item.id}`,
          active: item.active !== false,
        });
      }
    };

    for (const path of [
      { href: '/api/v3/enumerations?pageSize=200', type: 'Enumeration' },
      { href: '/api/v3/priorities?pageSize=200', type: 'Priority' },
      { href: '/api/v3/time_entries/activities?pageSize=200', type: 'TimeEntryActivity' },
    ]) {
      try {
        const page = await this.get<OpCollection<OpEnumeration>>(path.href);
        pushAll(page._embedded?.elements ?? [], path.type);
      } catch {
        // endpoint may not exist on older OP — skip
      }
    }
    return out;
  }

  /**
   * Scans recent work package schemas on OpenProject API v3 to discover all customField* keys, labels, and data types.
   */
  async discoverCustomFieldsFromSchemas(sampleSize = 40): Promise<DiscoveredOpCustomField[]> {
    const query = new URLSearchParams({
      pageSize: String(sampleSize),
      offset: '1',
      sortBy: JSON.stringify([['updatedAt', 'desc']]),
    });
    const page = await this.get<OpCollection<OpWorkPackage>>(`/api/v3/work_packages?${query.toString()}`);
    const elements = page._embedded?.elements ?? [];
    const seenSchemas = new Set<string>();
    const discovered = new Map<string, DiscoveredOpCustomField>();

    for (const wp of elements) {
      const schemaLink = wp._links?.['schema'];
      const href = Array.isArray(schemaLink) ? schemaLink[0]?.href : schemaLink?.href;
      if (!href || seenSchemas.has(href)) continue;
      seenSchemas.add(href);
      try {
        const schemaObj = await this.get<
          Record<
            string,
            {
              name?: string;
              type?: string;
              _links?: {
                allowedValues?:
                  | { href?: string | null; title?: string }[]
                  | { href?: string | null };
              };
              allowedValues?: { id?: number; name?: string; value?: string; title?: string }[];
            }
          >
        >(href);
        const typeLink = wp._links?.['type'];
        const sampleWpType = (Array.isArray(typeLink) ? typeLink[0]?.title : typeLink?.title) ?? undefined;
        for (const [key, meta] of Object.entries(schemaObj ?? {})) {
          if (!/^customField\d+$/.test(key) || discovered.has(key)) continue;
          const name = String(meta?.name ?? key).trim();
          // Skip visual separator dummy fields like "--------------"
          if (/^[-_=]{3,}$/.test(name)) continue;
          const options: { id?: number; name: string }[] = [];
          if (Array.isArray(meta.allowedValues)) {
            for (const opt of meta.allowedValues) {
              const label = String(opt?.name ?? opt?.title ?? opt?.value ?? '').trim();
              if (!label) continue;
              options.push({
                ...(typeof opt.id === 'number' ? { id: opt.id } : {}),
                name: label,
              });
            }
          }
          const allowedLink = meta._links?.allowedValues;
          if (Array.isArray(allowedLink) && options.length === 0) {
            for (const link of allowedLink) {
              const label = String(link?.title ?? '').trim();
              const id = idFromHref(link?.href);
              if (!label && id == null) continue;
              options.push({
                ...(id != null ? { id } : {}),
                name: label || `Option ${id}`,
              });
            }
          }
          discovered.set(key, {
            key,
            name,
            type: String(meta?.type ?? 'String'),
            sampleWpType,
            ...(options.length ? { options } : {}),
          });
        }
      } catch {
        // Ignore individual inaccessible schema links
      }
    }

    return Array.from(discovered.values()).sort((a, b) => {
      const na = Number(a.key.replace('customField', '')) || 0;
      const nb = Number(b.key.replace('customField', '')) || 0;
      return na - nb;
    });
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

  /** Fetches raw avatar bytes from `/api/v3/users/:id/avatar` using API token Basic Auth. */
  async fetchUserAvatar(
    opUserId: number,
  ): Promise<{ ok: boolean; status: number; contentType: string; bytes: Buffer | null }> {
    const url = `${this.baseUrl.replace(/\/+$/, '')}/api/v3/users/${opUserId}/avatar`;
    const auth = Buffer.from(`apikey:${this.token}`).toString('base64');
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'image/*,*/*;q=0.8',
        Authorization: `Basic ${auth}`,
      },
    });
    if (!response.ok) {
      return { ok: false, status: response.status, contentType: '', bytes: null };
    }
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const ab = await response.arrayBuffer();
    return {
      ok: true,
      status: response.status,
      contentType,
      bytes: Buffer.from(ab),
    };
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
