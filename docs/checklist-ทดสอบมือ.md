# Checklist ทดสอบมือ — Man-day Scorecard

ใช้เอกสารนี้เมื่อต้องการไล่ตรวจทั้งระบบทีละหน้า (กา `[x]` เมื่อผ่าน)  
ลำดับนี้จัดตามสิทธิ์และตัวกรองข้ามหน้า — **เริ่มจากสภาพแวดล้อม → Login → Shell → Member → Lead → Admin → Redirect**

คู่มือภาพหน้าจอ: [คู่มือการใช้งานหน้าจอ.md](./คู่มือการใช้งานหน้าจอ.md)  
แคปจอ: `docs/manual-screenshots/` · สคริปต์ `node scripts/capture_all_screens.mjs` (Playwright + Dev Quick Login · ต้องมี `:4200` + `:3000`)

---

## 0. สภาพแวดล้อม

- [ ] API ขึ้น (`:3000`) · เว็บขึ้น (`:4200` หรือ Docker `:8080`)
- [ ] `GET /api/health` หรือสถานะ **API สด** บน AppBar
- [ ] มีข้อมูล bootstrap (คน / ใบงาน / แคตตาล็อกโปรเจกต์)
- [ ] Light Mode เป็นค่าเริ่มสำหรับแคปเอกสาร

---

## 1. Auth — เข้าสู่ระบบ

### 1.1 `/login` — เข้าสู่ระบบ & สลับบทบาท
| | |
|---|---|
| **สิทธิ์** | สาธารณะ |
| **หน้าที่** | ล็อกอิน SSO / รหัสผ่าน · Dev Quick Login สลับบทบาท |
| **หน้าลูก** | — |

จุดตรวจ:
- [ ] ปุ่ม Dev: Member / Lead / Admin ล็อกอินได้
- [ ] หลังล็อกอิน**ทุกสิทธิ์**ไป **`/me`** (ไม่กระโดด `/admin` หรือ `/cockpit`)
- [ ] SSO GitLab (ถ้าระบุ env) กลับมาที่ `/me`

---

## 2. Shell ร่วม (ทุกสิทธิ์หลังล็อกอิน)

ทำบนหน้าที่มี Global Filter เช่น `/cockpit` หรือ `/work/summary`

- [ ] Sidebar: เมนูหลักครบ · Lead เห็น「บริหารทีม」· Admin เห็น「ตั้งค่าระบบ」
- [ ] `Ctrl+B` ยุบ/กาง Sidebar
- [ ] `Ctrl+K` Omnisearch: ใบงาน / คน / โปรเจกต์ (ชื่อ·slug·รหัส) / เมนู
- [ ] AppBar: ค้นหา · API สด · กระดิ่งแจ้งเตือน (มีปุ่มเปิดใบเมื่อมี `ticketId`) · สลับธีม
- [ ] **ไม่มี**ชื่อหน้าซ้ำ / ปุ่มพรีวิว Member / อวาตาร์สลับบัญชีบน AppBar
- [ ] โปรไฟล์ + ออกจากระบบอยู่ท้าย Sidebar
- [ ] Global Filter โชว์บน whitelist (`/work` `/team` `/cockpit` `/people` `/quality` `/mygit` `/schedule`) และ**ซ่อน**บน `/me` `/admin*` `/integrations` `/workspace/people`
- [ ] เปลี่ยนทีม/สาย/คนบน Filter แล้วสลับหน้า — ค่าติด URL
- [ ] ≤640px: ปุ่ม「ตัวกรอง」+ ป็อปโอเวอร์

---

## 3. Member path — ของฉัน & งานตัวเอง

### 3.1 `/me` — งานของฉัน
| | |
|---|---|
| **สิทธิ์** | Member / Lead / Admin |
| **หน้าที่** | หน้าแรกหลังล็อกอิน · สรุปงานเปิด เป้า MD คำแนะนำ |
| **หน้าลูก** | ไม่มีแท็บย่อย (ลิงก์ไปหน้าอื่นจาก Sidebar) |

- [ ] เห็น KPI / งานเปิดของตัวเอง
- [ ] ไม่จัดอันดับเทียบคนอื่น

### 3.2 `/cockpit` (กรองเฉพาะฉัน) — ภาพรวมของฉัน
| | |
|---|---|
| **สิทธิ์** | ทุกสิทธิ์ (Member เห็นเฉพาะตน) |
| **หน้าที่** | KPI กราฟ เรดาร์ความเสี่ยงส่วนบุคคล |
| **หน้าลูก** | — |

- [ ] ปุ่มทีวี / เต็มจอ / ขยายกราฟ
- [ ] Member ไม่เห็นข้อมูลทีมทั้งก้อนเมื่อไม่ได้เลือกทีม

### 3.3 งาน (`/work/*`) — มุมของฉัน
แท็บที่ member ใช้ได้: **สรุป · ไทม์ไลน์ · งานรอจัด · บอร์ด · รายการ**  
(คิวจ่ายงาน / งานค้าง & SLA = lead/admin)

