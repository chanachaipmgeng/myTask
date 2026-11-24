# Agents — Man-day Scorecard

คำแนะนำหลักสำหรับ AI/นักพัฒนาในรีโปนี้ (รายละเอียดลึกแยกอยู่ใน `.agents/rules/*.md` และ `.cursor/rules/*.mdc`)

## อ่านก่อน

1. [docs/ระบบ.md](docs/ระบบ.md) — สถาปัตยกรรมและโมดูล  
2. [docs/แผนงาน.md](docs/แผนงาน.md) — สิ่งที่ควรทำต่อ  
3. [docs/คู่มือ.md](docs/คู่มือ.md) — ติดตั้ง รัน Docker ซิงก์ แก้ปัญหา  

## Rules / Skills ในโปรเจกต์

| ชนิด | พาธ |
|---|---|
| Workspace Rules | `.agents/rules/myhr-ui-and-teams.md`, `.agents/rules/syncfusion-wrappers.md`, `.cursor/rules/*.mdc` |
| Project Skills | `.agents/skills/manday-docker-stack/SKILL.md`, `.agents/skills/openproject-fields/SKILL.md`, `.cursor/skills/*/SKILL.md` |

## คำสั่งตรวจขั้นต่ำ & Windows Shell Guardrail

```powershell
npm run verify
npm --prefix server run test
npm run build
npm --prefix server run build
```

- **Windows PowerShell 5.1 Guardrail**: ห้ามใช้ตัวคั่น `&&` หรือ ternary `? :` ในคำสั่ง PowerShell (จะเกิด `ParserError: InvalidEndOfLine`) ให้คั่นคำสั่งด้วย `;` หรือตรวจ `if ($LASTEXITCODE -eq 0) { ... }` เสมอ
- **Windows Parallel `edit_file` Guardrail**: ห้ามเรียก `edit_file` ขนานหลายรายการใส่**ไฟล์เดียวกัน**ในเทิร์นเดียวบน Windows (จะติด `user-mapped section open`) ให้รวมการแก้ในไฟล์เดียวกันเป็นบล็อกเดียวหรือแยกเทิร์น
- **Docker Stack (`npm run docker:up|ps|logs|down`)**: `web` (`:8080` Nginx SPA + proxy `/api/`), `api` (`:3000` NestJS), `db` (`:5433` Postgres 16), `adminer` (`:8088`), `db-backup` (`--profile backup`) · คอนเทนเนอร์ `node:22-bookworm-slim` ไม่มี `wget`/`curl` ต้องใช้ Native Node `fetch('http://127.0.0.1:3000/api/health')` คู่กับ `@Public() @Get('health')` เสมอ

## Angular UI, MyHR Prism Color System & Syncfusion

