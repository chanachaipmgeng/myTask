import { ForbiddenException, Injectable } from '@nestjs/common';
import { AccessRole, Person, Ticket } from '../../../shared/domain/models';
import { computeEffectiveAllowedTeams } from '../../../shared/domain/team-visibility';
import { resolvePersonTeamId } from '../../../shared/domain/work-views';
import { filterPeopleByWorkspace } from '../../../shared/domain/workspace-scope';
import { listPeople } from '../data/people.repo';
import { getVisibilityConfig } from '../data/visibility.repo';
import { Db } from '../db/db.service';
import { AuthUser } from './auth.types';

export interface ScopeContext {
  isAdmin: boolean;
  access: AccessRole;
  selfId: string;
  allowedTeams: string[] | null;
  allPeople: Person[];
  visiblePeople: Person[];
  allowedPersonIds: Set<string> | null;
  /** Returns assigneeIds filtered for a requested team, or throws ForbiddenException if outside scope. */
  resolveTeamAssignees(requestedTeamId?: string): string[] | null;
  /** Checks whether caller can view/access target person. */
  assertCanAccessPerson(personId: string, opts?: { selfOnlyForMember?: boolean }): void;
  /** Checks whether caller can view/access target ticket. */
  assertCanAccessTicket(ticket: Ticket, opts?: { allowUnassignedForMember?: boolean }): void;
  /** Returns true if caller can view/access target ticket without throwing. */
  canAccessTicket(ticket: Ticket): boolean;
}

@Injectable()
export class VisibilityScopeService {
  constructor(private readonly db: Db) {}

  async resolve(authUser: AuthUser | undefined): Promise<ScopeContext> {
    if (!authUser?.person) {
      throw new ForbiddenException('login required');
    }
    const [allPeople, visibility] = await Promise.all([
      listPeople(this.db),
      getVisibilityConfig(this.db),
    ]);
    const access = authUser.access;
    const isAdmin = access === 'admin';
    const selfId = authUser.person.id;
    const allowedTeams = computeEffectiveAllowedTeams(authUser.person, visibility);
    const visiblePeople =
      allowedTeams === null
        ? allPeople
        : filterPeopleByWorkspace(allPeople, { allowedTeams });
    const allowedPersonIds =
      allowedTeams === null ? null : new Set(visiblePeople.map((p) => p.id));

    return {
      isAdmin,
      access,
      selfId,
      allowedTeams,
      allPeople,
      visiblePeople,
      allowedPersonIds,
      resolveTeamAssignees: (requestedTeamId?: string): string[] | null => {
        const cleanTeam = requestedTeamId?.trim();
        if (cleanTeam) {
          if (allowedTeams !== null && !allowedTeams.includes(cleanTeam)) {
            throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงข้อมูลทีมนี้');
          }
          return visiblePeople
            .filter((p) => resolvePersonTeamId(p, p.track) === cleanTeam)
            .map((p) => p.id);
        }
        return allowedPersonIds ? [...allowedPersonIds] : null;
      },
      assertCanAccessPerson: (personId: string, opts?: { selfOnlyForMember?: boolean }): void => {
        if (isAdmin) return;
        const target = personId.trim();
        if (access === 'member' && opts?.selfOnlyForMember) {
          if (target !== selfId) {
            throw new ForbiddenException('สมาชิกดูข้อมูลส่วนตัวของผู้อื่นไม่ได้');
          }
          return;
        }
        if (allowedPersonIds && !allowedPersonIds.has(target)) {
          throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงข้อมูลพนักงานนอกทีม');
        }
      },
      canAccessTicket: (ticket: Ticket): boolean => {
        if (isAdmin || allowedPersonIds === null) return true;
        const assignee = ticket.assigneeId?.trim() ?? '';
        if (!assignee) {
          return true;
        }
        return allowedPersonIds.has(assignee);
      },
      assertCanAccessTicket: (ticket: Ticket, opts?: { allowUnassignedForMember?: boolean }): void => {
        if (isAdmin || allowedPersonIds === null) return;
        const assignee = ticket.assigneeId?.trim() ?? '';
        if (!assignee) {
          if (access === 'member' && opts?.allowUnassignedForMember === false) {
            throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงใบงานนี้');
          }
          return;
        }
        if (!allowedPersonIds.has(assignee)) {
          throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงใบงานนอกขอบเขตทีม');
        }
      },
    };
  }
}
