---
name: workspace-filter
description: >-
  Own Global WorkspaceFilter vs page-local filters (work hub, Person Workspace,
  team dashboard, handoff, schedule). Use when editing workspace-filter.ts,
  work-hub-filter, person-workspace, team-dashboard, work-handoff, schedule,
  app.ts nav labels, or diagnosing sticky team/person leaks across hubs.
---

# Global Filter + เจ้าของตัวกรองตามหน้า

## หลัก

- **ไม่**สร้างหน้ากรองกลางใหม่ — คงแถบ Global Filter สำหรับ `/cockpit` `/team` `/work` `/people` `/quality` `/mygit` `/schedule`
- แต่ละหน้าเป็นเจ้าของมิติที่ตัวเองควรมี; ห้ามรั่ว `personId` / `teamId` ข้าม hub โดยไม่ตั้งใจ

## `WorkspaceFilter` (`src/app/core/workspace-filter.ts`)

| สัญญาณ | ความหมาย |
|---|---|
| `teamId` | ว่าง = ทุกทีมในองค์กร/สิทธิ์ (ค่าเริ่มต้น; **ห้าม** auto-set เป็น `selfTeamId`) |
| `track` | ชิป 6 สาย + All |
| `personId` | คนที่เลือกบน Global · member ถูกบังคับเป็น self ใน `scope()` |
| cycle / from / to / year / statusScope / project / type | ตาม URL |

- `clear()` → `teamId = ''` (ทุกทีม) ไม่คืนทีมตัวเอง
- `applyToPeople` / `applyToTickets` อ่านจาก `scope()` + `effectiveAllowedTeams`
- API bootstrap/list ต้องกรอง visibility ฝั่งเซิร์ฟเวอร์ด้วย (`computeEffectiveAllowedTeams`)

## เจ้าของตามหน้า

| พื้นผิว | เป็นเจ้าของ | ห้าม |
|---|---|---|
| Global Filter | team / track / person / cycle / dates / status / project | ซ่อนบนหน้าที่เขียน Global โดยไม่มีทางเคลียร์ |
| `/work` (`WorkHubFilter`) | week / dueBucket / search เท่านั้น | persist หรือ restore `teamId`/`track`/`opProject` จาก sessionStorage |
| Person WS | directory search/sort/view คน\|ทีม · **route** `/workspace/people/:id` | `setPerson` ตอนคลิกการ์ด — เขียน Global เฉพาะตอนเจาะ `/work/list` |
| `/team` | การ์ดทีมที่ดูแล → `setTeam` · roster คลิกได้ | member: roster ต้องเป็นทั้งทีม (อย่าใช้ `applyToPeople` ที่ force self สำหรับรายชื่อ) |
| `/work/handoff` | SLA chips ของหน้า | ฐานรายงานต้องมาจาก `applyToTickets` (ไม่ใช่ handoffReport ทั้ง org ดิบ) · track sync Global |
| `/schedule` โหมดทีม | resource page size / day filter | dropdown ทีม/คนต้องเรียก `workspace.setTeam` / `setPerson` |
| `/admin/projects` | `filterTeam` ของแคตตาล็อก | ไม่ผูก Global |

## Nav ที่เกี่ยวข้อง

- Admin Sidebar: รายการเดียว **พนักงาน & ทีม** → `/workspace/people`
- `/org/teams` → `RedirectOrgTeamsHub` → `/workspace/people?view=teams`
- Member: ป้าย `hub-work` = **งานของฉัน**
- `matchNavId`: `/work/team-time` → `hub-work` (ไม่ใช่ `hub-team`)

## ตรวจ

1. เปิดคนใน Person WS → ไป `/cockpit` ต้องยัง「ทุกพนักงาน」(ไม่มี `?person=`)
2. ล้าง Global → ทีมเป็น「ทุกทีม…」ไม่กระโดดทีมตัวเอง
3. Member `/team` เห็นสมาชิกหลายคนในทีม · Sidebar มี「งานของฉัน」สองจุด (home + work) ได้ตามดีไซน์