- Angular **22.2.6** (pin) · **signals / computed / `@if` `@for`** · **OnPush** ทุก component · คง **Zone** (`provideZoneChangeDetection`) · Syncfusion ใช้ `[value]="x()"` + `(change)` ไม่ใช้ `[(value)]` กับ class field · เรียกผ่าน `app-sf-*` wrappers (`src/app/shared/sf/`) ยกเว้น root shell (`ejs-sidebar`, `ejs-appbar`, `ejs-toast`) และ `ejs-skeleton`
- **Brand Anchor & MyHR Prism 8-Hue Spectrum (`shared/domain/palette.ts` & `src/app/shared/ui/badge.ts`)**:
  - **คงสีหลักบริษัท (Corporate Royal Blue `#2746b3` → `#3154cc` → `#3b60dc`)** เฉพาะจุดยึดแบรนด์: Sidebar (`#app-nav`), พื้นหลังหลัก (`#f4f7fe` Light / `#0b1120` Dark), แถบซ้าย `app-hero-band`, Active Underline Tab (`.hub-underline-tab`), และปุ่ม `.e-btn.e-primary` · **ห้ามย้อมแบรนด์เป็น lime/sage** และ**ห้ามยุบ `--teal`/`--cyan`/`--violet`/`--coral` กลับเป็นสีน้ำเงินเดียวกับ `--primary`**
  - **6 สายงาน**: `IMP`/`Implement` (`primary` `#2746b3`) · `RND`/`RD` (`teal` `#0d9488`) · `QA` (`info` `#0284c7`) · `UXBA` (`violet` `#7c3aed`) · `SUP` (`warning` `#d97706`) · `INFRA` (`coral` `#ea580c`)
  - **Workflow Stages**: `Backlog` (`secondary`) · `In Progress` (`primary`) · `Code Review` (`violet`) · `Ready for QA` (`coral`) · `In QA` (`info`) · `Done` (`success`) · `Reopened`/`Blocked` (`danger`)
  - **Soft-Tinted Pill Badges (`BadgeTone` 10 โทน)**: `.e-badge:not(.e-badge-notification)` ใช้พื้นโปร่งแสง + ขอบ 1px (`--b-bg`, `--b-border`, `--b-fg`) ส่วน `.e-badge-notification` บนกระดิ่ง AppBar คงสีแดงทึบ
  - **Semantic Action Buttons (ห้ามใส่ `:hover transform`)**: `.e-primary` (CTA หลัก), `.e-success` (`+ สร้างใบงาน`/อนุมัติ/Resume), `.e-info`/`.e-btn-teal` (ซิงก์ GitLab/myProject/รีเฟรช), `.e-btn-violet` (วิเคราะห์ Python/AI/OLS), `.e-warning` (Ping SLA/อุทธรณ์), `.e-danger` (ตีกลับ Dev/ลบ) ทั้งทึบและ `.e-outline`
  - **Multi-Accent KPI & Charts**: `app-kpi-stat` รองรับ `KpiAccent` 8 โทน (`default|success|warning|danger|info|teal|violet|coral`) · `app-hero-band` มีจุดสี Prism หน้าหัวข้อดัชนี · ชาร์ตผูก `[theme]="theme.sfTheme()"` + `prismChartPalette(theme.isDark())` · Heatmap ใช้ 4 ช่วง (`0:#f43f5e` → `65:#f59e0b` → `80:#0ea5e9` → `100:#10b981`)
- **Surface, Theme & SCSS Budget**:
  - โทเคนใน `src/styles.scss`: `--radius-panel` 24 → `--radius-card` 18 → `--radius-nested` 14 · `--shadow-card*` · `--ease-crisp` / `--ease-nordic` + `--dur-*` · ตัวเลข KPI ใช้ `tabular-nums`
  - Scoped SCSS ใช้ CSS Custom Properties + `:host-context(.e-light-mode)` / `:host-context(body:not(.e-dark-mode))` แทนการเขียน `body.e-light-mode` ตรงๆ เพื่อสลับธีมแบบ zero-reload และคุมขนาดไม่ให้เกิน `anyComponentStyle` (`28kB/36kB`)
  - แต่ง Syncfusion ที่ `src/styles/sf/_components.scss` เท่านั้น · ห้ามเขียนครอบ generic `button` หรือ `.e-control-wrapper { width: 100%; }` นอก `.field`/`.filter`/`.form-grid` · ห้ามใช้ `.e-chart` โดดๆ (ชนไอคอน `e-icons.e-chart` ให้ใช้ `ejs-chart, .e-control.e-chart`) · ห้าม `:hover transform` บน `.e-btn`/`.e-card`/`.e-dialog`/`.e-panel`
  - มือถือ ($\le 640$px): `.e-dialog` กว้าง `calc(100vw - 16px) !important` และ `.e-btn.e-small` สูงขั้นต่ำ `36px` · คอนเทนเนอร์รายการยาวใส่ `pb-16`/`pb-20` กันปุ่มลอย `ขึ้นบน` บังปุ่มท้ายหน้า · `ejs-toast` วาง Bottom-Right เสมอ
