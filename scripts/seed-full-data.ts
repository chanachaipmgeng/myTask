import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { Pool } = require(resolve(process.cwd(), 'server/node_modules/pg'));
import { SEED_PEOPLE, SEED_TICKETS } from '../shared/seed';
import { Ticket, WorkCategory, Discipline, WorkflowStatus, StoryPoint, PocResult, BugCause } from '../shared/domain/models';
import { buildPeriodSnapshots } from '../shared/domain/kpi-snapshot';
import { DEFAULT_TRACK_WEIGHTS } from '../shared/domain/scoring';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://manday:manday@localhost:5433/manday';

// Comprehensive set of realistic active & pipeline tickets
const ADDITIONAL_SIMULATED_TICKETS: Ticket[] = [
  // --- Epics / Parent Tasks for Gantt Hierarchy ---
  {
    id: 'IMP-EPIC-PAY',
    track: 'Implement',
    type: 'Feature',
    module: 'Payment & Billing System',
    title: 'ระบบชำระเงินและออกใบกำกับภาษีอัตโนมัติ (Payment & e-Tax Epic)',
    size: 'XL',
    estimateMd: 16,
    actualMd: 8,
    weekOffset: 0,
    reviewRounds: 1,
    blocker: false,
    reopenCount: 0,
    varianceCode: 'NONE',
    closed: false,
    dodPassed: false,
    inTimeBox: true,
    childTicketsSized: true,
    unplanned: false,
    assigneeId: 'paweena',
    closedOn: null,
    workingDaysLeft: 5,
    note: 'Parent Epic รวบรวมงานเชื่อมต่อ Payment Gateway และการออกใบเสร็จภาษี',
    workflowStatus: 'In Progress',
    discipline: 'Full-Stack',
    workCategory: 'Feature',
    storyPoints: 13,
    firstDueOn: '2026-11-28',
    actualStartOn: '2026-11-03',
    source: 'openproject',
    opId: 201,
  },
  {
    id: 'IMP-PAY-01',
    track: 'Implement',
    type: 'Feature',
    module: 'Payment Gateway',
    title: 'พัฒนาหน้าชำระเงิน QR PromptPay & Credit Card Form (UI)',
    size: 'M',
    estimateMd: 4,
    actualMd: 3,
    weekOffset: 0,
    reviewRounds: 1,
    blocker: false,
    reopenCount: 0,
    varianceCode: 'NONE',
    closed: false,
    dodPassed: false,
    inTimeBox: true,
    childTicketsSized: true,
    unplanned: false,
    assigneeId: 'itsara',
    closedOn: null,
    workingDaysLeft: 2,
    note: 'UI ฟอร์มกรอกบัตรและแสดง Dynamic QR Code รองรับ Mobile Web',
    workflowStatus: 'Code Review',
    discipline: 'FE',
    workCategory: 'Feature',
    storyPoints: 5,
    firstDueOn: '2026-11-20',
    actualStartOn: '2026-11-10',
    mrLink: 'https://gitlab.example.com/shop/web/-/merge_requests/42',
    parentId: 'IMP-EPIC-PAY',
    opParentId: 201,
    source: 'openproject',
    opId: 202,
  },
  {
    id: 'IMP-PAY-02',
    track: 'Implement',
    type: 'Feature',
    module: 'Payment Gateway API',
    title: 'ระบบ Webhook Callback ตรวจสอบยอดและหักยอดแบบ Idempotent',
    size: 'L',
    estimateMd: 6,
    actualMd: 5,
    weekOffset: 0,
    reviewRounds: 2,
    blocker: false,
    reopenCount: 0,
    varianceCode: 'NONE',
    closed: false,
    dodPassed: false,
    inTimeBox: true,
    childTicketsSized: true,
    unplanned: false,
    assigneeId: 'watchara',
    closedOn: null,
    workingDaysLeft: 3,
    note: 'รองรับ Idempotency-Key ป้องกันตัดเงินซ้ำซ้อนเมื่อเน็ตหลุด',
    workflowStatus: 'Ready for QA',
    discipline: 'BE',
    workCategory: 'Feature',
    storyPoints: 8,
    firstDueOn: '2026-11-22',
    actualStartOn: '2026-11-05',
    devDeliveredOn: '2026-11-14',
    mrLink: 'https://gitlab.example.com/shop/backend/-/merge_requests/88',
    parentId: 'IMP-EPIC-PAY',
    opParentId: 201,
    source: 'openproject',
    opId: 203,
  },
  {
    id: 'IMP-PAY-03',
    track: 'Implement',
    type: 'Feature',
    module: 'e-Tax System',
    title: 'เชื่อมต่อกรมสรรพากรออก e-Tax Invoice & e-Receipt PDF/A-3',
    size: 'M',
    estimateMd: 4,
    actualMd: 2,
    weekOffset: 0,
    reviewRounds: 0,
    blocker: false,
    reopenCount: 0,
    varianceCode: 'NONE',
    closed: false,
    dodPassed: false,
    inTimeBox: true,
    childTicketsSized: true,
    unplanned: false,
    assigneeId: 'kanchawee',
    closedOn: null,
    workingDaysLeft: 4,
    note: 'ลงลายมือชื่อดิจิทัล XML และแนบไฟล์ PDF ส่งให้ลูกค้าทางอีเมล',
    workflowStatus: 'In Progress',
    discipline: 'BE',
    workCategory: 'Feature',
    storyPoints: 5,
    firstDueOn: '2026-11-25',
    actualStartOn: '2026-11-12',
    parentId: 'IMP-EPIC-PAY',
    opParentId: 201,
    source: 'openproject',
    opId: 204,
  },

  // --- RD Epic: Enterprise AI Platform ---
  {
    id: 'RD-EPIC-AI',
    track: 'RD',
    type: 'Spike',
    module: 'Enterprise AI Platform',
    title: 'แพลตฟอร์ม AI ผู้ช่วยอัจฉริยะองค์กร (Enterprise AI Platform Epic)',
    size: 'XL',
    estimateMd: 18,
    actualMd: 10,
    weekOffset: 0,
    reviewRounds: 1,
    blocker: false,
    reopenCount: 0,
    varianceCode: 'NONE',
    closed: false,
    dodPassed: false,
    inTimeBox: true,
    childTicketsSized: true,
    unplanned: false,
    assigneeId: 'chanachai',
    closedOn: null,
    workingDaysLeft: 6,
    note: 'Parent Epic พัฒนาระบบ AI RAG Search, Code Intelligence และ Tool Calling',
    workflowStatus: 'In Progress',
    discipline: 'AI-Data',
    workCategory: 'R&D-PoC',
    storyPoints: 13,
    firstDueOn: '2026-11-30',
    actualStartOn: '2026-11-01',
    source: 'openproject',
    opId: 301,
  },
  {
    id: 'RD-AI-01',
    track: 'RD',
    type: 'Spike',
    module: 'RAG Pipeline',
    title: 'สร้าง Hybrid Vector Search Engine (pgvector + OpenSearch BM25)',
    size: 'L',
    estimateMd: 6,
    actualMd: 5,
    weekOffset: 0,
    reviewRounds: 1,
    blocker: false,
    reopenCount: 0,
    varianceCode: 'NONE',
    closed: false,
    dodPassed: false,
    inTimeBox: true,
    childTicketsSized: true,
    unplanned: false,
    assigneeId: 'nakarin',
    closedOn: null,
    workingDaysLeft: 2,
    note: 'ทำ Reciprocal Rank Fusion ผสานผลลัพธ์เวกเตอร์และคีย์เวิร์ดภาษาไทย',
    workflowStatus: 'Code Review',
    discipline: 'AI-Data',
    workCategory: 'R&D-PoC',
    storyPoints: 8,
    firstDueOn: '2026-11-19',
    actualStartOn: '2026-11-08',
    mrLink: 'https://gitlab.example.com/ai/rag-pipeline/-/merge_requests/15',
    parentId: 'RD-EPIC-AI',
    opParentId: 301,
    source: 'openproject',
    opId: 302,
  },
  {
    id: 'RD-AI-02',
    track: 'RD',
    type: 'Spike',
    module: 'Model Quantization',
    title: 'ทดสอบ Local LLM Quantization 4-bit (AWQ vs GGUF) บน GPU Server',
    size: 'M',
    estimateMd: 4,
    actualMd: 4,
    weekOffset: 0,
    reviewRounds: 1,
    blocker: false,
    reopenCount: 0,
    varianceCode: 'NONE',
    closed: false,
    dodPassed: false,
    inTimeBox: true,
    childTicketsSized: true,
    unplanned: false,
    assigneeId: 'sawit',
    closedOn: null,
    workingDaysLeft: 1,
    note: 'วัด Throughput (tokens/s) และ VRAM footprint บน RTX 4090 / A100',
    workflowStatus: 'In QA',
    discipline: 'Infra',
    workCategory: 'R&D-PoC',
    storyPoints: 5,
    pocResult: 'Adopted',
    firstDueOn: '2026-11-18',
    actualStartOn: '2026-11-06',
    parentId: 'RD-EPIC-AI',
    opParentId: 301,
    source: 'openproject',
    opId: 303,
  },
  {
    id: 'RD-AI-03',
    track: 'RD',
    type: 'Spike',
    module: 'Voice Streaming',
    title: 'เชื่อมต่อ WebRTC Real-time Voice Transcription กับ Whisper V3',
    size: 'M',
    estimateMd: 4,
    actualMd: 3,
    weekOffset: 0,
    reviewRounds: 0,
    blocker: false,
    reopenCount: 0,
    varianceCode: 'NONE',
    closed: false,
    dodPassed: false,
    inTimeBox: true,
    childTicketsSized: true,
    unplanned: false,
    assigneeId: 'natthana',
    closedOn: null,
    workingDaysLeft: 3,
    note: 'ตัดเสียงรบกวนด้วย RNNoise และสตรีมมิ่งคำบรรยายเสียงภาษาไทย',
    workflowStatus: 'In Progress',
    discipline: 'AI-Data',
    workCategory: 'R&D-PoC',
    storyPoints: 5,
    firstDueOn: '2026-11-24',
    actualStartOn: '2026-11-11',
    parentId: 'RD-EPIC-AI',
    opParentId: 301,
    source: 'openproject',
    opId: 304,
  },

  // --- Slipped Tasks (Highlighted in Schedule & Alerts) ---
  {
    id: 'IMP-SLIP-01',
    track: 'Implement',
    type: 'CR',
    module: 'Shipping Integration',
    title: 'เชื่อมโยงระบบ Tracking ขนส่ง Flash Express & Kerry API',
    size: 'M',
    estimateMd: 3,
    actualMd: 5,
    weekOffset: 1,
    reviewRounds: 2,
    blocker: false,
    reopenCount: 1,
    varianceCode: 'ENV',
    closed: false,
    dodPassed: false,
    inTimeBox: false,
    childTicketsSized: true,
    unplanned: false,
    assigneeId: 'natthaphat',
    closedOn: null,
    workingDaysLeft: -2,
    note: 'ติดปัญหา Sandbox API ของผู้ให้บริการขนส่งล่ม (หลุดกำหนด 1 สัปดาห์)',
    workflowStatus: 'In Progress',
    discipline: 'BE',
    workCategory: 'Feature',
    storyPoints: 5,
    firstDueOn: '2026-11-07',
    dueOn: '2026-11-18',
    actualStartOn: '2026-10-28',
    source: 'openproject',
    opId: 205,
  },
  {
    id: 'RD-SLIP-01',
    track: 'RD',
    type: 'Bug-Fix',
    module: 'Anomaly Detector',
    title: 'แก้ไข Memory Leak ในสตรีมมิ่ง Z-Score Anomaly Worker',
    size: 'S',
    estimateMd: 2,
    actualMd: 4,
    weekOffset: 2,
    reviewRounds: 3,
    blocker: true,
    reopenCount: 2,
    varianceCode: 'REQ',
    closed: false,
    dodPassed: false,
    inTimeBox: false,
    childTicketsSized: true,
    unplanned: true,
    assigneeId: 'sirawit',
    closedOn: null,
    workingDaysLeft: -4,
    note: 'Worker สะสม Buffer อาร์เรย์ไม่คืนหน่วยความจำ ทำให้ Pod โดน OOMKilled',
    workflowStatus: 'Reopened',
    discipline: 'BE',
    workCategory: 'BugProduction',
    storyPoints: 3,
    bugCause: 'Logic',
    firstDueOn: '2026-11-01',
    dueOn: '2026-11-17',
    actualStartOn: '2026-10-20',
    source: 'openproject',
    opId: 305,
  },

  // --- Active Pipeline Tickets for remaining members ---
  {
    id: 'IMP-TD-01',
    track: 'Implement',
    type: 'Feature',
    module: 'User Profile',
    title: 'เพิ่มระบบ 2FA (Two-Factor Authentication) ด้วย TOTP Authenticator',
    size: 'S',
    estimateMd: 2,
    actualMd: 0,
    weekOffset: 0,
    reviewRounds: 0,
    blocker: false,
    reopenCount: 0,
    varianceCode: 'NONE',
    closed: false,
    dodPassed: false,
    inTimeBox: true,
    childTicketsSized: true,
    unplanned: false,
    assigneeId: 'itsara',
    closedOn: null,
    workingDaysLeft: 5,
    note: 'พร้อมเริ่มทำงาน สเปกและ Security Review ผ่านแล้ว',
    workflowStatus: 'Backlog',
    discipline: 'FE',
    workCategory: 'Feature',
    storyPoints: 3,
    firstDueOn: '2026-11-29',
    source: 'openproject',
    opId: 206,
  },
  {
    id: 'IMP-TD-02',
    track: 'Implement',
    type: 'Bug-Fix',
    module: 'Order Cart',
    title: 'แก้ปัญหาผลรวมยอดคำสั่งซื้อไม่ตรงกับยอดส่วนลดคูปองในบางกรณี',
    size: 'S',
    estimateMd: 1.5,
    actualMd: 0,
    weekOffset: 0,
    reviewRounds: 0,
    blocker: false,
    reopenCount: 0,
    varianceCode: 'NONE',
    closed: false,
    dodPassed: false,
    inTimeBox: true,
    childTicketsSized: true,
    unplanned: true,
    assigneeId: 'kanchawee',
    closedOn: null,
    workingDaysLeft: 4,
    note: 'รอคิวทำหลังจบโมดูล e-Tax Invoice',
    workflowStatus: 'Backlog',
    discipline: 'Full-Stack',
    workCategory: 'BugInternal',
    storyPoints: 2,
    bugCause: 'Logic',
    firstDueOn: '2026-11-26',
    source: 'openproject',
    opId: 207,
  },
  {
    id: 'RD-ACTIVE-01',
    track: 'RD',
    type: 'Spike',
    module: 'Semantic Cache',
    title: 'พัฒนา Semantic Caching ด้วย Redis VSS ลด Latency ของ LLM ตอบคำถาม',
    size: 'M',
    estimateMd: 3,
    actualMd: 2,
    weekOffset: 0,
    reviewRounds: 1,
    blocker: false,
    reopenCount: 0,
    varianceCode: 'NONE',
    closed: false,
    dodPassed: false,
    inTimeBox: true,
    childTicketsSized: true,
    unplanned: false,
    assigneeId: 'phanthakan',
    closedOn: null,
    workingDaysLeft: 3,
    note: 'ทำ Cache คำถามที่มีความหมายใกล้เคียงเกิน 0.95 คืนคำตอบเดิมใน 5ms',
    workflowStatus: 'In Progress',
    discipline: 'AI-Data',
    workCategory: 'R&D-PoC',
    storyPoints: 5,
    firstDueOn: '2026-11-21',
    actualStartOn: '2026-11-11',
    source: 'openproject',
    opId: 306,
  },
  {
    id: 'RD-ACTIVE-02',
    track: 'RD',
    type: 'Feature',
    module: 'Model Serving',
    title: 'ติดตั้ง Triton Inference Server พร้อม Dynamic Batching บน Kubernetes',
    size: 'L',
    estimateMd: 5,
    actualMd: 4,
    weekOffset: 0,
    reviewRounds: 1,
    blocker: false,
    reopenCount: 0,
    varianceCode: 'NONE',
    closed: false,
    dodPassed: false,
    inTimeBox: true,
    childTicketsSized: true,
    unplanned: false,
    assigneeId: 'aphisit',
    closedOn: null,
    workingDaysLeft: 2,
    note: 'เปิดรองรับ gRPC และ HTTP/2 streaming พร้อม Auto-scaling',
    workflowStatus: 'Ready for QA',
    discipline: 'Infra',
    workCategory: 'Feature',
    storyPoints: 8,
    firstDueOn: '2026-11-19',
    actualStartOn: '2026-11-04',
    devDeliveredOn: '2026-11-14',
    mrLink: 'https://gitlab.example.com/infra/triton/-/merge_requests/9',
    source: 'openproject',
    opId: 307,
  },
  {
    id: 'RD-ACTIVE-03',
    track: 'RD',
    type: 'Spike',
    module: 'Safety & Guardrails',
    title: 'สร้าง Guardrails ตรวจสอบคำตอบ LLM ป้องกัน PII รั่วไหลและ Jailbreak',
    size: 'M',
    estimateMd: 3,
    actualMd: 2,
    weekOffset: 0,
    reviewRounds: 1,
    blocker: false,
    reopenCount: 0,
    varianceCode: 'NONE',
    closed: false,
    dodPassed: false,
    inTimeBox: true,
    childTicketsSized: true,
    unplanned: false,
    assigneeId: 'dirasit',
    closedOn: null,
    workingDaysLeft: 3,
    note: 'เชื่อมโยง NeMo Guardrails และ Regex ฟิลเตอร์เลขบัตรประชาชน/เบอร์โทร',
    workflowStatus: 'In QA',
    discipline: 'AI-Data',
    workCategory: 'R&D-PoC',
    storyPoints: 5,
    firstDueOn: '2026-11-20',
    actualStartOn: '2026-11-09',
    pocResult: 'Adopted',
    source: 'openproject',
    opId: 308,
  },
  {
    id: 'RD-ACTIVE-04',
    track: 'RD',
    type: 'Feature',
    module: 'Data Lakehouse',
    title: 'ออกแบบ DuckDB & Apache Parquet Storage สำหรับ Analytics Intelligence',
    size: 'M',
    estimateMd: 4,
    actualMd: 3,
    weekOffset: 0,
    reviewRounds: 0,
    blocker: false,
    reopenCount: 0,
    varianceCode: 'NONE',
    closed: false,
    dodPassed: false,
    inTimeBox: true,
    childTicketsSized: true,
    unplanned: false,
    assigneeId: 'korakot',
    closedOn: null,
    workingDaysLeft: 3,
    note: 'เพิ่มประสิทธิภาพคิวรีข้อมูลสถิติใบงานย้อนหลัง 12 เดือนภายใน 50ms',
    workflowStatus: 'In Progress',
    discipline: 'AI-Data',
    workCategory: 'Feature',
    storyPoints: 5,
    firstDueOn: '2026-11-23',
    actualStartOn: '2026-11-10',
    source: 'openproject',
    opId: 309,
  },
  {
    id: 'RD-ACTIVE-05',
    track: 'RD',
    type: 'Spike',
    module: 'Agentic Workflow',
    title: 'พัฒนา Subagent Tool-use Framework สำหรับ Auto-code Refactor',
    size: 'L',
    estimateMd: 6,
    actualMd: 4,
    weekOffset: 0,
    reviewRounds: 1,
    blocker: false,
    reopenCount: 0,
    varianceCode: 'NONE',
    closed: false,
    dodPassed: false,
    inTimeBox: true,
    childTicketsSized: true,
    unplanned: false,
    assigneeId: 'nattasit',
    closedOn: null,
    workingDaysLeft: 2,
    note: 'รองรับ Function Calling สำหรับสร้าง Unit Test และรัน Linter อัตโนมัติ',
    workflowStatus: 'Code Review',
    discipline: 'AI-Data',
    workCategory: 'R&D-PoC',
    storyPoints: 8,
    firstDueOn: '2026-11-19',
    actualStartOn: '2026-11-06',
    mrLink: 'https://gitlab.example.com/ai/agent-tools/-/merge_requests/3',
    source: 'openproject',
    opId: 310,
  },
  // --- Blocked Task for Kanban Visualization ---
  {
    id: 'IMP-BLK-01',
    track: 'Implement',
    type: 'Feature',
    module: 'ERP Integration',
    title: 'เชื่อมโยงข้อมูลสต็อกสินค้ากับระบบ SAP S/4HANA (On-Premise)',
    size: 'L',
    estimateMd: 5,
    actualMd: 2,
    weekOffset: 0,
    reviewRounds: 0,
    blocker: true,
    reopenCount: 0,
    varianceCode: 'BLK',
    closed: false,
    dodPassed: false,
    inTimeBox: true,
    childTicketsSized: true,
    unplanned: false,
    assigneeId: 'natthaphat',
    closedOn: null,
    workingDaysLeft: 4,
    note: 'ติดบล็อก: รอทีมเน็ตเวิร์กของลูกค้าเปิดพอร์ต VPN และมอบสิทธิ์ SAP RFC',
    workflowStatus: 'Backlog',
    discipline: 'BE',
    workCategory: 'Feature',
    storyPoints: 8,
    firstDueOn: '2026-11-28',
    source: 'openproject',
    opId: 208,
  },
];

