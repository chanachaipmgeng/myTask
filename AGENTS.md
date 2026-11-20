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
- AppBar (`app.html`): แสดงชิปสถานะระบบ + ชิปผู้ใช้/สิทธิ์ + ปุ่มแจ้งเตือนแบบไอคอน (`e-warning`) พร้อม `e-badge-notification e-badge-overlap` เปิด `ejs-dialog` (`#alertDialog`) · Toast ผ่าน `ShellNotice` (typed)  

- ตารางหลัก (`/tickets`, `/people`, `/work/list`): ใช้ `FreezeService` (ผูก `ViewportService` แทนการ hardcode), `ColumnChooserService`, `ExcelExportService`, `ResizeService`, `AggregateService`  
- **Adaptive Mobile Frozen Columns**: บนจอมือถือและแท็บเล็ต ห้าม hardcode `frozenColumns="2"` หรือ `[isFrozen]="true"` โดดๆ ให้ใช้ `ViewportService` ผูกค่าแบบ reactive: บน Desktop ($\ge 1025$px) ตรึง 2 คอลัมน์, บน Tablet (641–1024px) ตรึง 1 คอลัมน์, และบน Mobile ($\le 640$px) ปลดตรึงอัตโนมัติ (`frozenColumns = 0` / `isFrozen = false`) เพื่อป้องกันปัญหาคอลัมน์ตรึงกินพื้นที่จนหน้าตารางบีบอัดและเลื่อนไม่ได้ และคอลัมน์ที่ถูกตรึง (`.e-leftfreeze`, `.e-fixedfreeze`, `.e-frozenheader`) ต้องมีพื้นหลังทึบเสมอ (`#0f172a` ใน Dark Theme, `#ffffff` ใน Light Theme)
- **Enterprise Multi-Team UI (หน้าจอ 21–25)**:
  - `/work/handoff`: กราฟ `ejs-chart` แนวนอน `StackingBar` แสดง Stage Aging แยกตามทีม + Cross-Team Blocker Matrix + ตารางตรึง 2 คอลัมน์แรก + ปุ่ม Ping Teams
  - `/quality/audit`: `ejs-tab` (DoD Gate Verifier ตรวจ MR/Unit Test/Staging Verified พร้อมปุ่ม Reject to Dev vs วิเคราะห์ Reopen Root-Causes)
  - `/analytics/time-audit`: ตาราง 3-Way Time Matching Grid เปรียบเทียบ Estimate vs OpenProject Actual vs GitLab Commit Span
  - `/tickets/disputes`: `ejs-splitter` รายการคำขอด้านซ้าย และแผงคำนวณคะแนนจำลอง (Projected Score Diff) ด้านขวา พร้อม `ejs-dialog` ยื่นอุทธรณ์
  - `/admin/snapshot-check`: `ejs-progressbar` แสดง Readiness % + เช็คลิสต์ 4 ด่าน + ตาราง Snapshot Preview Diff เปรียบเทียบดัชนีรายบุคคลก่อน Freeze
- **Modern Bento Grid Cockpit (P16 - `/cockpit` & `/me/cockpit`)**:
  - **100vh Viewport Lock & Fluid Scaling**: ล็อกความสูง `calc(100vh - 78px)` เฉพาะจอเดสก์ท็อปขนาดใหญ่ `@media (min-width: 1200px) and (min-height: 850px)` หากความสูงหน้าจอ $< 850$px (เช่น แล็ปท็อปที่เปิด Windows Scaling 125%/150%) ให้ยืดหยุ่นเป็น `min-height` พร้อม `overflow-y: auto` ป้องกันกราฟ Tier 3 โดนตัดขอบล่าง โดยที่ `.shell-appbar` ต้องกำหนด `flex-wrap: nowrap !important;` ล็อกความสูงคงที่ 56px เสมอ
  - **ResizeObserver Chart Protection**: ต้องผูก `ResizeObserver` ใน `ngAfterViewInit` พร้อม debounce (150ms) เพื่อยิง event resize ให้ชาร์ต Syncfusion คำนวณขนาดใหม่ทุกครั้งที่พับ/ขยาย Sidebar
  - **3-Tier Grid Layout**: Tier 1 (แถบ MyHR Blue แถวเดียว: ชื่อหน้า + ดัชนี 4 ค่าแบบตัวเลขใหญ่), Tier 2 (Dual-Axis Overview Combo Chart หรือสัดส่วน 60%:40% Workload Stacking Area vs OLS Trendline), Tier 3 (3 คอลัมน์ DoD Donut, Stage Aging Stacked Bar, AI Risk Radar)
  - **TV Presentation Mode**: สลับฉายขึ้นจอทีวี/ห้องประชุมแบบ 100vw/100vh ซ่อน AppBar/Sidebar
  - **Maximize Deep-Dive Dialog**: ปุ่ม `[ ⛶ ]` ขยายกราฟขึ้นโมดอล `ejs-dialog` พร้อมตารางแจกแจงตัวเลข (Breakdown Data Table)
