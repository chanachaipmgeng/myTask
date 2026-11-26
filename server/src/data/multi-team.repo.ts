import {
  EmployeeLeave,
  TicketAllocation,
  TicketDispute,
  TicketDueShift,
  TicketStageLog,
  TrackConfig,
  WorkflowStatus,
  VarianceCode,
  TrackCode,
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

export async function upsertLeave(db: Queryable, leave: EmployeeLeave): Promise<EmployeeLeave> {
  await db.query(
    `INSERT INTO employee_leaves (id, user_id, leave_date, leave_type, deduct_md, reason)
     VALUES ($1, $2, $3::date, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       leave_date = EXCLUDED.leave_date,
       leave_type = EXCLUDED.leave_type,
       deduct_md = EXCLUDED.deduct_md,
       reason = EXCLUDED.reason`,
    [leave.id, leave.userId, leave.leaveDate, leave.leaveType, leave.deductMd, leave.reason ?? null],
  );
  return leave;
}

export async function deleteLeave(db: Queryable, id: string): Promise<boolean> {
  const rows = await db.query<{ id: string }>('DELETE FROM employee_leaves WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
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
    completedAt: r.completed_at
      ? r.completed_at instanceof Date
        ? r.completed_at.toISOString()
        : String(r.completed_at)
      : undefined,
    individualScore: r.individual_score !== null ? Number(r.individual_score) : undefined,
  }));
}

export async function replaceAllocations(
  db: Queryable,
  ticketId: string,
  allocations: TicketAllocation[],
): Promise<TicketAllocation[]> {
  await db.query('DELETE FROM ticket_allocations WHERE ticket_id = $1', [ticketId]);
  for (const alloc of allocations) {
    await db.query(
      `INSERT INTO ticket_allocations (
         id, ticket_id, user_id, role_track, sub_role, estimated_md, actual_md,
         allocated_due_on, completed_at, individual_score
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::timestamptz, $10)`,
      [
        alloc.id,
        ticketId,
        alloc.userId,
        alloc.roleTrack,
        alloc.subRole ?? null,
        alloc.estimatedMd,
        alloc.actualMd,
        alloc.allocatedDueOn ?? null,
        alloc.completedAt ?? null,
        alloc.individualScore ?? null,
      ],
    );
  }
  return listAllocations(db, ticketId);
}

type DisputeRow = {
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
};