- [ ] `/work/summary` — ถังวัน / ชิปสัปดาห์
- [ ] `/work/timeline` — Gantt อ่านได้อย่างเดียว (member)
- [ ] `/work/backlog` — งานรอจัดของฉัน
- [ ] `/work/board` — ลากได้ถึง Ready for QA / In QA · ห้ามปิด Done เอง
- [ ] `/work/list` — เปิด drawer 360°
- [ ] เปิด `/work/queue` หรือ `/work/handoff` → ถูกกัน / พาไปหน้าอื่น

### 3.4 `/quality/*` — คะแนนของฉัน
แท็บ member: **ตารางคะแนน · วิเคราะห์รายคน · เช็กเวลา 3 ทาง · ขอทบทวนคะแนน · งาน AI & Spike**

- [ ] `/quality/tickets` — ดูคะแนน / อัปเดตงาน / ขอทบทวน
- [ ] `/quality/ols` — วิเคราะห์รายคนของฉัน
- [ ] `/quality/time-audit` — เช็กเวลา 3 ทาง
- [ ] `/quality/disputes` — ยื่น/ดูคำขอทบทวน
- [ ] `/quality/ai` — งาน AI & Spike
- [ ] `/quality/audit` และ `/quality/report` → ถูกกัน

### 3.5 `/mygit` — Git & MR ของฉัน
- [ ] ชิปสถานะ inbox (`app-filter-chips`)
- [ ] คิว MR / ลิงก์ใบงาน

### 3.6 `/schedule` — ปฏิทินของฉัน
- [ ] คลิกวัน → แผงรายละเอียด
- [ ] เปิดใบงานจากอีเวนต์ → drawer 360°

---

## 4. Lead path — บริหารทีม

ทำซ้ำข้อ Shell + Member แล้วเพิ่ม:

### 4.1 `/workspace/people` — คนในทีม
| | |
|---|---|
| **หน้าที่** | Directory การ์ดพนักงาน |
| **หน้าลูก** | `/workspace/people/:id` แท็บ: ภาพรวม · งาน · คะแนน · ปฏิทิน · วิเคราะห์ · Git & โค้ด |

- [ ] ค้นหา / กรองสาย · เปิดการ์ดคน
- [ ] สลับคนใน Workspace · กลับ Directory

### 4.2 `/people` — ตารางพนักงาน
- [ ] Export / คลิกชื่อไปโปรไฟล์
- [ ] `/people/:id` — แดชบอร์ดคะแนนเต็ม (self หรือ manager)

### 4.3 `/org/teams` — ทีมในองค์กร
- [ ] คลิกการ์ดทีม → กรองทีมติด Global Filter
- [ ] เข้า workspace ทีม (คน / งาน / คะแนน / ภาพรวม) ถ้ามี

### 4.4 `/team` — แดชบอร์ดทีม
แท็บตามบริบท: **แดชบอร์ด · เวลาทีม · ปฏิทินทีม**

- [ ] กราฟ / snapshot
- [ ] `/team/time` หรือ `/work/team-time`
- [ ] `/team/schedule` หรือ `/schedule?scope=team`

### 4.5 Work เพิ่มสิทธิ์ Lead
- [ ] `/work/queue` — จ่ายงาน · MD Mandate dialog · ยืนยัน writeback ถ้ามี `opId`
- [ ] `/work/handoff` — Stage aging · blocker · Ping Teams
- [ ] Gantt แก้วันเริ่ม/ส่งได้ (ไม่ทับ `firstDueOn`)
- [ ] Board: ย้ายได้ถึง Done · แก้ฟิลด์วางแผนครบ

### 4.6 Quality เพิ่มสิทธิ์ Lead
- [ ] `/quality/audit` — หลักฐานส่งมอบ · ตีกลับ Dev
- [ ] `/quality/report` — วิเคราะห์ทีม / รันรายงาน

---

## 5. Admin path — ตั้งค่าระบบ

### 5.1 `/admin` — สิทธิ์ & ตั้งค่า
| | |
|---|---|
| **หน้าที่** | Role matrix · โควตา · รอบประเมิน · audit log |
| **หน้าลูก** | แท็บบริบทเมื่ออยู่โซนแอดมิน |

- [ ] เปิด/แก้รอบประเมิน · activate รอบระบบ
- [ ] แก้สิทธิ์คน / ทีมที่มองเห็น

### 5.2 `/admin/projects` — แคตตาล็อกโปรเจกต์
| | |
|---|---|
| **หน้าที่** | ซิงก์ OP · เปิด/ปิด · กำหนดทีม · สแกนสุขภาพ |
| **หน้าลูก** | มุมมอง **การ์ด** / **ตาราง** · คลิกไป `/org/projects/:id` |

- [ ] ค้นหา · เรียง · กรองทีม/สถานะ
- [ ] การ์ด: Syncfusion Pager · **pageSize 12 แสดงไม่เกิน 12 การ์ด** (ไม่โชว์ทั้งชุด)
- [ ] ข้อความประมาณ `แสดง 12 จาก N`
- [ ] ตาราง: remote paging/sorting/search
- [ ] ซิงก์โปรเจกต์ · สลับ active · มัลติซีเลกต์ทีม
- [ ] ปุ่มแดชบอร์ด / ดูงาน

