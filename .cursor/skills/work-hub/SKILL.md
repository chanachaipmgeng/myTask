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
| Summary | Chart / DashboardLayout | `workSummaryStats` |
| Timeline | `ejs-gantt` (`parentID: 'ParentID'`, Toolbar, `EditService` เฉพาะ `admin`/`lead`) | `workGanttTasks`, `applyGanttDateEdit`, `updateTicketDates` |
| Backlog | Grid | `workBacklogRows` |
| Board | Kanban + ตัวสลับ Swimlane + Rich Card + `#editDialog` (`ejs-dialog`) | `workflow` (`canMoveWorkflowByRole`, `canEditBoardPlanning`) + `ScorecardService` |
| List | Grid งาน (`ColumnChooser`, `ExcelExport`, `CsvExport`, `ResizeService`, ปุ่มไป Board) | `workListRows` |

## กฎ

- คำนวณแถวในโดเมนก่อน bind UI
- เก็บ `/tickets` เป็นตารางคะแนน (มี `ejs-accordion` ยุบฟอร์มนำเข้า/เพิ่มใบงาน, `frozenColumns="2"`, Export/Aggregate) — อย่าทำ List ใน `/work` ให้เป็นตารางคะแนนซ้ำ
- มีปุ่มสลับหน้าระหว่าง `/work` กับ `/tickets`
- `/pipeline` → `/work/board`
- Gantt เปิดแก้ไข `StartDate`/`EndDate` เฉพาะ `admin`/`lead` (`canAssignWork`) โดยใช้ `applyGanttDateEdit` ที่ห้ามทับ `firstDueOn` เด็ดขาด
- บน Board: `member` ย้ายการ์ดได้ถึง `Ready for QA` / `In QA` ห้ามปิดเข้า `Done` เอง และแก้ได้เฉพาะฟิลด์ส่งมอบ (`mrLink`, `pocResult`, `bugCause`) พร้อมแสดง Delivery & Activity Log ใน Dialog
- ตารางหลัก (`/tickets`, `/work/list`): เปิด `[enablePersistence]="true"` เพื่อจดจำการตั้งค่าคอลัมน์ของผู้ใช้
- โครงสร้าง Sidebar: รองรับ Sticky Pinning (100vh) และสลับ Mini-Sidebar 68px/260px ผ่าน `.nav-toggle` เพื่อเพิ่มพื้นที่ทำงาน
- การตรวจผลงาน 1-on-1 (`/people/:id`): มีปุ่ม `prevPerson` / `nextPerson` ให้ตรวจประเมินต่อเนื่องได้ครบทั้ง 15 คน
- หลังแก้โดเมน มุมมอง: เพิ่ม assert ใน `scripts/verify-scores.ts` แล้ว `npm run verify`
