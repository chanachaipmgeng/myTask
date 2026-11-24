# บันทึกการเปลี่ยนแปลง (Changelog)

การเปลี่ยนแปลงทั้งหมดของโครงการ **myTask (Man-day Scorecard)** จะถูกบันทึกไว้ในเอกสารนี้ โดยอ้างอิงตามมาตรฐาน [Semantic Versioning](https://semver.org/).

---

## [v2.2.0] - 2026-11-24

### 🚀 ฟีเจอร์หลัก (Key Highlights)

#### 1. Single-Menu Unified Navigation & In-Place Role Scoping
- **รวมเมนูเป็นชุดเดียว (Eliminate `/me/*` duplication)**: ยุบโครงสร้างเมนูซ้ำซ้อนให้ทุกบทบาท (`member`, `lead`, `admin`) เข้าถึงชุดเมนูหลักในหมวด **« พื้นที่ทำงาน »** ชุดเดียวกัน:
  - วันนี้ (`/me`), แดชบอร์ด (`/cockpit`), งาน & ไทม์ไลน์ (`/work`), ปฏิทิน & ลา (`/schedule`), ใบงาน & DoD (`/quality`), OLS & พยากรณ์ (`/insights`)
- **Reactive Role Scoping**: หน้าต่างๆ ปรับมุมมองและคำนวณข้อมูลอัตโนมัติตามสิทธิ์ผ่าน Signal `computed(() => ... || effectiveRole() === 'member')` โดยไม่ต้องเปลี่ยน Route
- **Role Preview Switcher**: เพิ่มตัวสลับ `ดูในมุม Member` บน AppBar ให้ Lead/Admin พรีวิวมุมมองได้ทันทีแบบ In-place (URL เดิม)
- **Adaptive Global Filter Bar**:
  - สำหรับ Member: แสดงชิปสถานะ `มุมมองของฉัน` (ล็อกเฉพาะตนเอง)
  - สำหรับ Lead/Admin: แสดง Dropdown ค้นหา `ทีม`, `พนักงาน`, ปุ่ม toggle `เฉพาะฉัน` (`?person=<myId>`), และปุ่ม `ตัวกรองเพิ่ม`
  - ป้องกัน Infinite Trigger Loop ด้วย `untracked()` และ flag `writingUrl`
- **หมวดหมู่บริหาร & ตั้งค่า**: แยกหมวด **« บริหารทีม »** (`/workspace/people`, `/queue`) สำหรับ Lead/Admin และ **« โซนแอดมิน »** (`/admin`, `/admin/projects`, `/admin/rubrics`, `/admin/snapshot-check`, `/integrations`) สำหรับ Admin

#### 2. Dynamic Types, Filters & Live Avatar จาก myProject
- **Dynamic Ticket Types**: ดึงประเภทใบงาน (เช่น Bug, Task, Feature) สดจาก API v3 (`/api/v3/types`) พร้อมระบบ Lookup และแคช ไม่ฮาร์ดโค้ด
- **Live User Avatar**: ดึงรูปโปรไฟล์พนักงานโดยตรงจาก OpenProject ผ่าน `https://myprojectplus.myhr.co.th/api/v3/users/:id/avatar` พร้อมระบบ Sanitize อักษรย่อเมื่อไม่มีรูป
- **Searchable Filters**: เปิด `[allowFiltering]="true"` สำหรับตัวกรองทีม, โปรเจกต์, และประเภทใบงาน ให้พิมพ์ค้นหาได้ทันที

#### 3. Policy & SLA Dates Sync + Auto-SLA Working Days
- **Custom Field Schema Auto-Discovery**: ตรวจจับ Custom Fields อัตโนมัติจาก OpenProject schema (Receipt, Reply, Plan, CF Due, Alert, Policy)
- **Fallback Resolution Order**: ลำดับการคำนวณวันกำหนดส่งแรกเข้า `dueDate → cfDueDate → policyDate → planDate`
- **Auto-SLA Working Days**: คำนวณวันส่งมอบตามข้อตกลงระดับบริการ (SLA) โดยเว้นวันหยุดเสาร์-อาทิตย์ พร้อมติดป้าย `Auto`
- **Protection Rules**: ป้องกันการเขียนทับ `firstDueOn` และใช้ `replyDate` เป็น Fair Cutoff สำรองเมื่อไม่มี `readyForQaAt`

#### 4. MyHR Prism Multi-Accent 8-Hue Spectrum & Modern Glass UI
- **Brand Anchor**: คงสีหลัก Corporate Royal Blue (`#2746b3` → `#3154cc` → `#3b60dc`) ที่จุดยึดแบรนด์ (Sidebar, Background, Hero Band, Active Tab, Primary Button)
- **8-Hue Prism Spectrum**: สีประจำ 6 สายงาน (`IMP` Primary, `RND` Teal, `QA` Info, `UXBA` Violet, `SUP` Warning, `INFRA` Coral) และสถานะงาน
- **Soft-Tinted SaaS Pill Badges**: ป้ายสถานะโปร่งแสง 10 โทน ขอบ 1px สะอาดตา
- **Semantic Action Buttons**: ปุ่มแอ็กชันตามบริบท (`.e-primary`, `.e-success`, `.e-info`, `.e-btn-teal`, `.e-btn-violet`, `.e-warning`, `.e-danger`)
- **Prism Charts & Heatmap**: ชาร์ตแสดงผลตามธีม Light/Dark และ Heatmap 4 ช่วงสี

#### 5. Full-Stack Docker Suite & Production Hardening
- **Multi-Container Suite**:
  - `web` (พอร์ต 8080): Nginx SPA Server + Reverse Proxy `/api/`
  - `api` (พอร์ต 3000): NestJS Application พร้อม Native Node `fetch` Healthcheck
  - `db` (พอร์ต 5433): PostgreSQL 16 พร้อม Initial Migrations
  - `adminer` (พอร์ต 8088): เครื่องมือบริหารจัดการฐานข้อมูล
  - `db-backup`: โปรไฟล์สำรองฐานข้อมูลรายวันอัตโนมัติ

#### 6. Enterprise Project Detail & Git Governance Dashboard (`/org/projects/:id`)
- แดชบอร์ด 4 แท็บครบวงจร: Overview, Tickets, Multi-Repo Git & CI/CD, Teams/Members
- ตรวจจับ Unmatched Branches และปุ่ม 1-Click สร้างใบงาน myProject ผูกกลับอัตโนมัติ

---

## [v2.1.0] - 2026-11-24

### 🚀 ฟีเจอร์หลัก (Key Highlights)
- **Git Branch Smart Detection & 1-Click Ticket Create**: เชื่อมต่อ GitLab API ดึง MR, Reviewers, Approved-by และ Unmatched Branches
- **Team-Based Visibility Scoping & 2D Sharing Matrix**: จำกัดสิทธิ์การมองเห็นข้อมูลระหว่างแผนก 2 ชั้น (Backend + Frontend) พร้อมตารางเมทริกซ์ 2 มิติ
- **Project Catalog Management (`/admin/projects`)**: Smart Merge Sync ปลอดภัย ไม่ทับค่าสถานะและทีมที่ Admin กำหนดไว้เดิม
- **Right Ticket Detail Drawer 360°**: ลิ้นชักรายละเอียดใบงานแบบเปิดจากขวา พร้อมแท็บความสัมพันธ์และความคืบหน้า
- **Rebranding**: ปรับโฉมหน้า Login สู่แบรนด์ **myTask**