### 5.3 `/org/projects/:id` — รายละเอียดโปรเจกต์
แท็บ: **Overview · Tickets · Git & CI/CD · Teams**

- [ ] KPI สุขภาพโปรเจกต์
- [ ] สร้างใบจาก Unmatched Branch (1 คลิก)
- [ ] เปิด drawer ใบงาน

### 5.4 `/admin/rubrics` — เกณฑ์คะแนน
- [ ] แก้เกณฑ์ / บันทึกได้

### 5.5 `/admin/snapshot-check` — ตรวจก่อนล็อกคะแนน
- [ ] 4 Gates readiness
- [ ] พรีวิวก่อนแช่แข็ง

### 5.6 `/integrations` — เชื่อมต่อระบบ
- [ ] Discover fields / sync OP · GitLab
- [ ] Auto-SLA ตั้งค่า (ไม่ writeback ทับใบเดิมโดยไม่ตั้งใจ)

### 5.7 `/teams` — แจ้งเตือน Microsoft Teams
- [ ] ทดสอบ webhook / เทมเพลตข้อความ

### 5.8 `/quality/mockup` — โหมดจำลอง
- [ ] รันจำลองได้ · ไม่เขียน DB จริงตามคำเตือนบนหน้า

---

## 6. Redirect & เชิงลบ

- [ ] `/tickets` → `/quality/tickets`
- [ ] `/tickets/disputes` → `/quality/disputes`
- [ ] `/analytics` → `/quality/report`
- [ ] `/analytics/time-audit` → `/quality/time-audit`
- [ ] `/insights/mygit` หรือ `/git-inbox` → `/mygit`
- [ ] `/me/cockpit` → `/cockpit`
- [ ] `/queue` → `/work/queue`
- [ ] Member เปิด `/admin` หรือ `/integrations` → ถูกพาออก / กันสิทธิ์

---

## 7. ข้ามหน้า (ทุกสิทธิ์ที่เกี่ยวข้อง)

### Drawer ใบงาน 360°
- [ ] เปิดจาก List / Board / Queue / ค้นหา / แจ้งเตือน / Gantt / Schedule / Person WS
- [ ] มือถือเต็มจอ · เดสก์ท็อป ~560px ขวา

### Global Filter persistence
- [ ] ตั้งทีมบน `/cockpit` → ไป `/work/list` ยังกรองทีมเดิม
- [ ] ชิปสาย 6 รหัส + 「ทั้งหมด」
- [ ] ปุ่ม「เฉพาะฉัน」/「ล้าง」

---

## สรุปหน้าลูก (Hub map)

| Hub | Route ฐาน | แท็บ / หน้าลูก | ไว้ทำอะไร |
|---|---|---|---|
| งานของฉัน | `/me` | — | Landing ส่วนตัว |
| ภาพรวม | `/cockpit` | — | KPI + กราฟองค์กร/ตน |
| ทีม | `/team` | แดชบอร์ด · เวลา · ปฏิทิน | วิเคราะห์ทีม |
| งานทีม | `/work` | สรุป · ไทม์ไลน์ · งานรอจัด · บอร์ด · รายการ · คิว* · SLA* | วางแผนและจ่ายงาน |
| คะแนน | `/quality` | คะแนน · รายคน · เวลา · ทบทวน · AI · QA* · วิเคราะห์ทีม* · จำลอง* | คะแนนและคุณภาพ |
| คน | `/workspace/people` | WS รายคน 6 แท็บ | ดูงานรายบุคคล |
| โปรเจกต์ | `/admin/projects` → `/org/projects/:id` | Overview · Tickets · Git · Teams | สุขภาพโปรเจกต์และ Git |
| ตั้งค่า | `/admin` | rubrics · snapshot · integrations · teams | บริหารระบบ |

\* lead/admin

---

## จุดที่ควรปรับปรุง (ติดตามเอกสาร)

1. **คู่มือ TOC** — เคยอ้าง `/insights/*` และแท็บ `/me` 6 ชุด; route จริงคือ `/quality/*` และ `/me` ไม่มีแท็บย่อย
2. **โฟลเดอร์แคป** — คู่มือใช้ `manual-screenshots/` · สคริปต์เดิมเคยเขียน `manual_assets/` → รวมที่ `manual-screenshots/`
3. **หน้าเพิ่งมี / ต้องเน้นตรวจ** — `/admin/projects` การ์ด+pager, `/work/backlog`, `/quality/ols`, `/workspace/people`
4. **Wording UI** — ใช้「ภาพรวมงาน」「ขอทบทวนคะแนน」「ตรวจคุณภาพ QA」「งานรอจัด」ไม่ใช้ค็อกพิท/อุทธรณ์/DoD Gate บนหัวข้อ
5. **Capture headless** — ต้องมี session ล็อกอิน (Dev Quick) ไม่งั้นได้แค่หน้า login

---

## บันทึกผลการทดสอบ

| วันที่ | ผู้ทดสอบ | สิทธิ์หลัก | ผ่าน/ทั้งหมด | หมายเหตุ |
|---|---|---|---|---|
| | | | | |
