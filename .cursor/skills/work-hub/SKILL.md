---
name: work-hub
description: >-
  Extend the /work hub views (Summary, Timeline Gantt, Backlog, Board, List) and
  shared work-views domain. Use when editing src/app/pages/work, work-views.ts,
  or changing work navigation/tabs.
---

# ฮับ `/work`

## โครง

- Shell: `src/app/pages/work/work-shell.*` + `WorkHubFilter` (สาย + ค้นหา)
- Children routes: `summary` | `timeline` | `backlog` | `board` | `list`
- โดเมน: `shared/domain/work-views.ts` → re-export `src/app/core/work-views.ts`

## มุมมอง

| แท็บ | UI | โดเมน / บริการ |
|---|---|---|
| Summary | `app-kpi-stat` + Chart / DashboardLayout + `ejs-message` (MD Mandate) | `workSummaryStats` |
| Timeline | `ejs-gantt` (`parentID: 'ParentID'`, Toolbar, `EditService` เฉพาะ `admin`/`lead`) | `workGanttTasks`, `applyGanttDateEdit`, `updateTicketDates` |
| Backlog | Grid ใน `section-card` | `workBacklogRows` |
| Board | `app-kpi-stat` + Kanban + Swimlane + Rich Card (`e-badge` MD-DIRECT/PAUSED) + `#editDialog` | `workflow` + `ScorecardService` |
| List | Grid งาน (`ColumnChooser`, `ExcelExport`, `CsvExport`, `ResizeService`, ปุ่มไป Board) | `workListRows` |
| Handoff | `app-page-head` + `app-section-card` + `app-kpi-stat` + `app-status-badge` (chart / blocker / SLA grid) | `multi-team` / Scorecard handoff report |
| Board block | `app-confirm-dialog` (รับทราบ) · edit dialog ยังเป็น `#editDialog` เต็ม | workflow guards |

## Shared UI (`src/app/shared/ui/`)

ใช้ซ้ำข้ามหน้า: `app-page-head`, `app-section-card`, `app-status-badge`, `app-form-field`, `app-flash-messages`, `app-filter-chips`, `app-confirm-dialog` · KPI: `app-kpi-stat` · tone: `badge.ts`

## กฎ

- คำนวณแถวในโดเมนก่อน bind UI
- เก็บ `/tickets` เป็นตารางคะแนน (มี `ejs-accordion` ยุบฟอร์มนำเข้า/เพิ่มใบงาน, `frozenColumns="2"`, Export/Aggregate) — อย่าทำ List ใน `/work` ให้เป็นตารางคะแนนซ้ำ
- มีปุ่มสลับหน้าระหว่าง `/work` กับ `/tickets`
- `/pipeline` → `/work/board`
- Gantt เปิดแก้ไข `StartDate`/`EndDate` เฉพาะ `admin`/`lead` (`canAssignWork`) โดยใช้ `applyGanttDateEdit` ที่ห้ามทับ `firstDueOn` เด็ดขาด
- บน Board: `member` ย้ายการ์ดได้ถึง `Ready for QA` / `In QA` ห้ามปิดเข้า `Done` เอง และแก้ได้เฉพาะฟิลด์ส่งมอบ (`mrLink`, `pocResult`, `bugCause`) พร้อมแสดง Delivery & Activity Log ใน Dialog
- ตารางหลัก (`/tickets`, `/work/list`): เปิด `[enablePersistence]="true"` เพื่อจดจำการตั้งค่าคอลัมน์ของผู้ใช้
- โครงสร้าง Sidebar: รองรับ Sticky Pinning (100vh) และสลับ Mini-Sidebar 68px/260px ผ่าน `.nav-toggle` เพื่อเพิ่มพื้นที่ทำงาน
- การตรวจผลงาน 1-on-1 (`/people/:id`): มีปุ่ม `prevPerson` / `nextPerson` ให้ตรวจประเมินต่อเนื่องได้ครบทั้ง 15 คน · AI Coach ใช้ `ejs-textbox` + ผลลัพธ์ใน `e-card`
- UI chrome: ใช้ shared UI ด้านบน · ห้ามห่อใหม่ด้วย Tailwind `rounded-xl … shadow-sm`
- หลังแก้โดเมน มุมมอง: เพิ่ม assert ใน `scripts/verify-scores.ts` แล้ว `npm run verify`
