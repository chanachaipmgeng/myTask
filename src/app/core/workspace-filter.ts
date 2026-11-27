import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Params, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { ScorecardCycle, isIsoDay } from '../../../shared/domain/scorecard-cycle';
import {
  WorkspaceScope,
  WorkspaceTrackFilter,
  filterPeopleByWorkspace,
  filterTicketsByWorkspace,
  listOrgTeamOptions,
  listWorkspaceTrackChipOptions,
  parseWorkspaceTrackFilter,
} from '../../../shared/domain/workspace-scope';
import { listWorkProjectOptions, resolvePersonTeamId } from '../../../shared/domain/work-views';
import { Person, Ticket, trackDisplayLabel } from './models';
import {
  currentViewer,
  effectiveRole,
  OpenProjectCatalogEntry,
  openprojectProjectCatalog,
  openprojectTypeCatalog,
} from './admin-settings';
import { ScorecardService } from './scorecard.service';
import { currentSession } from './session';

function parseTrack(raw: string | null | undefined): WorkspaceTrackFilter {
  return parseWorkspaceTrackFilter(raw);
}

function normalizeParam(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function parseYear(raw: string | null | undefined): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 2000 || n > 2100) {
    return null;
  }
  return Math.trunc(n);
}

@Injectable({ providedIn: 'root' })
export class WorkspaceFilter {
  private readonly router = inject(Router);
  private readonly scorecard = inject(ScorecardService);
  private writingUrl = false;

  readonly teamId = signal('');
  readonly opProject = signal('');
  readonly opType = signal('');
  readonly track = signal<WorkspaceTrackFilter>('All');
  readonly personId = signal('');
  readonly statusScope = signal<'unclosed' | 'closed' | 'all'>('unclosed');
  readonly cycleId = signal('');
  readonly fromDate = signal('');
  readonly toDate = signal('');
  readonly yearCe = signal<number | null>(null);

  readonly selfPersonId = computed(
    () => currentSession()?.person.id ?? currentViewer().id,
  );
  readonly isFilteringSelf = computed(
    () => !!this.selfPersonId() && this.personId() === this.selfPersonId(),
  );

  /** ทีมสังกัดของผู้ใช้ปัจจุบัน */
  readonly selfTeamId = computed(() => {
    const id = this.selfPersonId();
    if (!id) return '';
    const me = this.scorecard.people().find((p) => p.id === id);
    return me ? resolvePersonTeamId(me) : '';
  });

