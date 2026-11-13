# Agents — Man-day Scorecard

คำแนะนำสั้นสำหรับ AI/มนุษย์ที่ทำงานในรีโปนี้

## อ่านก่อน

1. [docs/ระบบ.md](docs/ระบบ.md) — สถาปัตยกรรมและโมดูล  
2. [docs/แผนงาน.md](docs/แผนงาน.md) — สิ่งที่ควรทำต่อ  
3. [docs/คู่มือ.md](docs/คู่มือ.md) — ติดตั้ง รัน sync แก้ปัญหา  

## Rules / Skills ในโปรเจกต์

| ชนิด | พาธ |
|---|---|
| Rules | `.cursor/rules/*.mdc` |
| Skills | `.cursor/skills/*/SKILL.md` |

Skills สำคัญ: `scorecard-verify`, `openproject-fields`, `work-hub`

## คำสั่งตรวจขั้นต่ำ

```powershell
npm run verify
npm --prefix server run test
```

## อย่าทำ

- อย่าแก้สูตรคะแนนโดยไม่ verify  
- อย่า commit `.env`, `.agents/`, `.claude/`  
- อย่าเปิด OpenProject writeback เป็นค่าเริ่ม  
