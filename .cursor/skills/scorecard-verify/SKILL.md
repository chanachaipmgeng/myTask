---
name: scorecard-verify
description: >-
  Run and interpret man-day scorecard verification after scoring or seed changes.
  Use when editing shared/domain/scoring.ts, verify-scores.ts, seed tickets,
  person-dashboard, work-views, or mock-scenario, or when the user asks to verify scores.
---

# ตรวจกติกาคะแนน

## เมื่อไหร่ต้องรัน

หลังแก้สูตรคะแนน, seed ใบงาน, roster/dashboard ที่อิง `scorePerson`/`scoreTicket`, mock scenario, `assignTicket` / คิว capacity, `kpi-snapshot` / ช่วงเดือน-ไตรมาส, `work-views` (Gantt `ParentID` & `applyGanttDateEdit`), `workflow` (`canMoveWorkflowByRole` & `canEditBoardPlanning`), หรือ `gitlab-mr` (`mapGitLabMergeRequests`)

## คำสั่ง

```powershell
npm run verify
npm --prefix server run test
```

รันเทสเซิร์ฟเวอร์เมื่อแตะ OpenProject mapper/client ด้วย (`15/15` unit tests)

## สิ่งที่ต้องผ่าน

- สคริปต์จบด้วย `verify-scores ok`
- IMP-100 `total` = 100
- RD-SPIKE `spikeScore` = 100
- เคส roster / person dashboard / work-views (รวม Gantt `ParentID` และ `applyGanttDateEdit` ที่ห้ามทับ `firstDueOn`) / workflow permissions (`canMoveWorkflowByRole`) / GitLab MR parser (`mapGitLabMergeRequests`) ใน verify ต้องไม่พัง

## ถ้า fail

1. อ่าน assertion message ใน `scripts/verify-scores.ts`
2. แก้โดเมนใน `shared/domain/` ไม่แก้ตัวเลขคาดหวังเพื่อให้ผ่านโดยไม่ตั้งใจ
3. ถ้ารูปแบบคะแนนเปลี่ยนตามที่ผู้ใช้ขอ — อัปเดต verify และอธิบายใน PR/commit