- **SCSS Component Budget & Token Architecture**:
  - หลีกเลี่ยงการเขียนสไตล์ซ้ำซ้อนใน SCSS ของคอมโพเนนต์หลักที่เสี่ยงต่อการเกินงบประมาณ Angular CSS Budget (`anyComponentStyle` 28kB/36kB ใน `angular.json`)
  - จัดการธีม Light/Dark Mode ด้วย CSS Custom Properties (Tokens) บน Root Container แล้ว override เฉพาะค่าตัวแปรใน Light Mode ซึ่งจะช่วยลดขนาดไฟล์ได้มากกว่า 30–40%
  - หน้าต่าง `ejs-dialog` บนมือถือ ($\le 640$px) ต้องปรับขนาดเป็น `width: calc(100vw - 16px) !important;` และปุ่มขนาดเล็กบนมือถือต้องมีขนาดสัมผัสขั้นต่ำ 36px (Touch Ergonomics)
- **Advanced Syncfusion Charts & Scoped Styling Standards**:
  - **Angular Light Mode Scoped Styling**: ใน Angular Scoped SCSS ห้ามเขียน `body.e-light-mode .card` ตรงๆ เพราะ `body` อยู่นอก scope ให้ใช้ `:host-context(.e-light-mode)` และ `:host-context(body:not(.e-dark-mode))` ร่วมกับ CSS Custom Properties เพื่อให้สลับธีมแบบ zero-reload ได้อย่างสมบูรณ์
  - **Dual-Axis Overview Combo & Stripline**: เมื่อแสดงผลภาระงานควบคู่กับตัวชี้วัดคุณภาพ ให้ผูกแกนที่ 2 ด้วย `axes: [{ name: 'yAxis2', opposedPosition: true }]` และใส่เส้นประ `stripLines` สำหรับระบุ Target Benchmark เสมอ (เช่น 90% On-time หรือ 80% Pareto Vital Few)
  - **Polar / Radar 6D Minimum Width**: ชาร์ตใยแมงมุม 6 มิติขึ้นไป ต้องมีพื้นที่คอนเทนเนอร์กว้างอย่างน้อย 400–500px (เช่น จัดใน `.card-grid-2` หรือเต็มแถว) ห้ามใส่ในคอลัมน์กว้างต่ำกว่า 300px เพื่อป้องกันป้ายกำกับมิติถูกตัดขอบ (Label Truncation)
  - **Explicit KPI 4-Card Grid**: หลีกเลี่ยง `repeat(auto-fit, minmax(280px, 1fr))` สำหรับแถว 4 KPI เพราะทำให้เกิด 3+1 wrap บนจอขนาดกลาง ให้ใช้ explicit media query: `repeat(4, 1fr)` บนเดสก์ท็อป ($\ge 1024$px), `repeat(2, 1fr)` บนแท็บเล็ต, และ `1fr` บนมือถือ
- **Light & Dark Theme Architecture (Corporate MyHR Royal Blue + Clean SaaS)**:
  - สีหลักบริษัท: **Corporate Royal Blue** (`#2746b3` → `#3154cc` → `#3b60dc`) · ฟอนต์ `'IBM Plex Sans Thai'`, `'Montserrat'`, `'Sarabun'` · `tailwind.config.js` ใช้ `darkMode: ['selector', '.e-dark-mode']`
  - **Light Mode**: Sidebar ไล่เฉด Royal Blue (`#2746b3` → `#3b60dc`) ไอคอน/ข้อความขาว + Active Pill ขาวตัวอักษร `#2746b3` · พื้นหลังฟ้าอ่อน `#f4f7fe` · AppBar ขาว `#ffffff` · การ์ดขาว `#ffffff` ขอบ `#e6ecf8` มุมมน `16px` เงาฟ้านุ่ม (`rgba(39, 70, 179, 0.07)`) · **Dark Mode**: Sidebar Deep Royal Navy (`#0b1437` → `#1a2d75`), การ์ด `#0f1838`
  - `app-hero-band` / `app-page-head`: แบนเนอร์หัวหน้าไล่เฉดฟ้าลาเวนเดอร์ (`#eff4ff` → `#dce7ff`) มีแถบ `#2746b3` ด้านซ้าย `4px` + **Unified KPI Strip** การ์ดแถวเดียวคั่นเส้นประแนวตั้ง `1px dashed` พร้อมลูกศรแนวโน้ม `▲`/`▼`
  - `ThemeService`: สลับธีมแบบ zero-reload + `localStorage.getItem('md-theme')` + inline script ป้องกัน FOUC · ชาร์ตผูก `[theme]="theme.sfTheme()"` · ปุ่ม AppBar (`#appbar-theme-toggle`, กระดิ่ง, สลับบัญชี) ใช้ Inline SVG คมชัด
  - **Toast & Verified Icons**: วาง `ejs-toast` ที่ **Bottom-Right** (`{ X: 'Right', Y: 'Bottom' }`) เสมอเพื่อไม่บัง AppBar · เมนูใช้ Syncfusion glyph ที่ตรวจสอบแล้ว (`e-grid-view`, `e-timeline-today`, `e-table`, `e-columns`, `e-timeline-month`) แทน glyph ที่หาย (`e-dashboard`, `e-date-time`, `e-table-1`)
