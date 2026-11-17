# Agents — Man-day Scorecard

คำแนะนำสั้นสำหรับ AI/มนุษย์ที่ทำงานในรีโปนี้

## อ่านก่อน

1. [docs/ระบบ.md](docs/ระบบ.md) — สถาปัตยกรรมและโมดูล  
2. [docs/แผนงาน.md](docs/แผนงาน.md) — สิ่งที่ควรทำต่อ  
3. [docs/คู่มือ.md](docs/คู่มือ.md) — ติดตั้ง รัน sync แก้ปัญหา  

## Rules / Skills ในโปรเจกต์

| ชนิด | พาธ |
|---|---|
| Rules | `.cursor/rules/*.mdc` |
| Skills | `.cursor/skills/*/SKILL.md` |

Skills สำคัญ: `scorecard-verify`, `openproject-fields`, `work-hub`

## คำสั่งตรวจขั้นต่ำ

```powershell
npm run verify
npm --prefix server run test
npm run build
npm --prefix server run build
```

## Angular UI & Syncfusion

- Angular **22.2.6** (pin ใน package.json) · **signals / computed / `@if` `@for`** · **OnPush** ทุก component  
- คง **Zone** (`provideZoneChangeDetection`) — ยังไม่ทำ zoneless เพราะ Syncfusion  
- Syncfusion: ใช้ `[value]="x()"` + `(change)` ไม่ใช้ `[(value)]` กับ class field  
- AppBar (`app.html`): แสดงชิปสถานะระบบ + ชิปผู้ใช้/สิทธิ์ + ปุ่มแจ้งเตือนพร้อม `e-badge` เปิด `ejs-dialog` (`#alertDialog`)  
- ตารางหลัก (`/tickets`, `/people`, `/work/list`): ใช้ `FreezeService` (`frozenColumns="2"` บน `/tickets`), `ColumnChooserService`, `ExcelExportService`, `ResizeService`, `AggregateService`  
- **Syncfusion Frozen Columns**: คอลัมน์ที่ถูกตรึง (`.e-leftfreeze`, `.e-fixedfreeze`, `.e-frozenheader`) ต้องมีพื้นหลังทึบเสมอ (`#0f172a` ใน Dark Theme, `#ffffff` ใน Light Theme) ป้องกันข้อความของคอลัมน์ที่เลื่อนทะลุมาซ้อนทับ
- **Enterprise Multi-Team UI (หน้าจอ 21–25)**:
  - `/work/handoff`: กราฟ `ejs-chart` แนวนอน `StackingBar` แสดง Stage Aging แยกตามทีม + Cross-Team Blocker Matrix + ตารางตรึง 2 คอลัมน์แรก + ปุ่ม Ping Teams
  - `/quality/audit`: `ejs-tab` (DoD Gate Verifier ตรวจ MR/Unit Test/Staging Verified พร้อมปุ่ม Reject to Dev vs วิเคราะห์ Reopen Root-Causes)
  - `/analytics/time-audit`: ตาราง 3-Way Time Matching Grid เปรียบเทียบ Estimate vs OpenProject Actual vs GitLab Commit Span
  - `/tickets/disputes`: Split View รายการคำขอด้านซ้าย และแผงคำนวณคะแนนจำลอง (Projected Score Diff) ด้านขวา พร้อม `ejs-dialog` ยื่นอุทธรณ์
  - `/admin/snapshot-check`: `ejs-progressbar` แสดง Readiness % + เช็คลิสต์ 4 ด่าน + ตาราง Snapshot Preview Diff เปรียบเทียบดัชนีรายบุคคลก่อน Freeze