async function runSeed(): Promise<void> {
  console.log(`Connecting to database at ${DATABASE_URL}...`);
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // 1. Departments and Teams
    await pool.query(`INSERT INTO departments (id, name) VALUES ('dev', 'Development') ON CONFLICT (id) DO NOTHING;`);
    await pool.query(`INSERT INTO teams (id, department_id, name) VALUES ('implement', 'dev', 'Implement') ON CONFLICT (id) DO NOTHING;`);
    await pool.query(`INSERT INTO teams (id, department_id, name) VALUES ('rd', 'dev', 'R&D') ON CONFLICT (id) DO NOTHING;`);

    // 2. Upsert People
    console.log(`Upserting ${SEED_PEOPLE.length} people...`);
    let opUserCounter = 101;
    for (const person of SEED_PEOPLE) {
      const teamId = person.track === 'RD' ? 'rd' : 'implement';
      const access =
        person.id === 'paweena' || person.id === 'chanachai'
          ? 'admin'
          : person.id === 'watchara'
            ? 'lead'
            : 'member';
      const email = `${person.id}@company.com`;
      const opUserId = opUserCounter++;

      await pool.query(
        `INSERT INTO people (
           id, nickname, full_name, role_title, level, track, planned_md, team_id, access, email, gitlab_username, openproject_user_id, active
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true)
         ON CONFLICT (id) DO UPDATE SET
           nickname = EXCLUDED.nickname,
           full_name = EXCLUDED.full_name,
           role_title = EXCLUDED.role_title,
           level = EXCLUDED.level,
           track = EXCLUDED.track,
           planned_md = EXCLUDED.planned_md,
           team_id = EXCLUDED.team_id,
           access = EXCLUDED.access,
           email = EXCLUDED.email,
           gitlab_username = EXCLUDED.gitlab_username,
           openproject_user_id = EXCLUDED.openproject_user_id,
           active = true`,
        [
          person.id,
          person.nickname,
          person.fullName,
          person.role,
          person.level,
          person.track,
          person.plannedMd,
          teamId,
          access,
          email,
          person.gitlabUsername ?? person.id,
          opUserId,
        ]
      );
    }

    // Set team leads
    await pool.query(`UPDATE teams SET lead_id = 'paweena' WHERE id = 'implement';`);
    await pool.query(`UPDATE teams SET lead_id = 'chanachai' WHERE id = 'rd';`);

    // 3. Upsert Work Items (Original Seed Tickets + Additional Simulated Active Tickets)
    const allTickets: Ticket[] = [...SEED_TICKETS, ...ADDITIONAL_SIMULATED_TICKETS];
    console.log(`Upserting ${allTickets.length} work items into database...`);

    for (const ticket of allTickets) {
      const source = ticket.source ?? 'local';
      await pool.query(
        `INSERT INTO work_items (id, source, op_id, assignee_id, closed, closed_on, data, synced_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, now(), now())
         ON CONFLICT (id) DO UPDATE SET
           source = EXCLUDED.source,
           op_id = EXCLUDED.op_id,
           assignee_id = EXCLUDED.assignee_id,
           closed = EXCLUDED.closed,
           closed_on = EXCLUDED.closed_on,
           data = EXCLUDED.data,
           updated_at = now()`,
        [
          ticket.id,
          source,
          ticket.opId ?? null,
          ticket.assigneeId,
          ticket.closed,
          ticket.closedOn,
          JSON.stringify(ticket),
        ]
      );
    }

    // 4. Generate KPI Snapshots for 2025-08, 2025-09, 2025-10, 2025-11, and 2025-Q3
    console.log('Generating KPI historical snapshots for team...');
    const periodsToCapture: { type: 'month' | 'quarter'; key: string }[] = [
      { type: 'month', key: '2025-08' },
      { type: 'month', key: '2025-09' },
      { type: 'month', key: '2025-10' },
      { type: 'month', key: '2025-11' },
      { type: 'quarter', key: '2025-Q3' },
    ];

    let snapshotCount = 0;
    for (const period of periodsToCapture) {
      const rows = buildPeriodSnapshots(SEED_PEOPLE, allTickets, period.type, period.key, DEFAULT_TRACK_WEIGHTS);
      for (const row of rows) {
        await pool.query(
          `INSERT INTO kpi_snapshots (
             period_type, period_key, person_id, track, nickname, score, captured_at, captured_by
           ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, now() - INTERVAL '1 day', 'system')
           ON CONFLICT (period_type, period_key, person_id) DO UPDATE SET
             score = EXCLUDED.score,
             captured_at = EXCLUDED.captured_at`,
          [
            row.periodType,
            row.periodKey,
            row.personId,
            row.track,
            row.nickname,
            JSON.stringify(row.score),
          ]
        );
        snapshotCount++;
      }
    }
    console.log(`Generated ${snapshotCount} KPI snapshot records across ${periodsToCapture.length} periods.`);

    // 5. Populate Sync Runs
    console.log('Populating OpenProject sync runs...');
    const syncRunsData = [
      { trigger: 'schedule', added: 4, updated: 8, unchanged: 54, status: 'success', hoursAgo: 14 },
      { trigger: 'schedule', added: 2, updated: 4, unchanged: 66, status: 'success', hoursAgo: 10 },
      { trigger: 'schedule', added: 1, updated: 3, unchanged: 69, status: 'success', hoursAgo: 6 },
      { trigger: 'manual', startedBy: 'paweena', added: 3, updated: 5, unchanged: 70, status: 'success', hoursAgo: 3 },
      { trigger: 'schedule', added: 0, updated: 2, unchanged: 78, status: 'success', hoursAgo: 1 },
    ];

    for (const run of syncRunsData) {
      await pool.query(
        `INSERT INTO sync_runs (
           connection, trigger, started_by, started_at, finished_at, status, added, updated, unchanged, errors
         ) VALUES (
           'openproject', $1, $2, now() - ($3 || ' hours')::interval, now() - ($3 || ' hours')::interval + interval '12 seconds',
           $4, $5, $6, $7, '[]'::jsonb
         )`,
        [
          run.trigger,
          run.startedBy ?? null,
          run.hoursAgo.toString(),
          run.status,
          run.added,
          run.updated,
          run.unchanged,
        ]
      );
    }

    // 6. Populate Audit Logs
    console.log('Populating Audit log entries...');
    const auditEntries = [
      { actor: 'paweena', action: 'settings.update', target: 'track_weights', detail: { rd: 35, implement: 35, delivery: 30 }, daysAgo: 5 },
      { actor: 'paweena', action: 'person.role', target: 'watchara', detail: { previous: 'member', new: 'lead' }, daysAgo: 4 },
      { actor: 'chanachai', action: 'kpi.capture', target: '2025-09', detail: { periodType: 'month', rows: 15 }, daysAgo: 3 },
      { actor: 'paweena', action: 'kpi.capture', target: '2025-10', detail: { periodType: 'month', rows: 15 }, daysAgo: 2 },
      { actor: 'paweena', action: 'analytics.run', target: 'python_engine', detail: { engine: 'python-analytics-3.11', readinessScore: 94 }, daysAgo: 1 },
      { actor: 'chanachai', action: 'sync.trigger', target: 'openproject', detail: { syncType: 'incremental', workItems: 72 }, daysAgo: 1 },
      { actor: 'watchara', action: 'ticket.status_change', target: 'IMP-PAY-02', detail: { from: 'In Progress', to: 'Ready for QA' }, daysAgo: 0 },
    ];

    for (const entry of auditEntries) {
      await pool.query(
        `INSERT INTO audit_log (at, actor_id, action, target, detail)
         VALUES (now() - ($1 || ' days')::interval, $2, $3, $4, $5::jsonb)`,
        [
          entry.daysAgo.toString(),
          entry.actor,
          entry.action,
          entry.target,
          JSON.stringify(entry.detail),
        ]
      );
    }

    // 7. Enable Integrations & Connections
    console.log('Enabling simulated connections...');
    await pool.query(
      `INSERT INTO connections (id, base_url, token_enc, enabled, updated_by, updated_at)
       VALUES ('openproject', 'https://openproject.example.com', 'simulated_enc_token', true, 'paweena', now())
       ON CONFLICT (id) DO UPDATE SET enabled = true, base_url = EXCLUDED.base_url, token_enc = EXCLUDED.token_enc;`
    );
    await pool.query(
      `INSERT INTO connections (id, base_url, token_enc, enabled, updated_by, updated_at)
       VALUES ('gitlab', 'https://gitlab.example.com', 'simulated_enc_token', true, 'paweena', now())
       ON CONFLICT (id) DO UPDATE SET enabled = true, base_url = EXCLUDED.base_url, token_enc = EXCLUDED.token_enc;`
    );
    await pool.query(
      `INSERT INTO connections (id, base_url, token_enc, enabled, updated_by, updated_at)
       VALUES ('teams', 'https://outlook.office.com/webhook/simulated-channel', 'simulated_enc_token', true, 'paweena', now())
       ON CONFLICT (id) DO UPDATE SET enabled = true, base_url = EXCLUDED.base_url, token_enc = EXCLUDED.token_enc;`
    );

    console.log('✅ All data simulation completed successfully!');
  } finally {
    await pool.end();
  }
}

runSeed().catch((err) => {
  console.error('❌ Error during data simulation:', err);
  process.exit(1);
});
