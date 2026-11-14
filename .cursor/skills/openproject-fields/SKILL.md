---
name: openproject-fields
description: >-
  Map myProject (OpenProject) standard and custom fields into Ticket model and
  Integrations UI, plus GitLab MR sync and Teams Webhook configuration. Use when
  adding CF keys, changing openproject.mapper/client/sync, Integrations page,
  or documenting recommended OP fields for KPI.
---

# แมปฟิลด์ myProject & Integrations

## ไฟล์หลัก

- `server/src/integrations/openproject/openproject.mapper.ts` — `OpenProjectMapping`, `mapWorkPackage` (รวม `_links.parent` → `opParentId`/`parentId`), helpers
- `server/src/integrations/openproject/openproject.client.ts` — `patchAssignee`, `patchDates`
- `server/src/integrations/openproject/openproject.sync.ts` — `sync`, `writebackAssignee`, `writebackDates`
- `server/src/api/integrations.controller.ts` — OpenProject, GitLab MR sync (`gitlab`), Teams Webhook (`teams`)
- `src/app/pages/integrations/` — `ejs-tab` 3 ระบบ (OpenProject, GitLab, Microsoft Teams) + ตัวช่วย `statusMap` + ฟอร์ม `customFields`
- `docs/คู่มือ.md` — ตารางฟิลด์แนะนำและตัวอย่าง `.env`
- `server/test/unit/openproject.mapper.spec.ts` & `openproject.client.spec.ts` — เทสแมปและ PATCH

## ขั้นตอนขยาย CF

1. เพิ่มคีย์ใน `customFields` ของ interface + `DEFAULT_OPENPROJECT_MAPPING`
2. อ่านด้วย `customValue` + helper (`asBool`, `asStoryPoint`, …)
3. ใส่ใน `base` ticket; ตอน merge ทับเฉพาะเมื่อมีค่าจาก CF (คงฟิลด์โลคอล)
4. เพิ่มแถวใน Integrations `customFieldRows`
5. อัปเดตตารางในคู่มือ
6. เพิ่ม/ขยาย unit test แล้ว `npm --prefix server run test`

## Assign / Dates Writeback & Integrations (P1–P2 ปิดแล้ว)

- API assign & dates: `@Roles('admin', 'lead')` ใน `work-items.controller.ts` (`POST /api/work-items/:id/assign` และ `POST /api/work-items/:id/dates`)
- UI: `canAssignWork` + ปุ่มรับข้อเสนอใน `/queue` (Dialog ยืนยันเมื่อ `writeback && opId`) + แก้วันเริ่ม/ส่งบน `/work/timeline`
- `OPENPROJECT_WRITEBACK=true` → PATCH assignee หรือ startDate/dueDate หลังอัปเดตสำเร็จ; ล้มแล้วคืน `writebackError` (ไม่ทับ `firstDueOn`)
- อย่าเปิด writeback เป็นค่าเริ่ม; อย่าทำ toggle จาก UI โดยไม่ผ่านแผน
- GitLab MR sync (`POST /api/integrations/gitlab/sync`) ใช้ `shared/domain/gitlab-mr.ts` จับคู่รหัสใบงานและอัปเดต `mrLink`/`reviewRounds`/`reopenCount`
- Teams Webhook (`POST /api/integrations/teams/send`) ส่งแจ้งเตือน `deadline`/`overrun` ผ่าน `TEAMS_WEBHOOK_URL` หรือค่าที่ตั้งในตาราง `connections` (`id='teams'`)

## ข้อจำกัด

- ค่า mapping ว่างหรือ `customField\d+` เท่านั้น (`validateMapping`)
- `hoursPerMd` ค่าเริ่ม 6