- **Shell, AppBar, Unified Sidebar & Navigation**:
  - Sidebar (`#app-nav` กว้าง `244px` / พับ `64px` ต้องตรงกันทั้ง `app.scss` และ `src/styles.scss`): Desktop sticky `100vh`, Mobile fixed `z-index: 1200` · Active Pill วัดพิกัดด้วย `getBoundingClientRect()` + `ResizeObserver` · **ห้ามแยกชุดเมนู `/me/*` ซ้ำซ้อนกับเมนูหลัก**: ทุกสิทธิ์ใช้เมนู `พื้นที่ทำงาน` ชุดเดียวกัน (`/me`, `/cockpit`, `/work`, `/schedule`, `/quality`, `/insights` — โดย Member กรองข้อมูลเฉพาะตัวเองอัตโนมัติ ส่วน Lead/Admin เห็นตัวกรอง `ทีม`, `พนักงาน`, `เฉพาะฉัน` เพิ่มบน Global Filter Bar) พร้อมเพิ่มหมวด `บริหารทีม` (`/workspace/people`, `/queue`) ให้ `lead`/`admin` และหมวด `โซนแอดมิน` (`/admin`, `/admin/projects`, `/admin/rubrics`, `/admin/snapshot-check`, `/integrations`) ให้ `admin` · `matchNavId(url, role)` ต้องคืน `id` ตรงกับ `SidebarSection.items[].id` เสมอ
  - `::ng-deep .shell-appbar.e-appbar` ต้องกำหนด `overflow: visible !important; z-index: 100 !important; flex-wrap: nowrap !important;` สูงคงที่ 56px และแผงลอยภายใน AppBar (เช่น `.navbar-search-panel`) ต้องใช้ `z-index: 1050` เพื่อไม่โดนตัดขอบหรือจมหลัง `.workspace-filter-bar` (`z-index: 25`)
  - Omnisearch (`⌘K`): ค้นโปรเจกต์ต้องเช็กทั้ง `String(p.id).includes(q)`, `name`, และ `identifier` และกรองตาม `effectiveAllowedTeams`
- **DataGrid, Charts & Key Views**:
  - `app-sf-grid`: เมื่อไม่มีปุ่ม Toolbar ต้องคืน `[toolbar]="undefined"` (ห้ามส่ง `[]`) · เปิด Pagination เสมอ · คอลัมน์ตรึงใช้ `ViewportService` (`autoFreezeDesktop`: Desktop 2, Tablet 1, Mobile 0) พร้อมพื้นทึบ (`#0f172a` Dark / `#ffffff` Light) · เปลี่ยนคอลัมน์บน grid ที่ `enablePersistence` ต้องอัปเดต `id`
  - Shared UI (`src/app/shared/ui/`): `app-page-head`, `app-hero-band`, `app-section-card` (`panel`|`nested` — ห้ามห่อแผงด้วย div ขอบขาวดิบ), `app-status-badge`, `app-kpi-stat`, `app-person-avatar`, `app-filter-chips`, `app-confirm-dialog`, `TicketDetailService.open(id)` (drawer ขวา 360°)
  - **Cockpit (`/cockpit`)**: ล็อกความสูง `calc(100vh - 78px)` เฉพาะ `@media (min-width: 1200px) and (min-height: 850px)` นอกนั้นใช้ `min-height` + `overflow-y: auto` · ผูก `ResizeObserver` (debounce 150ms) · รองรับ Dual-Axis + `stripLines`, TV Mode, และ Maximize Dialog · เรดาร์ 6 มิติต้องกว้าง $\ge 400$px · แถว 4 KPI ใช้ `.kpi-grid-4` explicit breakpoints (`4 → 2 → 1`) · หน้ากราฟ `/team` และ `/work/summary` ใช้ CSS Grid + `app-section-card` แทน `<ejs-dashboardlayout>`
  - **Enterprise Views**: `/work/handoff` (Stage Aging StackingBar + Blocker Matrix + Ping Teams), `/quality/audit` (DoD Gate + Pareto 80/20 Reopen), `/analytics/time-audit` (3-Way Time Matching), `/tickets/disputes` (`app-sf-splitter` ในหน้า), `/admin/snapshot-check` (Readiness + 4 Gates), `/admin/projects` & `/org/projects/:id` (4 แท็บ: Overview, Tickets, Multi-Repo Git & CI/CD + 1-Click สร้างใบงานจาก Unmatched Branch, Teams/Members), `/mygit` & `/workspace/people` (Directory การ์ดคน → Workspace รายบุคคล + แท็บ `Git & โค้ด`)
  - **Date Type-Safety**: ฟิลด์วันที่จาก DB normalize ด้วย `raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw ?? '')` เสมอ และห้ามใช้ `<input type="date">` ดิบ (ใช้ `app-sf-datepicker`)

