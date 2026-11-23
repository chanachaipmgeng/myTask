import { Injectable, computed, effect, inject, signal } from '@angular/core';
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
import { listWorkProjectOptions } from '../../../shared/domain/work-views';
import { Person, Ticket } from './models';
import {
  currentViewer,
  OpenProjectCatalogEntry,
  openprojectProjectCatalog,
} from './admin-settings';
import { ScorecardService } from './scorecard.service';

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
  readonly track = signal<WorkspaceTrackFilter>('All');
  readonly personId = signal('');
  readonly cycleId = signal('');
  readonly fromDate = signal('');
  readonly toDate = signal('');
  readonly yearCe = signal<number | null>(null);

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

  readonly scope = computed<WorkspaceScope>(() => ({
    teamId: this.teamId(),
    opProject: this.opProject(),
    track: this.track(),
    personId: this.personId(),
    cycleId: this.cycleId(),
    fromDate: this.fromDate(),
    toDate: this.toDate(),
    yearCe: this.yearCe(),
    allowedTeams: this.scorecard.effectiveAllowedTeams(),
  }));

  readonly hasActiveFilter = computed(
    () =>
      !!this.teamId() ||
      !!this.opProject() ||
      !!this.personId() ||
      this.track() !== 'All' ||
      !!this.cycleId() ||
      !!this.fromDate() ||
      !!this.toDate() ||
      this.yearCe() != null,
  );

  readonly teamOptions = computed(() => {
    const rows = listOrgTeamOptions(this.scorecard.people(), this.scorecard.teams());
    const allowed = this.scorecard.effectiveAllowedTeams();
    const filteredRows = allowed === null ? rows : rows.filter((r) => allowed.includes(r.id));
    return [
      { text: allowed === null ? 'ทุกทีม' : 'ทุกทีมในสิทธิ์', value: '' },
      ...filteredRows.map((row) => ({ text: row.label, value: row.id })),
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
    const isAdmin = currentViewer().access === 'admin';
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

  readonly trackChipOptions = listWorkspaceTrackChipOptions();

  readonly selectedPersonLabel = computed(() => {
    const id = this.personId();
    if (!id) {
      return '';
    }
    return this.scorecard.people().find((p) => p.id === id)?.nickname ?? id;
  });

  readonly filterSummary = computed(() => {
    const parts: string[] = [];
    const cycle = this.activeCycle();
    if (cycle) {
      parts.push(cycle.label);
    } else if (this.yearCe() != null) {
      parts.push(`พ.ศ. ${this.yearCe()! + 543}`);
    } else if (this.fromDate() || this.toDate()) {
      parts.push(`${this.fromDate() || '…'} → ${this.toDate() || '…'}`);
    }
    const team = this.teamOptions().find((row) => row.value === this.teamId());
    if (team?.value) {
      parts.push(team.text);
    }
    const project = this.projectOptions().find((row) => row.value === this.opProject());
    if (project?.value) {
      parts.push(project.text);
    }
    if (this.track() !== 'All') {
      const chip = this.trackChipOptions.find((row) => row.id === this.track());
      parts.push(chip?.label ?? this.track());
    }
    if (this.personId()) {
      parts.push(this.selectedPersonLabel() || this.personId());
    }
    return parts.length ? parts.join(' · ') : 'ทุกทีม / ทุกรอบ';
  });

  constructor() {
    effect(() => {
      const q = this.urlQuery();
      this.applyFromParams(q);
    });

    effect(() => {
      const teamId = this.teamId();
      const opProject = this.opProject();
      const track = this.track();
      const personId = this.personId();
      const cycleId = this.cycleId();
      const fromDate = this.fromDate();
      const toDate = this.toDate();
      const yearCe = this.yearCe();
      if (this.writingUrl) {
        return;
      }
      const next = this.filterQueryParams({
        teamId,
        opProject,
        track,
        personId,
        cycleId,
        fromDate,
        toDate,
        yearCe,
      });
      const current = this.readQueryFromLocation();
      if (
        normalizeParam(current['teamId']) === normalizeParam(next['teamId'] as string | undefined) &&
        normalizeParam(current['project']) === normalizeParam(next['project'] as string | undefined) &&
        parseTrack(current['track']) === parseTrack(next['track'] as string | undefined) &&
        normalizeParam(current['person']) === normalizeParam(next['person'] as string | undefined) &&
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
    const personId = scope.personId?.trim() ?? '';
    const cycleId = scope.cycleId?.trim() ?? '';
    const fromDate = isIsoDay(scope.fromDate) ? scope.fromDate : '';
    const toDate = isIsoDay(scope.toDate) ? scope.toDate : '';
    const track = parseTrack(scope.track);
    const yearCe = typeof scope.yearCe === 'number' ? scope.yearCe : null;
    params['teamId'] = teamId || null;
    params['project'] = opProject || null;
    params['person'] = personId || null;
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

  setTrack(track: string): void {
    this.track.set(parseTrack(track));
  }

  setPerson(personId: string): void {
    this.personId.set(normalizeParam(personId));
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
      // กลับไปไม่ผูกวันที่จากรอบ
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
    }
  }

  setFromDate(value: string): void {
    this.fromDate.set(isIsoDay(value) ? value : '');
  }

  setToDate(value: string): void {
    this.toDate.set(isIsoDay(value) ? value : '');
  }

  clear(): void {
    this.teamId.set('');
    this.opProject.set('');
    this.track.set('All');
    this.personId.set('');
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
    const nextPerson = normalizeParam(params['person'] as string | undefined);
    const nextTrack = parseTrack(params['track'] as string | undefined);
    const nextCycle = normalizeParam(params['cycle'] as string | undefined);
    const nextFrom = isIsoDay(params['from'] as string | undefined) ? String(params['from']) : '';
    const nextTo = isIsoDay(params['to'] as string | undefined) ? String(params['to']) : '';
    const nextYear = parseYear(params['year'] as string | undefined);
    const urlHasFilter = !!(
      nextTeam ||
      nextProject ||
      nextPerson ||
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
    if (this.personId() !== nextPerson) this.personId.set(nextPerson);
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
