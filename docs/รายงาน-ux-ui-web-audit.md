# รายงานตรวจ UX/UI ผ่านเว็บ — Man-day Scorecard

**วันที่ตรวจ:** 2026-11-24  
**สภาพแวดล้อม:** `http://127.0.0.1:4200` · ผู้ใช้ admin/lead  
**เครื่องมือ:** Playwright + Cursor browser · Desktop 1440×900 · Mobile 390×844  
**ธีม:** Dark และ Light (`md-theme` / `#sf-theme-link`)  
**เกณฑ์:** [ดีไซน์ซิสเต็ม.md](./ดีไซน์ซิสเต็ม.md) · checklist P21 ใน [คู่มือ.md](./คู่มือ.md) · กฎ shared UI / drawer ใน `.cursor/rules`

> รอบเก็บรายละเอียด (2026-11-24) · รอบแก้ findings ข้อ 1–3 ตามแผน Fix UX audit findings แล้ว · Cockpit คงเป็นข้อยกเว้น Bento

## สรุปภาพรวม

| สถานะ | จำนวนโดยประมาณ |
|---|---|
| ผ่านมาตรฐานหลัก | ส่วนใหญ่ของฮับ (drawer, Light sidebar gradient, search/pager, mobile unfreeze) |
| ควรแก้ (P2–P3) | 3–5 จุด |
| บล็อก (P0) | ไม่พบ |
| P1 | ไม่พบที่ยืนยันซ้ำได้ชัดในรอบนี้ |

**Verdict:** ใช้งานได้ครบฮับทั้ง Light/Dark และมือถือ · จุดที่ควรแก้หลักคือการตรึงคอลัมน์บน `/work/list` และการจัดเลย์เอาต์บางหน้าแอดมิน · Ticket detail drawer ทำงานตามแผน

## Findings (เรียงความรุนแรง)

| # | ความรุนแรง | หน้า | ธีม/Viewport | อาการ | หลักฐาน |
|---|---|---|---|---|---|
| 1 | **P2** | `/work/list`, `/me/work/list` | Desktop 1440 | ตารางหลักไม่ตรึงคอลัมน์ (`frozenColumns=0`) ทั้งที่มาตรฐานระบุ Desktop ตรึง 2 | Probe Syncfusion instance · `listGridOptions` ไม่ส่ง `autoFreezeDesktop` (ต่างจาก `/quality/tickets`, `/work/handoff`) |
| 2 | **P2** | `/admin/projects` | Desktop Dark (บางครั้ง) | มี horizontal overflow ~225px | Probe `scrollWidth - clientWidth` ครั้งแรก; รอบหลังที่ข้อมูลแคบลงได้ 0 — น่าจะเกิดเมื่อตารางกว้างเกินคอนเทนเนอร์ |
| 3 | **P3** | `/people` | Desktop | ตรึงได้แค่ 1 คอลัมน์ (`frozenColumns=1`) ไม่ถึง 2 ตาม `ViewportService` | Instance `people-board-grid` · ไม่ได้ตั้ง `autoFreezeDesktop: 2` ใน options |
| 4 | **P3** | `/cockpit`, `/me/cockpit` | ทั้งสองธีม | ไม่ใช้ `app-page-head` / `app-kpi-stat` (ใช้เลย์เอาต์ Bento/hero เอง) | DOM: `hasPageHead=false`, `app-kpi-stat=0`, มี charts 3 · อาจตั้งใจตาม P16 แต่ต่างจากมาตรฐานหน้าอื่น |
| 5 | **P3** | หลายหน้า | Desktop | `app-kpi-stat` ว่างในหลายหน้าแม้มีตัวเลขหัวข้อ (ใช้ hero strip / ข้อความใน page-head แทน) | Probe `/me`, `/work/summary` ฯลฯ ได้ `kpi=0` แต่ยังมี `app-section-card` |

### สิ่งที่ตรวจแล้วผ่าน

| หัวข้อ | ผล |
|---|---|
| สีแบรนด์ MyHR (`#2746b3` / gradient sidebar) | Light sidebar เป็น `linear-gradient(rgb(39,70,179) → rgb(59,96,220))` · ไม่พบ class lime/sage |
| ลิงก์ Sidebar Light | ส่วนใหญ่ `rgba(255,255,255,0.88)` บน gradient · Active pill ใช้ตัวอักษรน้ำเงินบนพื้นขาว (ถูกต้อง) |
| Ticket drawer ขวา | มี `#ticket-detail-drawer` ทุกหน้าหลัง login · กด「ดูสรุป」บนมือถือเปิดได้ กว้าง ~374px ในจอ 390 |
| Board → 360° | คลิกการ์ด + ปุ่มรายละเอียด เปิด drawer |
| `/schedule` คอลัมน์ขวา | มี `.schedule-layout__day` ทั้ง team/mine · ไม่ถูก drawer แทนแผงวัน |
| Grid Search / pageSizes | ตารางปฏิบัติการส่วนใหญ่มี Search+pager+pageSizes · `/quality/tickets` ไม่มี Search ใน toolbar (มีช่องค้นหาภายนอก — ตามกติกา) |
| Mobile unfreeze | ที่ 390px กริดที่สุ่มตรวจได้ `frozenColumns=0` |
| Disputes | มี `ejs-splitter` |
| Gantt / Kanban | `/work/timeline` มี Gantt · `/work/board` มี Kanban |
| Login | Desktop + Mobile แสดง Sign-in / SSO / Dev quick demo ได้ · ไม่มี overflow ชัด |