  private readonly urlQuery = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.readQueryFromLocation()),
      startWith(this.readQueryFromLocation()),
    ),
    { initialValue: this.readQueryFromLocation() },
  );

  readonly activeCycle = computed<ScorecardCycle | null>(() => {
    const id = this.cycleId();
    if (!id) {
      return null;
    }
    return this.scorecard.cycles().find((c) => c.id === id) ?? null;
  });

  readonly systemCycle = computed<ScorecardCycle | null>(() => {
    const activeId = this.scorecard.activeCycleId();
    return this.scorecard.cycles().find((c) => c.id === activeId) ?? null;
  });

  readonly scope = computed<WorkspaceScope>(() => {
    const isMember = effectiveRole() === 'member';
    return {
      teamId: isMember ? '' : this.teamId(),
      opProject: this.opProject(),
      opType: this.opType(),
      track: isMember ? 'All' : this.track(),
      personId: isMember ? this.selfPersonId() : this.personId(),
      statusScope: this.statusScope(),
      cycleId: this.cycleId(),
      fromDate: this.fromDate(),
      toDate: this.toDate(),
      yearCe: this.yearCe(),
      allowedTeams: this.scorecard.effectiveAllowedTeams(),
    };
  });

  readonly hasActiveFilter = computed(() => {
    const isMember = effectiveRole() === 'member';
    return (
      (!isMember && !!this.teamId()) ||
      !!this.opProject() ||
      !!this.opType() ||
      (!isMember && !!this.personId()) ||
      (!isMember && this.track() !== 'All') ||
      this.statusScope() !== 'unclosed' ||
      !!this.cycleId() ||
      !!this.fromDate() ||
      !!this.toDate() ||
      this.yearCe() != null
    );
  });

  readonly teamOptions = computed(() => {
    const rows = listOrgTeamOptions(this.scorecard.people(), this.scorecard.teams());
    const allowed = this.scorecard.effectiveAllowedTeams();
    const filteredRows = allowed === null ? rows : rows.filter((r) => allowed.includes(r.id));
    return [
      { text: allowed === null ? 'ทุกทีมในองค์กร' : 'ทุกทีมในสิทธิ์', value: '' },
      ...filteredRows.map((row) => ({ text: row.label, value: row.id })),
    ];
  });

  readonly personOptions = computed(() => {
    const allowed = this.scorecard.effectiveAllowedTeams();
    const allowedSet = allowed ? new Set(allowed) : null;
    const team = this.teamId();
    const people = this.scorecard
      .people()
      .filter((p) => {
        const pTeam = resolvePersonTeamId(p);
        if (allowedSet && !allowedSet.has(pTeam)) return false;
        if (team && pTeam !== team) return false;
        return true;
      })
      .slice()
      .sort((a, b) => a.nickname.localeCompare(b.nickname, 'th'));

    return [
      { text: 'ทุกพนักงาน', value: '' },
      ...people.map((p) => ({
        text: `${p.nickname}${p.fullName && p.fullName !== p.nickname ? ` · ${p.fullName}` : ''} (${trackDisplayLabel(p.track)})`,
        value: p.id,
      })),
    ];
  });

  readonly cycleOptions = computed(() => {
    const rows = this.scorecard.cycles();
    return [
      { text: 'รอบระบบ (ค่าเริ่ม)', value: '' },
      ...rows.map((row) => ({
        text: `${row.label}${row.status === 'open' ? '' : ` · ${row.status}`}`,
        value: row.id,
      })),
    ];
  });

  readonly yearOptions = computed(() => {
    const years = new Set<number>();
    const now = new Date().getFullYear();
    years.add(now);
    years.add(now - 1);
    years.add(now + 1);
    for (const cycle of this.scorecard.cycles()) {
      years.add(cycle.yearCe);
    }
    return [
      { text: 'ทุกปี', value: '' },
      ...[...years]
        .sort((a, b) => b - a)
        .map((y) => ({ text: `พ.ศ. ${y + 543} (${y})`, value: String(y) })),
    ];
  });

  readonly projectOptions = computed(() => {
    const cycle = this.activeCycle();
    const scoped = filterTicketsByWorkspace(
      this.scorecard.tickets(),
      this.scorecard.people(),
      {
        teamId: this.teamId(),
        track: this.track(),
        personId: this.personId(),
        fromDate: this.fromDate(),
        toDate: this.toDate(),
        yearCe: this.yearCe(),
        cycleId: this.cycleId(),
      },
      cycle,
    );
    const fromTickets = listWorkProjectOptions(scoped);
    const catalog = openprojectProjectCatalog();
    const isAdmin = effectiveRole() === 'admin';
    const allowedTeams = this.scorecard.effectiveAllowedTeams();

    const catalogMap = new Map<string, OpenProjectCatalogEntry>();
    for (const row of catalog) {
      if (row.identifier) {
        catalogMap.set(row.identifier, row);
      }
    }

    const map = new Map<string, string>();
    for (const row of catalog) {
      if (!row.identifier) continue;
      // Inactive projects are hidden from the dropdown
      if (row.active === false) continue;

      // Non-admins only see projects assigned to their allowed teams (or projects not restricted to any team)
      if (!isAdmin && allowedTeams && allowedTeams.length > 0) {
        const assigned = row.assignedTeamIds ?? [];
        if (assigned.length > 0 && !assigned.some((t) => allowedTeams.includes(t))) {
          continue;
        }
      }

      map.set(row.identifier, row.name || row.identifier);
    }

    for (const row of fromTickets) {
      if (!row.id) continue;
      const catEntry = catalogMap.get(row.id);
      if (catEntry && catEntry.active === false) {
        continue;
      }
      if (!isAdmin && allowedTeams && allowedTeams.length > 0 && catEntry) {
        const assigned = catEntry.assignedTeamIds ?? [];
        if (assigned.length > 0 && !assigned.some((t) => allowedTeams.includes(t))) {
          continue;
        }
      }
      if (!map.has(row.id)) {
        map.set(row.id, row.label);
      }
    }

    return [
      { text: 'ทุกโปรเจกต์', value: '' },
      ...[...map.entries()]
        .map(([value, text]) => ({ text, value }))
        .sort((a, b) => a.text.localeCompare(b.text, 'th')),
    ];
  });

  readonly typeOptions = computed(() => {
    const seen = new Set<string>();
    for (const entry of openprojectTypeCatalog()) {
      const name = entry.name?.trim();
      if (name) seen.add(name);
    }
    for (const t of this.scorecard.tickets()) {
      const label = (t.opType ?? '').trim() || t.type;
      if (label) seen.add(label);
    }
    return [
      { text: 'ทุกชนิดใบงาน', value: '' },
      ...[...seen]
        .sort((a, b) => a.localeCompare(b, 'th'))
        .map((name) => ({ text: name, value: name })),
    ];
  });

  readonly trackChipOptions = computed(() =>
    listWorkspaceTrackChipOptions(this.scorecard.people(), this.scorecard.tickets()),
  );

  readonly selectedPersonLabel = computed(() => {
    const id = this.personId();
    if (!id) {
      return '';
    }
    return this.scorecard.people().find((p) => p.id === id)?.nickname ?? id;
  });

  readonly filterSummary = computed(() => {
    const isMember = effectiveRole() === 'member';
    const parts: string[] = [];
    const cycle = this.activeCycle();
    if (cycle) {
      parts.push(cycle.label);
    } else if (this.yearCe() != null) {
      parts.push(`พ.ศ. ${this.yearCe()! + 543}`);
    } else if (this.fromDate() || this.toDate()) {
      parts.push(`${this.fromDate() || '…'} → ${this.toDate() || '…'}`);
    }
    if (!isMember) {
      const team = this.teamOptions().find((row) => row.value === this.teamId());
      if (team?.value) {
        parts.push(team.text);
      }
    }
    const project = this.projectOptions().find((row) => row.value === this.opProject());
    if (project?.value) {
      parts.push(project.text);
    }
    if (this.opType()) {
      parts.push(this.opType());
    }
    if (!isMember && this.track() !== 'All') {
      const chip = this.trackChipOptions().find((row) => row.id === this.track());
      parts.push(chip?.label ?? this.track());
    }
    if (!isMember && this.personId()) {
      parts.push(this.selectedPersonLabel() || this.personId());
    }
    if (this.statusScope() === 'closed') {
      parts.push('เฉพาะงานที่ปิดแล้ว');
    } else if (this.statusScope() === 'all') {
      parts.push('ทุกสถานะ (รวมปิดแล้ว)');
    }
    if (isMember) {
      return parts.length ? `งานของฉัน · ${parts.join(' · ')}` : 'เฉพาะงานของฉัน';
    }
    return parts.length ? parts.join(' · ') : 'ทุกทีม / ทุกรอบ';
  });

  constructor() {
    effect(() => {
      const q = this.urlQuery();
      if (this.writingUrl) {
        return;
      }
      untracked(() => this.applyFromParams(q));
    });

    // ค่าเริ่มต้นไม่กรองทีม (ทุกทีมในองค์กร / ทุกทีมในสิทธิ์) — ตั้ง teamId เฉพาะเมื่อ URL หรือผู้ใช้เลือก

    effect(() => {
      const teamId = this.teamId();
      const opProject = this.opProject();
      const opType = this.opType();
      const track = this.track();
      const personId = this.personId();
      const cycleId = this.cycleId();
      const statusScope = this.statusScope();
      const fromDate = this.fromDate();
      const toDate = this.toDate();
      const yearCe = this.yearCe();
      if (this.writingUrl) {
        return;
      }
      const next = this.filterQueryParams({
        teamId,
        opProject,
        opType,
        track,
        personId,
        statusScope,
        cycleId,
        fromDate,
        toDate,
        yearCe,
      });
      const current = this.readQueryFromLocation();
      if (
        normalizeParam(current['teamId']) === normalizeParam(next['teamId'] as string | undefined) &&
        normalizeParam(current['project']) === normalizeParam(next['project'] as string | undefined) &&
        normalizeParam(current['type']) === normalizeParam(next['type'] as string | undefined) &&
        parseTrack(current['track']) === parseTrack(next['track'] as string | undefined) &&
        normalizeParam(current['person']) === normalizeParam(next['person']) &&
        normalizeParam(current['statusScope']) === normalizeParam(next['statusScope'] as string | undefined) &&
        normalizeParam(current['cycle']) === normalizeParam(next['cycle'] as string | undefined) &&
        normalizeParam(current['from']) === normalizeParam(next['from'] as string | undefined) &&
        normalizeParam(current['to']) === normalizeParam(next['to'] as string | undefined) &&
        parseYear(current['year'] as string | undefined) ===
          parseYear(next['year'] as string | undefined)
      ) {
        return;
      }
      void this.patchUrl(next);
    });
  }

  filterQueryParams(scope: WorkspaceScope = this.scope()): Params {
    const params: Params = {};
    const teamId = scope.teamId?.trim() ?? '';
    const opProject = scope.opProject?.trim() ?? '';
    const opType = scope.opType?.trim() ?? '';
    const personId = scope.personId?.trim() ?? '';
    const statusScope = scope.statusScope ?? 'unclosed';
    const cycleId = scope.cycleId?.trim() ?? '';
    const fromDate = isIsoDay(scope.fromDate) ? scope.fromDate : '';
    const toDate = isIsoDay(scope.toDate) ? scope.toDate : '';
    const track = parseTrack(scope.track);
    const yearCe = typeof scope.yearCe === 'number' ? scope.yearCe : null;
    params['teamId'] = teamId || null;
    params['project'] = opProject || null;
    params['type'] = opType || null;
    params['person'] = personId || null;
    params['statusScope'] = statusScope === 'unclosed' ? null : statusScope;
    params['track'] = track === 'All' ? null : track;
    params['cycle'] = cycleId || null;
    params['from'] = fromDate || null;
    params['to'] = toDate || null;
    params['year'] = yearCe != null ? String(yearCe) : null;
    return params;
  }

  async navigateWithFilter(commands: (string | number)[], extras?: { queryParams?: Params }): Promise<boolean> {
    return this.router.navigate(commands, {
      queryParams: {
        ...this.filterQueryParams(),
        ...(extras?.queryParams ?? {}),
      },
      queryParamsHandling: 'merge',
    });
  }

  setTeam(teamId: string): void {
    this.teamId.set(normalizeParam(teamId));
  }

  setProject(opProject: string): void {
    this.opProject.set(normalizeParam(opProject));
  }

  setType(opType: string): void {
    this.opType.set(normalizeParam(opType));
  }

  setTrack(track: string): void {
    this.track.set(parseTrack(track));
  }

  setPerson(personId: string): void {
    this.personId.set(normalizeParam(personId));
  }

  setStatusScope(scope: 'unclosed' | 'closed' | 'all'): void {
    this.statusScope.set(scope);
  }

  toggleMineOnly(): void {
    const selfId = this.selfPersonId();
    if (!selfId) return;
    if (this.personId() === selfId) {
      this.personId.set('');
    } else {
      this.personId.set(selfId);
    }
  }

  setCycle(cycleId: string): void {
    const id = normalizeParam(cycleId);
    this.cycleId.set(id);
    const cycle = this.scorecard.cycles().find((c) => c.id === id);
    if (cycle) {
      this.fromDate.set(cycle.startOn);
      this.toDate.set(cycle.endOn);
      this.yearCe.set(cycle.yearCe);
      if (cycle.teamIds.length === 1) {
        this.teamId.set(cycle.teamIds[0]!);
      }
    } else if (!id) {
      this.fromDate.set('');
      this.toDate.set('');
      this.yearCe.set(null);
    }
  }

  /** ใช้รอบที่แอดมินเปิดเป็นค่าเริ่มของระบบ */
  applySystemCycle(): void {
    const cycle = this.systemCycle();
    if (!cycle) {
      return;
    }
    this.setCycle(cycle.id);
  }

  setYear(yearRaw: string): void {
    const year = parseYear(yearRaw);
    this.yearCe.set(year);
    if (year != null) {
      this.fromDate.set(`${year}-01-01`);
      this.toDate.set(`${year}-12-31`);
      this.cycleId.set('');
    } else {
      this.fromDate.set('');
      this.toDate.set('');
    }
  }

  setFromDate(value: string): void {
    this.fromDate.set(isIsoDay(value) ? value : '');
  }

  setToDate(value: string): void {
    this.toDate.set(isIsoDay(value) ? value : '');
  }

  clear(): void {
    // ทุกทีมในองค์กร / ทุกทีมในสิทธิ์ — ไม่คืนทีมตัวเอง
    this.teamId.set('');
    this.opProject.set('');
    this.opType.set('');
    this.track.set('All');
    this.personId.set('');
    this.statusScope.set('unclosed');
    this.cycleId.set('');
    this.fromDate.set('');
    this.toDate.set('');
    this.yearCe.set(null);
  }

  applyToPeople(people: readonly Person[]): Person[] {
    return filterPeopleByWorkspace(people, this.scope(), this.activeCycle());
  }

  applyToTickets(tickets: readonly Ticket[], people: readonly Person[] = this.scorecard.people()): Ticket[] {
    return filterTicketsByWorkspace(tickets, people, this.scope(), this.activeCycle());
  }

  private applyFromParams(params: Params): void {
    const nextTeam = normalizeParam(params['teamId'] as string | undefined);
    const nextProject = normalizeParam(params['project'] as string | undefined);
    const nextType = normalizeParam(params['type'] as string | undefined);
    const nextPerson = normalizeParam(params['person'] as string | undefined);
    const nextStatusScopeRaw = normalizeParam(params['statusScope'] as string | undefined).toLowerCase();
    const nextStatusScope =
      nextStatusScopeRaw === 'closed' || nextStatusScopeRaw === 'all' ? (nextStatusScopeRaw as 'closed' | 'all') : 'unclosed';
    const nextTrack = parseTrack(params['track'] as string | undefined);
    const nextCycle = normalizeParam(params['cycle'] as string | undefined);
    const nextFrom = isIsoDay(params['from'] as string | undefined) ? String(params['from']) : '';
    const nextTo = isIsoDay(params['to'] as string | undefined) ? String(params['to']) : '';
    const nextYear = parseYear(params['year'] as string | undefined);
    const urlHasFilter = !!(
      nextTeam ||
      nextProject ||
      nextType ||
      nextPerson ||
      nextStatusScope !== 'unclosed' ||
      nextTrack !== 'All' ||
      nextCycle ||
      nextFrom ||
      nextTo ||
      nextYear != null
    );
    if (!urlHasFilter && this.hasActiveFilter()) {
      void this.patchUrl(this.filterQueryParams());
      return;
    }
    if (this.teamId() !== nextTeam) this.teamId.set(nextTeam);
    if (this.opProject() !== nextProject) this.opProject.set(nextProject);
    if (this.opType() !== nextType) this.opType.set(nextType);
    if (this.personId() !== nextPerson) this.personId.set(nextPerson);
    if (this.statusScope() !== nextStatusScope) this.statusScope.set(nextStatusScope);
    if (this.track() !== nextTrack) this.track.set(nextTrack);
    if (this.cycleId() !== nextCycle) this.cycleId.set(nextCycle);
    if (this.fromDate() !== nextFrom) this.fromDate.set(nextFrom);
    if (this.toDate() !== nextTo) this.toDate.set(nextTo);
    if (this.yearCe() !== nextYear) this.yearCe.set(nextYear);
  }

  private readQueryFromLocation(): Params {
    const tree = this.router.parseUrl(this.router.url);
    return tree.queryParams ?? {};
  }

  private async patchUrl(params: Params): Promise<void> {
    this.writingUrl = true;
    try {
      await this.router.navigate([], {
        queryParams: params,
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    } finally {
      this.writingUrl = false;
    }
  }
}