- **Light & Dark Theme Architecture (MyHR Plus Design Tokens)**:
  - สีหลักระดับแบรนด์อิงตามเทมเพลต `myhrplus-backoffice-v5`: สีหลัก **MyHR Royal Blue** (`#2e4fc8` / `rgb(46, 79, 200)`), สีรอง/สว่าง (`#4c68e5`, `#5f7ce3`), และแถบเน้น AI/Spike (`#7465e8`)
  - ฟอนต์หลักผสมผสานระหว่าง `'IBM Plex Sans Thai'`, `'Montserrat'`, และ `'Sarabun'` ตามมาตรฐาน MyHR v5
  - `tailwind.config.js`: `darkMode: ['selector', '.e-dark-mode']` — คลาส `dark:` ตาม body ไม่ตาม OS
  - แถบเมนูด้านข้าง (Sidebar): ใน Light Mode ใช้ Gradient MyHR (`#2243ac` → `#4c68e5`) พร้อมป้าย/ไอคอนขาว (บังคับทับ Syncfusion light CSS), ใน Dark Mode ใช้ Deep Navy Gradient (`#0b1120` → `#162b70`)
  - `ThemeService` (`src/app/core/theme.service.ts`): สลับธีมแบบ zero-reload · `sfTheme()` · `progressTrack()` / `progressFill()` สำหรับ ProgressBar
  - จดจำค่าธีมใน `localStorage.getItem('md-theme')` พร้อม inline script ใน `src/index.html` เพื่อป้องกัน FOUC
  - คอมโพเนนต์กราฟฟิก (`ejs-chart`, `ejs-accumulationchart`, `ejs-progressbar`) ผูกธีมผ่าน `[theme]="theme.sfTheme()"` โดยอัตโนมัติ
  - ปุ่มสลับธีมบน AppBar (`#appbar-theme-toggle`): แสดงไอคอนและป้ายสถานะ "โหมดสว่าง" / "โหมดมืด" ชัดเจน
- **Syncfusion UI Template Standard (P12)**:
  - แผงเนื้อหา: `section-card` + `section-card-head` / `section-card-copy`
  - Shared UI (`src/app/shared/ui/` + barrel `index.ts`):
    - `app-page-head` — หัวหน้า (title / description / breadcrumb / periodBadge + slot `[actions]`)
    - `app-section-card` — แผงเนื้อหา (title / subtitle / badge + slots body / `[actions]`)
    - `app-status-badge` — ป้าย Syncfusion (`tone` หรือ `value` + `toneMap`) · tone map ร่วมใน `badge.ts` (`workflowStatusToneMap`, `planToneMap`, `weekToneMap`, `trackToneMap`, ฯลฯ)
    - `app-kpi-stat` (`src/app/shared/kpi-stat-card/`) — KPI แถวบน (`e-card` + badge + `ejs-progressbar`)
    - `app-form-field` — ห่อ label + control (variant `field` | `filter`)
    - `app-flash-messages` — รวม success / error / info / warning เป็น `ejs-message`
    - `app-filter-chips` — ชิปกรองสถานะ/บทบาท
    - `app-confirm-dialog` — ยืนยันสั้นๆ (queue writeback, board block)
  - **DataGrid cell polish** (`/work/list`, `/people`, `/tickets`): badge ในเซลล์ · progress ดัชนีคน · Search ใน toolbar (เมื่อไม่มีช่องค้นหาภายนอก) · Action `ดูสรุป` บน List — แนว Essential UI Kit แบบจุดๆ ไม่ยกบล็อกทั้งชุด · เพิ่มคอลัมน์บน grid ที่ `enablePersistence` ต้องเปลี่ยน `id` (เช่น `work-operational-list-grid-v2`)
  - **แผงรายละเอียดในหน้า**: `/schedule` ใช้คอลัมน์ขวา (ปฏิทินย่อย + รายวัน) · `/tickets/disputes` ใช้ Split View ซ้ายตารางขวารายละเอียด — อย่าใช้ `ejs-sidebar` Over drawer ทับ Timeline/ตาราง
  - **Syncfusion style layers** (ธีมมาตรฐานก่อน แล้วค่อยแต่งจุดกลาง):
    1. Theme CSS — `assets/themes/tailwind3(.css|-dark.css)` ผ่าน `#sf-theme-link` (`ThemeService`)
    2. App tokens / layout — `src/styles.scss` (page, section-card, shell)
    3. จุดกลางแต่ง SF — `src/styles/sf/` (`index.scss` → `_components.scss`: ปุ่ม scoped, input ใน field/filter, grid frozen, kanban `.pipeline-board`, gantt/schedule ขอบเบา, dialog ไม่ใช้ transform)
    - ห้ามทับ `.e-btn`/`.e-dialog` ด้วย `transform` · ห้าม `overflow:hidden` บน Gantt/Schedule โดยไม่จำเป็น · อย่าทับ `.e-card` ทั้งโปรเจกต์ · เพิ่มจุดใหม่ใส่หมวดใน `_components.scss` เท่านั้น
  - ห้ามห่อแผงใหม่ด้วย `rounded-xl border … bg-white dark:bg-slate-900 … shadow-sm` — ใช้ `app-section-card` / คลาส `.section-card`
