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
  - แถบเมนูด้านข้าง (Sidebar): ใน Light Mode ใช้ Gradient สีน้ำเงินเอกลักษณ์ของ MyHR (`#2243ac` → `#4c68e5`) พร้อมป้ายและไอคอนสีขาวคมชัด, ใน Dark Mode ใช้ Deep Navy Gradient (`#0b1120` → `#162b70`)
  - `ThemeService` (`src/app/core/theme.service.ts`): สลับธีมแบบ zero-reload โดยสลับ `assets/themes/tailwind3.css` vs `assets/themes/tailwind3-dark.css` บน `<link id="sf-theme-link">` และสลับคลาส `e-dark-mode` vs `e-light-mode` บน `document.body`
  - จดจำค่าธีมใน `localStorage.getItem('md-theme')` พร้อม inline script ใน `src/index.html` เพื่อป้องกัน FOUC
  - คอมโพเนนต์กราฟฟิก (`ejs-chart`, `ejs-accumulationchart`, `ejs-progressbar`) ผูกธีมผ่าน `[theme]="theme.sfTheme()"` (`'Tailwind3Dark'` vs `'Tailwind3'`) โดยอัตโนมัติ
  - ปุ่มสลับธีมบน AppBar (`#appbar-theme-toggle`): แสดงไอคอนและป้ายสถานะ "โหมดสว่าง" / "โหมดมืด" ชัดเจน
- **SCSS Selector Safety**:
  - ห้ามเขียนสไตล์ครอบคลุม generic `button` หรือ broad `.e-control-wrapper { width: 100%; }` เพราะจะไปทำลาย Toolbar buttons, Pager dropdowns, และ Checkboxes ของ Syncfusion
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

## อย่าทำ

- อย่าแก้สูตรคะแนนโดยไม่ verify  
- อย่า commit `.env`, `.agents/`, `.claude/`, `skills-lock.json`  
- อย่าเปิด OpenProject writeback เป็นค่าเริ่ม  