## เช็คลิสต์หน้า

สัญลักษณ์: OK = ตรวจแล้วไม่มี P0/P1 · WARN = มี P2/P3 · SKIP = ไม่ได้เปิดรอบนี้ (redirect/ซ้ำ)

### Auth / Shell
| พาธ | Desktop Dark | Desktop Light | Mobile | หมายเหตุ |
|---|---|---|---|---|
| `/login` | OK | OK | OK | Hero + form ครบ |
| Ticket drawer (shell) | OK | OK | OK | เปิดจาก List / Board 360 |
| AppBar theme toggle | OK | OK | — | สลับ `e-dark-mode` / stylesheet ได้ |

### ของฉัน
| พาธ | D | L | M | หมายเหตุ |
|---|---|---|---|---|
| `/me` | OK | OK | OK | กริด my-open/closed มี search/pager |
| `/me/cockpit` | WARN | WARN | OK | Bento ไม่ใช้ page-head/kpi-stat |
| `/me/work/list` | WARN | WARN | OK | ไม่ auto-freeze |
| `/me/schedule` | OK | — | — | มีคอลัมน์รายวัน |
| `/me/work/summary|timeline|backlog|board` | OK (สุ่ม) | — | board OK | Gantt/Kanban โหลดได้ |
| `/me/tickets` · `/me/analytics` | SKIP | SKIP | SKIP | ไม่เดินทุกรอบ (โครงสร้างเดียวกับ quality/insights) |

### ทีม / คน
| พาธ | D | L | M | หมายเหตุ |
|---|---|---|---|---|
| `/workspace/people` | OK | OK | OK | การ์ดไดเรกทอรี |
| `/people` | WARN | WARN | — | freeze=1 |
| `/org/teams` | OK | — | — | การ์ดทีม |
| `/team` | OK | — | — | กราฟหลายชุด |
| `/cockpit` | WARN | WARN | OK | เหมือน me/cockpit |

### งาน / คิว
| พาธ | D | L | M | หมายเหตุ |
|---|---|---|---|---|
| `/work/summary` | OK | — | — | charts |
| `/work/timeline` | OK | OK | — | Gantt |
| `/work/board` | OK | OK | OK | 360° → drawer |
| `/work/list` | WARN | WARN | OK | ไม่ auto-freeze · drawer มือถือ OK |
| `/work/handoff` | OK | — | — | freeze=2 ตามที่ตั้ง |
| `/work/team-time` | SKIP | SKIP | SKIP | ไม่เดินรอบนี้ |
| `/schedule` | OK | OK | OK | คอลัมน์ขวาครบ |
| `/queue` | OK | OK | OK | freeze capacity=1 |

### คุณภาพ / วิเคราะห์ / แอดมิน
| พาธ | D | L | M | หมายเหตุ |
|---|---|---|---|---|
| `/quality/audit` | OK | — | — | grid DoD |
| `/quality/tickets` | OK | OK* | OK | freeze=2 · search นอกตาราง · *Light รอบเร็วอาจยังไม่ hydrate |
| `/quality/disputes` | OK | OK | OK | splitter |
| `/quality/time-audit` | SKIP | SKIP | SKIP | — |
| `/insights/report` | OK | OK | — | |
| `/insights/ai` | OK | — | — | |
| `/insights/mygit` | SKIP | SKIP | SKIP | — |
| `/admin` | OK | OK | OK | roster + audit grids |
| `/admin/snapshot-check` | OK | — | — | มี `app-kpi-stat` ×4 |
| `/admin/rubrics` | SKIP | SKIP | SKIP | — |
| `/admin/projects` | WARN | OK | OK | overflow เป็นครั้งคราว |
| `/integrations` | OK | OK | — | |

## แนะนำแก้ และการติดตาม

1. **`/work/list` + `/me/work/list`:** ~~ใส่ `autoFreezeDesktop: 2`~~ **แก้แล้ว** (`work-list.ts`)
2. **`/people`:** ~~ตั้ง `autoFreezeDesktop: 2`~~ **แก้แล้ว** (`people-board.ts`)
3. **`/admin/projects`:** ~~กัน overflow + แก้ `listGridOptions` ที่กระจายฟังก์ชันผิด~~ **แก้แล้ว** (`admin-projects.ts` / `.html` / `.scss`)
4. **Cockpit Bento:** **ยกเว้นโดยตั้งใจ (P16)** — `/cockpit` และ `/me/cockpit` ใช้เลย์เอาต์ Bento / hero ของตัวเอง ไม่บังคับ `app-page-head` / `app-kpi-stat` แบบหน้าอื่น
5. **Smoke ต่อ (ยังไม่ทำ):** `/quality/time-audit`, `/insights/mygit`, `/admin/rubrics`, `/work/team-time`, แจ้งเตือน AppBar → ปุ่ม「ดูรายละเอียด」ใน dialog

## วิธีทำซ้ำสั้นๆ

```text
Desktop 1440×900 → Dark เดินฮับ → สลับ Light ซ้ำจุดกริด/ชาร์ต
Mobile 390×844 → /work/list กดดูสรุป ตรวจ drawer · กริดต้อง frozen=0
ตรวจ instance: document.querySelector('ejs-grid').ej2_instances[0].frozenColumns
```