function mapDisputeRow(r: DisputeRow): TicketDispute {
  return {
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
    resolvedAt: r.resolved_at
      ? r.resolved_at instanceof Date
        ? r.resolved_at.toISOString()
        : String(r.resolved_at)
      : null,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

export async function nextDisputeCode(db: Queryable): Promise<string> {
  const rows = await db.query<{ n: string }>(`SELECT nextval('dispute_code_seq')::text AS n`);
  const next = Number(rows[0]?.n ?? 1);
  return `DSP-${new Date().getFullYear()}-${String(next).padStart(4, '0')}`;
}

export async function listDisputes(db: Queryable, requesterId?: string): Promise<TicketDispute[]> {
  const sql = requesterId
    ? 'SELECT * FROM ticket_disputes WHERE requester_id = $1 ORDER BY created_at DESC'
    : 'SELECT * FROM ticket_disputes ORDER BY created_at DESC';
  const params = requesterId ? [requesterId] : [];
  const rows = await db.query<DisputeRow>(sql, params);
  return rows.map(mapDisputeRow);
}

export async function getDispute(db: Queryable, id: string): Promise<TicketDispute | null> {
  const rows = await db.query<DisputeRow>('SELECT * FROM ticket_disputes WHERE id = $1', [id]);
  return rows[0] ? mapDisputeRow(rows[0]) : null;
}

export async function insertDispute(db: Queryable, dispute: TicketDispute): Promise<TicketDispute> {
  await db.query(
    `INSERT INTO ticket_disputes (
       id, dispute_code, ticket_id, requester_id, requested_flag, requested_reopen_override,
       reason, evidence_url, score_before, score_projected, status, reviewer_id,
       reviewer_comment, resolved_at, created_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::timestamptz, $15::timestamptz
     )`,
    [
      dispute.id,
      dispute.disputeCode,
      dispute.ticketId,
      dispute.requesterId,
      dispute.requestedFlag,
      dispute.requestedReopenOverride ?? null,
      dispute.reason,
      dispute.evidenceUrl ?? null,
      dispute.scoreBefore,
      dispute.scoreProjected,
      dispute.status,
      dispute.reviewerId ?? null,
      dispute.reviewerComment ?? null,
      dispute.resolvedAt ?? null,
      dispute.createdAt,
    ],
  );
  return dispute;
}

export async function resolveDisputeRow(
  db: Queryable,
  id: string,
  status: 'APPROVED' | 'REJECTED',
  reviewerId: string | null,
  comment?: string,
): Promise<TicketDispute | null> {
  const resolvedAt = new Date().toISOString();
  const rows = await db.query<DisputeRow>(
    `UPDATE ticket_disputes
     SET status = $2,
         reviewer_id = $3,
         reviewer_comment = $4,
         resolved_at = $5::timestamptz
     WHERE id = $1 AND status = 'PENDING'
     RETURNING *`,
    [id, status, reviewerId, comment ?? null, resolvedAt],
  );
  return rows[0] ? mapDisputeRow(rows[0]) : null;
}

export async function listStageLogs(db: Queryable, ticketId?: string): Promise<TicketStageLog[]> {
  const sql = ticketId
    ? 'SELECT * FROM ticket_stage_logs WHERE ticket_id = $1 ORDER BY entered_at'
    : 'SELECT * FROM ticket_stage_logs ORDER BY entered_at';
  const params = ticketId ? [ticketId] : [];
  const rows = await db.query<{
    id: string;
    ticket_id: string;
    from_status: string | null;
    to_status: string;
    changed_by: string | null;
    blocking_team: string | null;
    blocker_flag: string | null;
    entered_at: Date | string;
    exited_at: Date | string | null;
    duration_hours: string | number | null;
  }>(sql, params);

  return rows.map((r) => ({
    id: r.id,
    ticketId: r.ticket_id,
    fromStatus: (r.from_status as WorkflowStatus | null) ?? null,
    toStatus: r.to_status as WorkflowStatus,
    changedBy: r.changed_by,
    blockingTeam: (r.blocking_team as TrackCode | null) ?? null,
    blockerFlag: (r.blocker_flag as VarianceCode | 'NONE' | null) ?? 'NONE',
    enteredAt: r.entered_at instanceof Date ? r.entered_at.toISOString() : String(r.entered_at),
    exitedAt: r.exited_at
      ? r.exited_at instanceof Date
        ? r.exited_at.toISOString()
        : String(r.exited_at)
      : null,
    durationHours: r.duration_hours !== null ? Number(r.duration_hours) : null,
  }));
}

export async function insertStageLog(db: Queryable, log: TicketStageLog): Promise<TicketStageLog> {
  await db.query(
    `INSERT INTO ticket_stage_logs (
       id, ticket_id, from_status, to_status, changed_by, blocking_team, blocker_flag,
       entered_at, exited_at, duration_hours
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz, $10)`,
    [
      log.id,
      log.ticketId,
      log.fromStatus,
      log.toStatus,
      log.changedBy ?? null,
      log.blockingTeam ?? null,
      log.blockerFlag ?? 'NONE',
      log.enteredAt,
      log.exitedAt ?? null,
      log.durationHours ?? null,
    ],
  );
  return log;
}

export async function closeOpenStageLog(
  db: Queryable,
  ticketId: string,
  exitedAt: string,
): Promise<void> {
  await db.query(
    `UPDATE ticket_stage_logs
     SET exited_at = $2::timestamptz,
         duration_hours = ROUND(EXTRACT(EPOCH FROM ($2::timestamptz - entered_at)) / 3600.0, 2)
     WHERE ticket_id = $1 AND exited_at IS NULL`,
    [ticketId, exitedAt],
  );
}

export async function insertDueShift(db: Queryable, shift: TicketDueShift): Promise<TicketDueShift> {
  await db.query(
    `INSERT INTO ticket_due_shifts (
       id, ticket_id, previous_first_due_on, new_first_due_on, shift_days, reason,
       status, approved_by, approved_at, created_at
     ) VALUES ($1, $2, $3::date, $4::date, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz)`,
    [
      shift.id,
      shift.ticketId,
      shift.previousFirstDueOn,
      shift.newFirstDueOn,
      shift.shiftDays,
      shift.reason,
      shift.status,
      shift.approvedBy ?? null,
      shift.approvedAt,
      shift.createdAt,
    ],
  );
  return shift;
}

export async function listDueShifts(db: Queryable, ticketId?: string): Promise<TicketDueShift[]> {
  const sql = ticketId
    ? 'SELECT * FROM ticket_due_shifts WHERE ticket_id = $1 ORDER BY created_at DESC'
    : 'SELECT * FROM ticket_due_shifts ORDER BY created_at DESC';
  const params = ticketId ? [ticketId] : [];
  const rows = await db.query<{
    id: string;
    ticket_id: string;
    previous_first_due_on: Date | string;
    new_first_due_on: Date | string;
    shift_days: string | number;
    reason: string;
    status: string;
    approved_by: string | null;
    approved_at: Date | string;
    created_at: Date | string;
  }>(sql, params);

  return rows.map((r) => ({
    id: r.id,
    ticketId: r.ticket_id,
    previousFirstDueOn: String(r.previous_first_due_on).slice(0, 10),
    newFirstDueOn: String(r.new_first_due_on).slice(0, 10),
    shiftDays: Number(r.shift_days),
    reason: r.reason,
    status: r.status as TicketDueShift['status'],
    approvedBy: r.approved_by,
    approvedAt: r.approved_at instanceof Date ? r.approved_at.toISOString() : String(r.approved_at),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}