- **Syncfusion UI Template Standard (P12)**:
  - แผงเนื้อหาทั่วไป: **`app-section-card`** เรนเดอร์เป็น Syncfusion **`e-card.section-card`** (`e-card-header` / `e-card-content`) · `variant` = `panel` | `nested` · ห้าม `e-card` / `section-card` ดิบนอก Kanban และ `app-kpi-stat`
  - Shared UI (`src/app/shared/ui/` + barrel `index.ts`):
    - `app-page-head` — หัวหน้า (title / description / breadcrumb / periodBadge + slot `[actions]`)
    - `app-section-card` — แผงเนื้อหา Syncfusion e-card (title / subtitle / badge + slots body / `[actions]` · variant panel/nested)
    - `app-status-badge` — ป้าย Syncfusion (`tone` หรือ `value` + `toneMap`) · tone map ร่วมใน `badge.ts` (`workflowStatusToneMap`, `planToneMap`, `weekToneMap`, `trackToneMap`, ฯลฯ)
    - `app-kpi-stat` (`src/app/shared/kpi-stat-card/`) — KPI ตัวกลางทุกหน้า (`e-card` + badge/trend + `ejs-progressbar` + `ejs-sparkline` / skeleton ออปชัน) · layout `stack`/`icon-start`/`icon-end` · export จาก `shared/ui`
    - `app-form-field` — ห่อ label + control (variant `field` | `filter`)
    - `app-flash-messages` — รวม success / error / info / warning เป็น `ejs-message`
    - `app-filter-chips` — ชิปกรองสถานะ/บทบาท
    - `app-confirm-dialog` — ยืนยันสั้นๆ (queue writeback, board block) · animation Fade
  - **DataGrid cell polish** (`/work/list`, `/people`, `/tickets`): badge ในเซลล์ · progress ดัชนีคน · Search ใน toolbar (เมื่อไม่มีช่องค้นหาภายนอก) · Action `ดูสรุป` บน List — แนว Essential UI Kit แบบจุดๆ ไม่ยกบล็อกทั้งชุด · เพิ่มคอลัมน์บน grid ที่ `enablePersistence` ต้องเปลี่ยน `id` (เช่น `work-operational-list-grid-v2`)
  - **แผงรายละเอียดในหน้า**: `/schedule` ใช้คอลัมน์ขวา (ปฏิทินย่อย + รายวัน) · `/tickets/disputes` ใช้ `ejs-splitter` ซ้ายตารางขวารายละเอียด — อย่าใช้ `ejs-sidebar` Over drawer ทับ Timeline/ตาราง
  - **P13 UX polish**: Gantt สลับ ProjectView/ResourceView · Board Dialog มี Delivery Timeline · Toast typed · AppBar แจ้งเตือนไอคอน
  - **Syncfusion style layers** (ธีมมาตรฐานก่อน แล้วค่อยแต่งจุดกลาง):
    1. Theme CSS — `assets/themes/tailwind3(.css|-dark.css)` ผ่าน `#sf-theme-link` (`ThemeService`)
    2. App tokens / layout — `src/styles.scss` (page, section-card, shell)
    3. จุดกลางแต่ง SF — `src/styles/sf/` (`index.scss` → `_components.scss`: ปุ่ม scoped, input ใน field/filter, grid frozen, kanban `.pipeline-board`, gantt/schedule ขอบเบา, dialog ไม่ใช้ transform)
    - ห้ามทับ `.e-btn`/`.e-dialog` ด้วย `transform` · ห้าม `overflow:hidden` บน Gantt/Schedule โดยไม่จำเป็น · อย่าทับ `.e-card` ทั้งโปรเจกต์ · เพิ่มจุดใหม่ใส่หมวดใน `_components.scss` เท่านั้น
  - ห้ามห่อแผงใหม่ด้วย `rounded-xl border … bg-white dark:bg-slate-900 … shadow-sm` — ใช้ `app-section-card` (`e-card.section-card`)
