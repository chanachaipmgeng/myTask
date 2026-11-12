# Walkthrough โฟลว์จำลอง (seed / fixture)

ทดสอบทีละหน้าบน `http://127.0.0.1:4200` โดย **ไม่ใส่ OpenProject/GitLab token** และไม่กด Sync จริง  
สแตก: Postgres + Nest `:3000` + `ng serve` `:4200`  
แคปจอ: [walkthrough-screenshots/](walkthrough-screenshots/)

## ผลรวม

**วิเคราะห์ KPI ได้** จากแดชบอร์ดทีมและรายคนหลัง seed + mutation จาก fixture/queue  
หลังขั้น 12 ยังเห็นดัชนี/กราฟ, plan %, สัดส่วน unplanned/spike ตามสาย และแจ้งเตือน shell (ALERT-BURN, IMP-OPEN)

| ขั้น | หน้า | ผล | แคปจอ |
|---|---|---|---|
| 01 | `/admin` Dev login · ปวีณา | ผ่าน — `session … admin` / แก้ได้ / ต่อ API | [01-admin.png](walkthrough-screenshots/01-admin.png) |
| 02 | `/team` สลับ Implement / R&D / All | ผ่าน — ดัชนี + trend/quota จาก seed + บริบท 2568 | [02-team.png](walkthrough-screenshots/02-team.png) |
| 03 | `/people` กรองสาย / เปิดแถว | ผ่าน — ตารางคะแนนรายคนครบ | [03-people.png](walkthrough-screenshots/03-people.png) |
| 04 | `/people/itsara` | ผ่าน — index / ใบปิด / ความหมาย KPI (เช่น itsara ≈ 89.3) | [04-person-itsara.png](walkthrough-screenshots/04-person-itsara.png) |
| 05 | `/tickets` ซิงก์ไฟล์ตัวอย่าง | ผ่าน — นำเข้า fixture; กริดมีใบงาน | [05-tickets.png](walkthrough-screenshots/05-tickets.png) |
| 06 | `/pipeline` | ผ่าน — คัมบังสถานะจาก seed | [06-pipeline.png](walkthrough-screenshots/06-pipeline.png) |
| 07 | `/queue` รับข้อเสนอ | ผ่าน — รับ Q-IMP-XL; assignee เข้า API/หน่วยความจำ | [07-queue.png](walkthrough-screenshots/07-queue.png) |
| 08 | `/mygit` ซิงก์ fixture | ผ่าน — ตาราง matched/unmatched | [08-mygit.png](walkthrough-screenshots/08-mygit.png) |
| 09 | `/teams` ทดสอบส่ง | ผ่าน — log ในเครื่อง ไม่ยิง webhook | [09-teams.png](walkthrough-screenshots/09-teams.png) |
| 10 | `/ai` อ่านอย่างเดียว | ผ่าน — การ์ด/กราฟ AI–spike | [10-ai.png](walkthrough-screenshots/10-ai.png) |
| 11 | `/integrations` อ่านอย่างเดียว | ผ่าน — ไม่มี token / ไม่กด Sync now | [11-integrations.png](walkthrough-screenshots/11-integrations.png) |
| 12 | `/team` ยืนยันหลัง mutation | ผ่าน — ยังวิเคราะห์ได้; ตัวอย่าง **56 ใบ · 53.15 MD** จากใบตัวอย่าง | [12-team-recheck.png](walkthrough-screenshots/12-team-recheck.png) |

ข้ามตามแผน: GitLab OAuth, ใส่ OP token, Sync now จริง, writeback assignee

## สิ่งที่ถือว่าวิเคราะห์ได้ (ตรวจแล้ว)

- ดัชนีรายคน/ทีม แยก Implement vs R&D (ขั้น 02–04, 12)
- plan % และ man-day ปิดเทียบโควตา
- สัดส่วน unplanned / spike ตามสาย + บริบทปี 2568 จาก `team-context`
- แจ้งเตือน shell เมื่อมีใบค้างใน seed

## บั๊ก / หมายเหตุตอนคลิก

| รายการ | บล็อกวิเคราะห์? |
|---|---|
| แบนเนอร์ Syncfusion trial ทับขอบบน | ไม่ |
| หลังซิงก์ fixture จำนวนใบบนทีมเพิ่ม (54 → 56) ตามที่คาด | ไม่ |

ไม่พบบั๊กที่บล็อกการวิเคราะห์ KPI ในรอบนี้
