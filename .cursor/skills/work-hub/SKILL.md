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

| แท็บ | UI | โดเมน |
|---|---|---|
| Summary | Chart / DashboardLayout | `workSummaryStats` |
| Timeline | `ejs-gantt` | `workGanttTasks` |
| Backlog | Grid | `workBacklogRows` |
| Board | Kanban + ฟอร์มฟิลด์ | `workflow` + ScorecardService |
| List | Grid งาน | `workListRows` |

## กฎ

- คำนวณแถวในโดเมนก่อน bind UI
- เก็บ `/tickets` เป็นตารางคะแนน — อย่าทำ List ให้เป็นตารางคะแนนซ้ำ
- `/pipeline` → `/work/board`
- Gantt อ่านอย่างเดียวจนกว่าแผนจะเปิด edit
- หลังแก้โดเมน มุมมอง: เพิ่ม assert ใน `scripts/verify-scores.ts` แล้ว `npm run verify`