- **SCSS Selector Safety**:
  - ห้ามเขียนสไตล์ครอบคลุม generic `button` หรือ broad `.e-control-wrapper { width: 100%; }` เพราะจะไปทำลาย Toolbar buttons, Pager dropdowns, และ Checkboxes ของ Syncfusion — ความกว้าง input จำกัดที่ `.field` / `.filter` / `.form-grid` ใน `src/styles/sf/`
  - ห้ามใช้คลาส `.e-chart` โดดๆ เพราะจะไปชนกับไอคอน `e-icons.e-chart` ในเมนู ให้ใช้ `ejs-chart, .e-control.e-chart` แทน
  - ห้ามใส่ `transform: translateY(...)` บน `.e-dashboardlayout .e-panel:hover` หรือ `.e-card:hover` เพื่อไม่ให้รบกวนพิกัดคำนวณภายในของ DashboardLayout และ Kanban
- **Sidebar & Layout Pinning (Desktop & Mobile)**:
  - `.app-frame` ต้องกำหนด `align-items: start;`
  - บน Desktop (`@media (min-width: 801px)`): `#app-nav` ต้องใช้ `position: sticky !important; top: 0 !important; height: 100vh !important; max-height: 100vh !important; align-self: start; overflow-y: auto !important; overscroll-behavior: contain;` ห้ามใช้ `position: relative` หรือ `height: auto` ที่ทำให้ Sidebar เลื่อนหลุดออกนอกจอเวลาหน้ายาว
  - **Desktop Mini-Sidebar**: รองรับการพับเมนูเหลือ 68px (เฉพาะไอคอน) ผ่านปุ่ม `.nav-toggle` โดย `.app-frame.is-collapsed` ปรับเป็น `grid-template-columns: 68px minmax(0, 1fr)` เพื่อเพิ่มพื้นที่ทำงานให้กับ Gantt และตาราง Grid
  - `<ejs-sidebar>` บน Desktop ต้องใช้ `[type]="narrow() ? 'Over' : 'Push'"` และ `[showBackdrop]="false"`
  - บน Mobile (`@media (max-width: 800px)`): เมนู Sidebar ต้องเป็น `position: fixed !important; height: 100vh !important; z-index: 1200 !important;` อยู่เหนือ Backdrop (`z-index: 1050`) เสมอ และห้ามใช้ `backdrop-filter: blur` บน Backdrop ที่อาจทำให้ Sidebar มัว
- **DashboardLayout Chart Timing**: กราฟที่อยู่ใน DashboardLayout ต้องสั่ง `chart.refresh()` หลังเลย์เอาต์เสร็จผ่าน `(created)="onDashboardCreated()"` และ `ngAfterViewInit` พร้อม `ResizeObserver`
- **Date Type-Safety**: ฟิลด์วันที่ (`closedOn`, `dueDate`, `startDate`) ที่มาจากฐานข้อมูลอาจเป็นได้ทั้ง `string` หรือ `Date` object ให้ normalize ด้วย `raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw ?? '')` ก่อนใช้ string methods เสมอ  

## สิทธิ์ / Board / Gantt / Writeback / KPI snapshot / Integrations

