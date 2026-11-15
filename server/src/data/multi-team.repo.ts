import {
  EmployeeLeave,
  TicketAllocation,
  TicketDispute,
  TicketStageLog,
  TrackConfig,
} from '../../../shared/domain/models';
import { Queryable } from '../db/db.service';

export async function listTrackConfigs(db: Queryable): Promise<TrackConfig[]> {
  const rows = await db.query<{
    track_code: string;
    track_name: string;
    target_index: string | number;
    formula_weights: Record<string, number> | string;
    sla_thresholds: Record<string, number> | string;
    updated_by: string | null;
    updated_at: Date | string;
  }>('SELECT * FROM track_configs ORDER BY track_code');

  return rows.map((r) => ({
    trackCode: r.track_code as TrackConfig['trackCode'],
    trackName: r.track_name,
    targetIndex: Number(r.target_index),
    formulaWeights: typeof r.formula_weights === 'string' ? JSON.parse(r.formula_weights) : r.formula_weights,
    slaThresholds: typeof r.sla_thresholds === 'string' ? JSON.parse(r.sla_thresholds) : r.sla_thresholds,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  }));
}

export async function listLeaves(db: Queryable, userId?: string): Promise<EmployeeLeave[]> {
  const sql = userId
    ? 'SELECT * FROM employee_leaves WHERE user_id = $1 ORDER BY leave_date'
    : 'SELECT * FROM employee_leaves ORDER BY leave_date';
  const params = userId ? [userId] : [];
  const rows = await db.query<{
    id: string;
    user_id: string;
    leave_date: Date | string;
    leave_type: string;
    deduct_md: string | number;
    reason: string | null;
  }>(sql, params);

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    leaveDate: r.leave_date instanceof Date ? r.leave_date.toISOString().slice(0, 10) : String(r.leave_date).slice(0, 10),
    leaveType: r.leave_type as EmployeeLeave['leaveType'],
    deductMd: Number(r.deduct_md),
    reason: r.reason ?? undefined,
  }));
}

export async function listAllocations(db: Queryable, ticketId?: string): Promise<TicketAllocation[]> {
  const sql = ticketId
    ? 'SELECT * FROM ticket_allocations WHERE ticket_id = $1 ORDER BY created_at'
    : 'SELECT * FROM ticket_allocations ORDER BY created_at';
  const params = ticketId ? [ticketId] : [];
  const rows = await db.query<{
    id: string;
    ticket_id: string;
    user_id: string;
    role_track: string;
    sub_role: string | null;
    estimated_md: string | number;
    actual_md: string | number;
    allocated_due_on: Date | string | null;
    completed_at: Date | string | null;
    individual_score: string | number | null;
  }>(sql, params);

  return rows.map((r) => ({
    id: r.id,
    ticketId: r.ticket_id,
    userId: r.user_id,
    roleTrack: r.role_track as TicketAllocation['roleTrack'],
    subRole: r.sub_role ?? undefined,
    estimatedMd: Number(r.estimated_md),
    actualMd: Number(r.actual_md),
    allocatedDueOn: r.allocated_due_on ? String(r.allocated_due_on).slice(0, 10) : undefined,
    completedAt: r.completed_at ? (r.completed_at instanceof Date ? r.completed_at.toISOString() : String(r.completed_at)) : undefined,
    individualScore: r.individual_score !== null ? Number(r.individual_score) : undefined,
  }));
}

export async function listDisputes(db: Queryable, requesterId?: string): Promise<TicketDispute[]> {
  const sql = requesterId
    ? 'SELECT * FROM ticket_disputes WHERE requester_id = $1 ORDER BY created_at DESC'
    : 'SELECT * FROM ticket_disputes ORDER BY created_at DESC';
  const params = requesterId ? [requesterId] : [];
  const rows = await db.query<{
    id: string;
    dispute_code: string;
    ticket_id: string;
    requester_id: string;
    requested_flag: string;
    requested_reopen_override: number | null;
    reason: string;
    evidence_url: string | null;
    score_before: string | number;
    score_projected: string | number;
    status: string;
    reviewer_id: string | null;
    reviewer_comment: string | null;
    resolved_at: Date | string | null;
    created_at: Date | string;
  }>(sql, params);

  return rows.map((r) => ({
    id: r.id,
    disputeCode: r.dispute_code,
    ticketId: r.ticket_id,
    requesterId: r.requester_id,
    requestedFlag: r.requested_flag as TicketDispute['requestedFlag'],
    requestedReopenOverride: r.requested_reopen_override ?? undefined,
    reason: r.reason,
    evidenceUrl: r.evidence_url ?? undefined,
    scoreBefore: Number(r.score_before),
    scoreProjected: Number(r.score_projected),
    status: r.status as TicketDispute['status'],
    reviewerId: r.reviewer_id,
    reviewerComment: r.reviewer_comment,
    resolvedAt: r.resolved_at ? (r.resolved_at instanceof Date ? r.resolved_at.toISOString() : String(r.resolved_at)) : null,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}
