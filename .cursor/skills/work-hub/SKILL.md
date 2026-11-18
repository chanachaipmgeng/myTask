---
name: work-hub
description: >-
  Extend the /work hub views (Summary, Timeline Gantt, Backlog, Board, List) and
  shared work-views domain. Use when editing src/app/pages/work, work-views.ts,
  or changing work navigation/tabs.
---

# ฮับ `/work`

## โครง

- Shell: `src/app/pages/work/work-shell.*` + `WorkHubFilter` (สาย + ค้นหา + `scope` mine|team + `assigneeId`)
- Routes: `/work` (ทีม · `admin`/`lead` · `data.scope = 'team'`) และ `/me/work` (ของฉัน · ทุกสิทธิ์ · `data.scope = 'mine'`)
- Children: `summary` | `timeline` | `backlog` | `board` | `list` · แท็บ `handoff` มีเฉพาะฮับทีม
- โดเมน: `shared/domain/work-views.ts` → re-export `src/app/core/work-views.ts` · `filterWorkTickets` รองรับ `assigneeId`

## มุมมอง

| แท็บ | UI | โดเมน / บริการ |
|---|---|---|
| Summary | `app-kpi-stat` + Chart / DashboardLayout + `ejs-message` (MD Mandate) | `workSummaryStats` (+ `assigneeId` เมื่อ mine) |
| Timeline | `ejs-gantt` · ทีม: สวิตช์ ProjectView/ResourceView + แก้วันถ้า `canAssignWork` · ของฉัน: ProjectView อ่านอย่างเดียว | `workGanttTasks`, `applyGanttDateEdit` |
| Backlog | Grid ใน `section-card` · ทีม = Backlog หรือยังไม่มีผู้รับ · ของฉัน = Backlog ที่ assign ให้ฉัน · grid id คนละชุด | `workBacklogRows` |
| Board | Kanban + Swimlane (ของฉันไม่มี swimlane ตามคน) + Dialog + Delivery Timeline | `workflow` + filter ตาม `assigneeId` |
| List | Grid งาน · grid id คนละชุดระหว่างทีม/ของฉัน · ปุ่มไป Board ตาม scope | `workListRows` |
| Handoff | เฉพาะ `/work/handoff` | `multi-team` / Scorecard handoff report |
| Board block | `app-confirm-dialog` · edit dialog `#editDialog` | workflow guards |

## Shared UI (`src/app/shared/ui/`)

ใช้ซ้ำข้ามหน้า: `app-page-head`, `app-section-card`, `app-status-badge`, `app-form-field`, `app-flash-messages`, `app-filter-chips`, `app-confirm-dialog` (Fade) · KPI: `app-kpi-stat` (layout/trend/progress/sparkline/skeleton) · tone: `badge.ts` · แถวสถิติทุกหน้าต้องเรียก `app-kpi-stat` ห้ามห่อ `kpi-value` ดิบ · Toast ผ่าน `ShellNotice` (typed) · AppBar แจ้งเตือน = ปุ่มไอคอน `e-warning` + `e-badge-notification e-badge-overlap`

## Syncfusion style layers

1. Theme CSS — `assets/themes/tailwind3(.css|-dark.css)` ผ่าน `#sf-theme-link`
2. App tokens / layout — `src/styles.scss`
3. จุดกลางแต่ง SF — `src/styles/sf/` (`_components.scss`: buttons scoped, grid frozen, kanban `.pipeline-board`, gantt/schedule ขอบเบา)

อย่ากระจาย override Syncfusion กลับไปใน component SCSS หรือ `styles.scss` โดยไม่จำเป็น · ห้าม `transform` บนปุ่ม/dialog · ห้าม `overflow:hidden` บน Gantt โดยไม่จำเป็น

## DataGrid cell polish (แนว Essential UI Kit — จุดๆ)

ตารางหลัก (`/work/list`, `/people`, `/tickets`) ใช้ cell template ไม่ยกบล็อก UI Kit ทั้งชุด:
- สถานะ/แผน/แจ้งเตือน → `app-status-badge` + tone map ใน `shared/ui/badge.ts`
- ดัชนีคน → `ejs-progressbar` สั้นในเซลล์ (`.grid-index-cell` ใน `styles/sf`)
- Search ใน grid toolbar เมื่อยังไม่มีช่องค้นหาภายนอก
- `/work/list` มีคอลัมน์ Action ปุ่ม `ดูสรุป` · grid id `work-operational-list-grid-v2`
- เพิ่มคอลัมน์บน grid ที่ `enablePersistence` → เปลี่ยน `id` หรือล้าง `localStorage` key `grid…` ไม่งั้นคอลัมน์ใหม่ไม่โผล่

## กฎ

- คำนวณแถวในโดเมนก่อน bind UI
- เก็บ `/tickets` เป็นตารางคะแนน (มี `ejs-accordion` ยุบฟอร์มนำเข้า/เพิ่มใบงาน, `frozenColumns="2"`, Export/Aggregate) — อย่าทำ List ใน `/work` ให้เป็นตารางคะแนนซ้ำ
- มีปุ่มสลับหน้าระหว่าง `/work` กับ `/tickets`
- `/pipeline` → `/work/board`
- Gantt เปิดแก้ไข `StartDate`/`EndDate` เฉพาะ `admin`/`lead` (`canAssignWork`) โดยใช้ `applyGanttDateEdit` ที่ห้ามทับ `firstDueOn` เด็ดขาด
- Resource View: กรอง/clone `ResourceInfo` ให้เหลือเฉพาะคนที่รู้จักและมี `resourceId` · ในโหมด resource ซ่อนคอลัมน์ `TaskID` (ไม่ตั้งเป็น primary) · หลัง `created` เรียก `treeGrid.refresh()` / `expandAll` · baseline แสดงเฉพาะ ProjectView
- บน Board: `member` ย้ายการ์ดได้ถึง `Ready for QA` / `In QA` ห้ามปิดเข้า `Done` เอง และแก้ได้เฉพาะฟิลด์ส่งมอบ (`mrLink`, `pocResult`, `bugCause`) พร้อมแสดง Delivery Timeline + Activity Log ใน Dialog
- `/tickets/disputes`: ใช้ `ejs-splitter` 2 บานในหน้า — ห้าม Over drawer ทับตาราง
- ตารางหลัก (`/tickets`, `/work/list`): เปิด `[enablePersistence]="true"` เพื่อจดจำการตั้งค่าคอลัมน์ของผู้ใช้
- โครงสร้าง Sidebar: รองรับ Sticky Pinning (100vh) และสลับ Mini-Sidebar 68px/260px ผ่าน `.nav-toggle` เพื่อเพิ่มพื้นที่ทำงาน
- การตรวจผลงาน 1-on-1 (`/people/:id`): มีปุ่ม `prevPerson` / `nextPerson` ให้ตรวจประเมินต่อเนื่องได้ครบทั้ง 15 คน · AI Coach ใช้ `ejs-textbox` + ผลลัพธ์ใน `e-card`
- UI chrome: ใช้ shared UI ด้านบน · ห้ามห่อใหม่ด้วย Tailwind `rounded-xl … shadow-sm`
- หลังแก้โดเมน มุมมอง: เพิ่ม assert ใน `scripts/verify-scores.ts` แล้ว `npm run verify`