- **Dynamic Track Formula Engine (6 สายงาน)**:
  - รองรับ `RND`, `IMP`, `QA`, `UXBA`, `SUP`, `INFRA` โดยผูก Alias `Implement` ↔ `IMP` และ `RD` ↔ `RND`
  - **Fair Cutoff Rule**: วัด On-time การส่งมอบของ Dev เมื่อการ์ดย้ายเข้า `Ready for QA` ครั้งแรก (`readyForQaAt` / `devDeliveredOn`) เทียบกับ `firstDueOn` (ไม่นำเวลาค้างรอคิว QA มาตัดคะแนน Dev)
  - **Dynamic Leave Quota**: ปรับลดโควตาสุทธิอัตโนมัติ $\text{Net Quota} = \text{Base Quota} \times \frac{5 - \text{Leaves} - \text{Holidays}}{5}$
  - **Reviewer & QA Credit**: เครดิตเวลาผู้ตรวจ MR 10% และผู้ทดสอบ QA 15–20% ของ `estimateMd`
  - **Multi-Role Effort Split**: ตาราง `ticket_allocations` แยกคิดคะแนนและโควตารายบุคคลเมื่อ `isSplitEffort = true`
- Assign / รับคิว & แก้วันบน Gantt Timeline (`/work/timeline`): `admin` | `lead` เท่านั้น (`canAssignWork`)  
- Gantt Timeline: รองรับ `parentID: 'ParentID'` (`_links.parent` → `opParentId`/`parentId`) + แก้ `StartDate`/`EndDate` ผ่าน `applyGanttDateEdit` โดยห้ามทับ `firstDueOn`  
- Kanban Board (`/work/board`): มี Swimlane switcher + `ejs-dialog` แก้ไขฟิลด์ · `admin`/`lead` ย้ายได้ทุกสถานะรวม `Done` และแก้แผนได้ (`canEditBoardPlanning`) · `member` ย้ายได้ถึง `Ready for QA` / `In QA` ห้ามปิด `Done` เอง (`canMoveWorkflowByRole`)  
- Writeback: env `OPENPROJECT_WRITEBACK` (ค่าเริ่ม `false`) รองรับทั้ง PATCH assignee และ PATCH startDate/dueDate + Dialog ยืนยันบน `/queue` เมื่อมี `opId`  
- KPI snapshot: จับเดือน/ไตรมาส (`canCaptureKpi`) · อ่านบน `/team` · โดเมน `kpi-snapshot.ts`  
- GitLab MR & Teams Webhook: ตั้งค่าใน `.env` หรือ `/integrations` (`ejs-tab` 3 ระบบ) · ซิงก์ MR จริงผ่าน `POST /api/integrations/gitlab/sync` (`gitlab-mr.ts`) · ยิง Teams จริงผ่าน `POST /api/integrations/teams/send`  
- Role-Based Sidebar & Route Guards: เมนูใน `app.ts` กรองตาม `effectiveRole()` (`admin`, `lead`, `member`) + ปุ่มสลับมุมมองพนักงานบน AppBar (`#appbar-persona-toggle`) · การ์ด `requireRoles` ป้องกันหน้าจัดการสำหรับ `member` · หน้า `/me` สำหรับพอร์ทัลพนักงาน · หน้า `/login` สำหรับสลับบัญชีทั้ง 15 คน + SSO · Role Matrix & Audit Log บน `/admin`  
- Python Sync & Analytics Intelligence Hub (`/analytics` + `scripts/analytics_engine.py` + `shared/domain/analytics.ts`): วิเคราะห์ Sync Hygiene Readiness %, Z-Score Outliers, Delivery Risk Radar, 1-on-1 Coaching Insights และ Module/Variance Bottlenecks ผ่าน `GET /api/analytics/report` และ `POST /api/analytics/run`  
- **MD Mandate & Auto-Shift Workflow (โฟลว์งานสั่งตรงจาก MD)**:
  - **การระบุงาน**: การ์ดแทรกที่สั่งตรงจาก MD จะมีแฟล็ก `isMdDirect: true` พร้อมระบุ `estimateMd` ชัดเจน และแสดงป้าย Tag `[MD-DIRECT]`
  - **Active WIP Auto-Detection**: เมื่อลากเข้า `In Progress` ระบบจะตรวจจับงานค้างในมือ (`In Progress` / `Reopened`) ของ Assignee โดยอัตโนมัติ และแสดง Dialog ยืนยันพักเวลาและเลื่อนกำหนดส่ง
  - **Working Days Calculation**: การเลื่อนกำหนดส่งแรก (`firstDueOn`) ต้องใช้ `addWorkingDays(startDate, shiftDays)` โดยคำนวณเว้นวันเสาร์-อาทิตย์เสมอ (ห้ามบวกวันปฏิทินตรงๆ)
  - **Original Date Audit Trail**: ต้องบันทึกกำหนดส่งเดิมลงใน `originalFirstDueOn` และบันทึกประวัติการเลื่อนลง Audit Log ทุกครั้ง
  - **Scoring Protection Rules**:
    - งานที่ถูกพัก (`isPaused: true` หรือมี `pausedDays > 0`): ไม่ถูกตัดคะแนนส่งมอบตรงเวลา (การันตี 40 คะแนน On-time)
    - นำจำนวนวันทำงานที่ถูกพัก (`pausedDays`) มาหักลบออกจาก `actualMd` ก่อนคำนวณอัตราส่วนความแม่นยำ เพื่อไม่ให้เสียคะแนนประเมิน (การันตี 20 คะแนน Accuracy)
    - ใบงาน MD Mandate ให้นับเข้าโควตาผลงานเต็มจำนวน และแสดงผลวิเคราะห์ MD Share (%) บน Dashboard ภาพรวม
