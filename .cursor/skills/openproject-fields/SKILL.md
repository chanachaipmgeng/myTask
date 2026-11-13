---
name: openproject-fields
description: >-
  Map myProject (OpenProject) standard and custom fields into Ticket model and
  Integrations UI. Use when adding CF keys, changing openproject.mapper,
  Integrations page, or documenting recommended OP fields for KPI.
---

# แมปฟิลด์ myProject

## ไฟล์หลัก

- `server/src/integrations/openproject/openproject.mapper.ts` — `OpenProjectMapping`, `mapWorkPackage`, helpers
- `src/app/pages/integrations/` — ฟอร์ม `customFields`
- `docs/คู่มือ.md` — ตารางฟิลด์แนะนำ
- `server/test/unit/openproject.mapper.spec.ts` — เทสแมป

## ขั้นตอนขยาย CF

1. เพิ่มคีย์ใน `customFields` ของ interface + `DEFAULT_OPENPROJECT_MAPPING`
2. อ่านด้วย `customValue` + helper (`asBool`, `asStoryPoint`, …)
3. ใส่ใน `base` ticket; ตอน merge ทับเฉพาะเมื่อมีค่าจาก CF (คงฟิลด์โลคอล)
4. เพิ่มแถวใน Integrations `customFieldRows`
5. อัปเดตตารางในคู่มือ
6. เพิ่ม/ขยาย unit test แล้ว `npm --prefix server run test`

## Assign / writeback (P1 ปิดแล้ว)

- API assign: `@Roles('admin', 'lead')` ใน `work-items.controller.ts`
- UI: `canAssignWork` + ปุ่มรับข้อเสนอใน `/queue`; Dialog ยืนยันเมื่อ `writeback && opId`
- `OPENPROJECT_WRITEBACK=true` → PATCH assignee หลัง assign สำเร็จ; ล้มแล้วคืน `writebackError`
- อย่าเปิด writeback เป็นค่าเริ่ม; อย่าทำ toggle จาก UI โดยไม่ผ่านแผน

## ข้อจำกัด

- ค่า mapping ว่างหรือ `customField\d+` เท่านั้น (`validateMapping`)
- `hoursPerMd` ค่าเริ่ม 6
- P2 Teams จะใช้ `TEAMS_WEBHOOK_URL` (ยังไม่ implement)