## สิทธิ์ / Scoring / Board / Gantt / Writeback / Sync Integrations

- **Dynamic 6-Track Formula & Fair Scoring**:
  - รองรับ `RND`, `IMP`, `QA`, `UXBA`, `SUP`, `INFRA` (Alias `Implement` ↔ `IMP`, `RD` ↔ `RND`)
  - **Fair Cutoff Rule**: On-time ของ Dev วัดวันที่การ์ดเข้า `Ready for QA` ครั้งแรก (`readyForQaAt` / `devDeliveredOn`) เทียบ `firstDueOn` (เวลารอคิว QA ไม่หักคะแนน Dev)
  - **Tiered Tolerance Accuracy**: XS/S ($\le 0.5$ MD) กรอบ $[0.5, 2.0]$ · M ($1.0$ MD) กรอบ $[0.8, 1.5]$ · L/XL ($\ge 2.0$ MD) กรอบ $[0.85, 1.3]$ ได้เต็ม 20 คะแนน โดยใช้ Net Actual MD (หัก `pausedDays`, `blockedHours`, เวลารอ QA)
  - **Dynamic Leave & Credits**: $\text{Net Quota} = \text{Base Quota} \times \frac{5 - \text{Leaves} - \text{Holidays}}{5}$ · เครดิตผู้ตรวจ MR 10–15% และ QA 15–20% ของ `estimateMd` · รองรับ `ticket_allocations` เมื่อ `isSplitEffort = true`
- **MD Mandate & Auto-Shift (`isMdDirect: true`, ป้าย `[MD-DIRECT]`)**:
  - เมื่อลากเข้า `In Progress` หรือจ่ายผ่าน `/queue` ระบบตรวจจับ WIP ของผู้รับและเปิด Dialog พักเวลา + เลื่อน `firstDueOn` ด้วย `addWorkingDays(startDate, shiftDays)` (เว้นเสาร์-อาทิตย์ ห้ามบวกวันปฏิทินตรงๆ) พร้อมเก็บค่าเดิมใน `originalFirstDueOn` + Audit Log
  - งานที่ถูกพัก (`isPaused: true` หรือ `pausedDays > 0`) การันตีคะแนน On-time 40 และหัก `pausedDays` ออกจาก `actualMd` ก่อนคิด Accuracy
- **Board, Gantt, Queue & Snapshot**:
  - Assign คิว (`/queue`) & แก้วันบน Gantt (`/work/timeline`): เฉพาะ `admin` | `lead` (`canAssignWork`) · Gantt รองรับ `ProjectView`|`ResourceView` (sanitize `ResourceInfo`, ไม่เปิด work-unit recalc) และ `applyGanttDateEdit` ห้ามทับ `firstDueOn`
  - Kanban (`/work/board`): `admin`/`lead` ย้ายได้ทุกสถานะรวม `Done` (`canEditBoardPlanning`) · `member` ย้ายได้ถึง `Ready for QA` / `In QA` ห้ามปิด `Done` เอง (`canMoveWorkflowByRole`)
  - Writeback: `OPENPROJECT_WRITEBACK` (ค่าเริ่ม `false`) PATCH assignee/dates พร้อม Dialog ยืนยันเมื่อมี `opId` · KPI Snapshot จับรายเดือน/ไตรมาส (`canCaptureKpi`) · Python Analytics Hub (`/insights`, `/api/analytics/report|run`)