- **SCSS Selector Safety**:
  - ห้ามเขียนสไตล์ครอบคลุม generic `button` หรือ broad `.e-control-wrapper { width: 100%; }` เพราะจะไปทำลาย Toolbar buttons, Pager dropdowns, และ Checkboxes ของ Syncfusion — ความกว้าง input จำกัดที่ `.field` / `.filter` / `.form-grid` ใน `src/styles/sf/`
  - ห้ามใช้คลาส `.e-chart` โดดๆ เพราะจะไปชนกับไอคอน `e-icons.e-chart` ในเมนู ให้ใช้ `ejs-chart, .e-control.e-chart` แทน
  - ห้ามใส่ `transform: translateY(...)` บน `.e-dashboardlayout .e-panel:hover` หรือ `.e-card:hover` เพื่อไม่ให้รบกวนพิกัดคำนวณภายในของ DashboardLayout และ Kanban
- **4-Pillar Sidebar (`244px` / `64px`) + Top Sub-Nav Tab Bar**:
  - Sidebar แสดงเฉพาะ **4 หมวดหลัก (`visibleRail()`)** พร้อมป้ายนับจำนวนหน้าย่อย (ไร้ Scrollbar แนวตั้ง; พิมพ์ค้นหาเมนูจะกางหน้าย่อยที่ตรงคำค้น) + **Workspace Switcher Dropdown** ด้านบนซ้าย (สลับ *งานของฉัน / บริหารทีม / แอดมิน*) · หน้าย่อยแสดงอัตโนมัติใน **Top Sub-Navigation Tab Bar** (`.subnav-bar`) ใต้ AppBar
  - **Width Single Source of Truth**: ทุกครั้งที่ปรับความกว้าง `#app-nav` / `.e-sidebar` ใน `app.scss` ต้องอัปเดต `@media (min-width: 801px)` ใน `src/styles.scss` ให้ตรงกัน (`244px` / `64px`) เสมอเพื่อป้องกัน Sidebar ล้นทับ `<main>`
  - Desktop (`>= 801px`): `#app-nav` ใช้ `position: sticky !important; top: 0; height: 100vh; overflow-y: auto; overscroll-behavior: contain;` และ `[type]="narrow() ? 'Over' : 'Push'"` `[showBackdrop]="false"` · Mobile (`<= 800px`): `position: fixed !important; z-index: 1200 !important;` อยู่เหนือ Backdrop (`z-index: 1050`)
- **CSS Grid over `ejs-dashboardlayout` & Refined Spring Motion**:
  - ใช้ **CSS Grid (`grid-cols-1 lg:grid-cols-2 gap-4`) + `app-section-card`** แทน `<ejs-dashboardlayout>` บนหน้าแดชบอร์ดกราฟ (`/team`, `/work/summary`) เพื่อป้องกันการ์ดบีบ/กราฟพับ · แท่งกราฟใช้ `cornerRadius: { topLeft: 8, topRight: 8 }` + เส้นกริดประ (`dashArray: '4,4'`) + `opposedPosition: true` · Donut `centerLabel` ที่อิงธีมต้องผูก `effect()` รีเฟรชเมื่อ `theme.isDark()` เปลี่ยน
  - **Refined Spring Motion & Dual Sliding Pills (Syncfusion-Safe)**: แถบ Active Pill บน Sidebar (`.saas-nav__active-pill`) และ Sub-Nav Bar (`.subnav-tabs__pill`) วัดพิกัดจริงด้วย `getBoundingClientRect()` + `ResizeObserver` ไหลด้วย `cubic-bezier(0.22, 1.28, 0.36, 1)` · Micro-interactions ใช้ `cubic-bezier(0.34, 1.56, 0.64, 1)` บน KPI Strip/inner icon-value/chips/badges/shell buttons + Page Cascade + `@media (prefers-reduced-motion: reduce)` · ห้าม `transform` บน `:hover` ของ `.e-card`/`.e-btn`/`.e-dialog`