- **OpenProject Sync & FirstDueOn Protection**:
  - เมื่อดึงข้อมูลจาก OpenProject/MyProject: หาก `tickets.first_due_on` มีค่าอยู่แล้ว ห้ามเขียนทับโดยเด็ดขาด ยกเว้นกรณีที่มีคำสั่งอนุมัติจากตาราง `ticket_due_shifts` สถานะ `APPROVED` เท่านั้น
- **GitLab Approvals & Peer Review Quota**:
  - ซิงก์ผู้ตรวจโค้ด (`reviewers`) และผู้อนุมัติ (`approved_by`) ผ่าน GitLab API `/api/v4/projects/:id/merge_requests/:iid/approvals`
  - คำนวณเครดิตเวลาโควตา **Peer Review MD** (10–15% ของ `estimateMd`) ให้รุ่นพี่/Senior ในทีมเพื่อความเป็นธรรม
- **Tiered Tolerance Accuracy Engine**:
  - กรอบความแม่นยำแบ่งตามขนาดงาน:
    - **XS / S ($\le 0.5$ MD)**: กรอบกว้าง $[0.5, 2.0]$ ได้เต็ม 20 คะแนน (ความแปรปรวนของงานเล็กสูงกว่าปกติ)
    - **M ($1.0$ MD)**: กรอบมาตรฐาน $[0.8, 1.5]$ ได้เต็ม 20 คะแนน
    - **L / XL ($\ge 2.0$ MD)**: กรอบวินัยเข้ม $[0.85, 1.3]$ ได้เต็ม 20 คะแนน
  - คำนวณ Net Actual MD โดยหักลบวันพักงาน (`pausedDays`), เวลาติดบล็อก (`blockedHours`), และเวลารอ QA
- **Frontend MD Mandate Controls (Syncfusion Components)**:
  - **Kanban Board (`/work/board`)**: ใน Card Edit Dialog มี `ejs-checkbox` ติ๊กงานสั่งตรงจาก MD พร้อม `ejs-multiselect` ดึงรายการงาน `In Progress` ของน้องคนนั้นเพื่อสั่ง Auto-Shift Due Date ในคลิกเดียว
  - **New Work Queue (`/queue`)**: มีปุ่มคำสั่ง `⚡ รับงานด่วน MD & เลื่อนงานเดิม` ให้ Lead จ่ายงานแทรกและปรับตารางเวลาให้น้องทันที
  - **Team & Person Dashboards (`/team` และ `/people/:id`)**: ใช้ `StackingColumn` บน `ejs-chart` แสดงสัดส่วน Planned MD vs Unplanned ทั่วไป vs MD Mandate


## อย่าทำ

- อย่าแก้สูตรคะแนนโดยไม่ verify  
- อย่า commit `.env`, `.agents/`, `.claude/`, `skills-lock.json`  
- อย่าเปิด OpenProject writeback เป็นค่าเริ่ม  