- **OpenProject & GitLab Sync Invariants**:
  - **`firstDueOn` Protection**: ห้ามเขียนทับ `tickets.first_due_on` ที่มีค่าอยู่แล้วตอนซิงก์ OpenProject เด็ดขาด ยกเว้นมีรายการอนุมัติ `APPROVED` ใน `ticket_due_shifts`
  - **Policy & Auto-SLA Dates (`shared/domain/policy-sla.ts`)**: `myprojectplus.myhr.co.th` เก็บวันที่ใน Custom Fields (`customField43` Receipt, `customField44` Reply, `customField45` Plan, `customField46` CF Due, `customField163` Alert, `customField185` Policy, `customField219` Bug Cause) · ลำดับหา `dueOn` / `firstDueOn` แรกเข้าคือ `dueDate → cfDueDate → policyDate → planDate` · ใช้ `replyDate` เป็น Fair Cutoff (`devDeliveredOn`) fallback เมื่อไม่มี `readyForQaAt` · เมื่อเปิด Auto-SLA ให้บวกวันทำการข้ามเสาร์-อาทิตย์และติด `slaAutoFilled` (`Auto`) เฉพาะใน Scorecard (ห้าม Writeback ทับใบงานเดิมบน myProject ยกเว้นตอนสร้างใบใหม่ผ่าน `create-from-branch`)
  - **Alert Kind Exhaustiveness**: เมื่อเพิ่มชนิด `TicketAlert['kind']` ใน `shared/domain/alerts.ts` ต้องอัปเดตให้ครบ 4 จุดเสมอ: `ScorecardService` (`alert.kind === 'overrun' ? rules.overrun : rules.deadline`), `api-client.ts` (`sendTeams`), `teams-notify.ts` (`TeamsEventKind` + `messageFor`) & `pages/teams/teams.ts`, และ `integrations.controller.ts` (`sendTeams`)
  - **OpenProject Pagination & Custom Fields**: พารามิเตอร์ `offset` ของ API v3 คือ **1-based page number** ต้องเพิ่มทีละ `offset += 1` (ห้าม `offset += pageSize`) · `_links.customField1` = แผนก, `customField2` = ฝ่ายย่อย (`unit`), `customField3` = ตำแหน่ง (`job_title`)
  - **Team Staging & Visibility**: ช่วงทดสอบเฉพาะทีมใช้ `people.active = false` (ไม่ลบแถว) กรองผ่าน `listPeople(db, true)` · สิทธิ์ข้ามแผนกบังคับใช้ 2 ชั้นทั้ง Backend (`team_visibility_rules`, `user_allowed_teams`) และ Frontend (`WorkspaceScope.allowedTeams`) · Smart Merge Sync ของ `/admin/projects` ต้องรักษาค่า `active` และ `assignedTeamIds` เดิมเสมอ
  - **GitLab Sync**: ดึง MR, `reviewers`, `approved_by` (`/approvals`) และตรวจจับ Unmatched Branches เพื่อสร้างใบงาน myProject ผูกกลับอัตโนมัติ

## อย่าทำ

- อย่าแก้สูตรคะแนนโดยไม่รัน `npm run verify`  
- อย่า commit `.env`, `.agents/`, `.claude/`, `skills-lock.json`  
- อย่าเปิด `OPENPROJECT_WRITEBACK=true` เป็นค่าเริ่มต้น  
- อย่าปล่อยให้ขนาดไฟล์ Rule ใดเกิน `24,000` bytes (ป้องกันระบบตัดทอน Context)  