- **Date Type-Safety**: ฟิลด์วันที่ (`closedOn`, `dueDate`, `startDate`) ที่มาจากฐานข้อมูลอาจเป็นได้ทั้ง `string` หรือ `Date` object ให้ normalize ด้วย `raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw ?? '')` ก่อนใช้ string methods เสมอ  

## สิทธิ์ / Board / Gantt / Writeback / KPI snapshot / Integrations

- **Dynamic Track Formula Engine (6 สายงาน)**:
  - รองรับ `RND`, `IMP`, `QA`, `UXBA`, `SUP`, `INFRA` โดยผูก Alias `Implement` ↔ `IMP` และ `RD` ↔ `RND`
  - **Fair Cutoff Rule**: วัด On-time การส่งมอบของ Dev เมื่อการ์ดย้ายเข้า `Ready for QA` ครั้งแรก (`readyForQaAt` / `devDeliveredOn`) เทียบกับ `firstDueOn` (ไม่นำเวลาค้างรอคิว QA มาตัดคะแนน Dev)
  - **Dynamic Leave Quota**: ปรับลดโควตาสุทธิอัตโนมัติ $\text{Net Quota} = \text{Base Quota} \times \frac{5 - \text{Leaves} - \text{Holidays}}{5}$
  - **Reviewer & QA Credit**: เครดิตเวลาผู้ตรวจ MR 10% และผู้ทดสอบ QA 15–20% ของ `estimateMd`
  - **Multi-Role Effort Split**: ตาราง `ticket_allocations` แยกคิดคะแนนและโควตารายบุคคลเมื่อ `isSplitEffort = true`
- Assign / รับคิว & แก้วันบน Gantt Timeline (`/work/timeline`): `admin` | `lead` เท่านั้น (`canAssignWork`)  
- Gantt Timeline: รองรับ `parentID: 'ParentID'` (`_links.parent` → `opParentId`/`parentId`) + แก้ `StartDate`/`EndDate` ผ่าน `applyGanttDateEdit` โดยห้ามทับ `firstDueOn` · สวิตช์ «มุมมองโครงงาน / มุมมองตามคน» (`ProjectView`|`ResourceView`) โดย sanitize `ResourceInfo` และไม่เปิด work-unit recalc  
- Kanban Board (`/work/board`): มี Swimlane switcher + `ejs-dialog` แก้ไขฟิลด์ + Delivery Timeline · `admin`/`lead` ย้ายได้ทุกสถานะรวม `Done` และแก้แผนได้ (`canEditBoardPlanning`) · `member` ย้ายได้ถึง `Ready for QA` / `In QA` ห้ามปิด `Done` เอง (`canMoveWorkflowByRole`)  
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
- **OpenProject User Sync & Team Staging Isolation**:
  - **Pagination Rule**: พารามิเตอร์ `offset` ใน OpenProject API v3 คือ **1-based page number** (1, 2, 3...) ต้องวนลูปด้วย `offset += 1` เสมอ (ห้ามใช้ `offset += pageSize`)
  - **User Custom Fields**: ข้อมูลแผนกและตำแหน่งใน OpenProject อยู่ใต้ `_links`: `customField1` (แผนก), `customField2` (ฝ่ายย่อย), `customField3` (ตำแหน่งงานจริง)
  - **Profile Details**: จัดเก็บ `avatar_url`, `department`, `job_title` ลงในตาราง `people` โดยในฝั่ง UI แสดงรูปโปรไฟล์พร้อม `(error)="onAvatarError()"` เพื่อ fallback เป็นตัวย่อ 2 ตัวอักษรบน Gradient อย่างสวยงาม
  - **Team Staging Isolation**: ในช่วงทดสอบเฉพาะทีม (เช่น R&D) พนักงานแผนกอื่นถูกตั้งค่า `active = false` ในตาราง `people` (ไม่ลบข้อมูล) โดย `listPeople(db, true)` จะกรองเฉพาะคนที่ active ส่งผลให้หน้า `/login`, ผังคน และการคำนวณคะแนนแสดงเฉพาะทีมที่กำลังทดสอบ และกรองตั๋วใน `bootstrap` ให้โฟกัสเฉพาะ Track RD หรือ Assignee ที่ active
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
  - **Team & Person Dashboards (`/team` และ `/people/:id`)**: ใช้ `StackingArea` บน `ejs-chart` แสดงแนวโน้มสัดส่วน Planned MD vs Unplanned ทั่วไป vs MD Mandate


## อย่าทำ

- อย่าแก้สูตรคะแนนโดยไม่ verify  
- อย่า commit `.env`, `.agents/`, `.claude/`, `skills-lock.json`  
- อย่าเปิด OpenProject writeback เป็นค่าเริ่ม  

