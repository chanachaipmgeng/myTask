import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const htmlContent = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <title>คู่มือการใช้งานระบบ Man-day Scorecard ฉบับสมบูรณ์ (26 หน้าจอ)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Sarabun:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4;
      margin: 12mm 14mm 14mm 14mm;
      @bottom-right {
        content: counter(page);
        font-family: 'Sarabun', Tahoma, sans-serif;
        font-size: 9pt;
        color: #64748b;
      }
      @bottom-left {
        content: "Man-day Scorecard — คู่มือการใช้งานระบบฉบับสมบูรณ์ (v2026.4)";
        font-family: 'Sarabun', Tahoma, sans-serif;
        font-size: 8pt;
        color: #94a3b8;
      }
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: 'Sarabun', "Leelawadee UI", Tahoma, sans-serif;
      font-size: 10pt;
      line-height: 1.5;
      color: #1e293b;
      background: #ffffff;
      margin: 0;
      padding: 0;
    }

    /* Cover Page */
    .cover-page {
      height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 40px 30px;
      page-break-after: always;
      background: linear-gradient(135deg, #0b1120 0%, #0f172a 60%, #1e293b 100%);
      color: #ffffff;
      border-radius: 12px;
    }

    .cover-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .brand-badge {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 8px 16px;
      background: rgba(14, 165, 233, 0.15);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 999px;
      font-size: 11pt;
      font-weight: 700;
      color: #38bdf8;
      letter-spacing: 0.05em;
    }

    .brand-mark-logo {
      display: inline-grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: linear-gradient(135deg, #2e4fc8, #4c68e5);
      color: #ffffff;
      font-weight: 800;
      font-size: 11pt;
    }

    .cover-center {
      margin: 40px 0;
    }

    .cover-eyebrow {
      color: #5f7ce3;
      font-size: 13pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 8px;
    }

    .cover-title {
      font-size: 27pt;
      font-weight: 800;
      line-height: 1.25;
      margin: 0 0 16px;
      background: linear-gradient(to right, #ffffff, #cbd5e1);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .cover-subtitle {
      font-size: 11pt;
      line-height: 1.6;
      color: #94a3b8;
      max-width: 680px;
      margin-bottom: 24px;
    }

    .cover-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .cover-tag {
      padding: 5px 12px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 6px;
      font-size: 8.5pt;
      color: #e2e8f0;
      font-weight: 500;
    }

    .cover-bottom {
      display: flex;
      justify-content: space-between;
      border-top: 1px solid rgba(255, 255, 255, 0.12);
      padding-top: 16px;
      font-size: 9pt;
      color: #64748b;
    }

    /* Common Typography & Breaks */
    .page-break {
      page-break-before: always;
    }

    .section-header {
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }

    .section-title-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .section-num {
      display: inline-grid;
      place-items: center;
      width: 28px;
      height: 28px;
      background: #2e4fc8;
      color: #ffffff;
      font-weight: 700;
      font-size: 11pt;
      border-radius: 6px;
    }

    h2 {
      margin: 0;
      font-size: 13pt;
      font-weight: 700;
      color: #0f172a;
    }

    .section-meta {
      font-size: 8.5pt;
      color: #64748b;
    }

    .role-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 8pt;
      font-weight: 600;
      background: #e0f2fe;
      color: #0369a1;
      border: 1px solid #bae6fd;
    }

    .role-badge.admin {
      background: #fef2f2;
      color: #b91c1c;
      border-color: #fecaca;
    }

    .role-badge.member {
      background: #f0fdf4;
      color: #15803d;
      border-color: #bbf7d0;
    }

    /* Screenshot Display */
    .img-container {
      margin: 10px 0 14px;
      border-radius: 8px;
      border: 1px solid #cbd5e1;
      overflow: hidden;
      box-shadow: 0 4px 14px -3px rgba(15, 23, 42, 0.12);
      background: #0b1120;
      page-break-inside: avoid;
    }

    .img-container img {
      display: block;
      width: 100%;
      height: auto;
    }

    .img-caption {
      padding: 5px 12px;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      font-size: 8pt;
      color: #64748b;
      font-style: italic;
    }

    /* Content Blocks */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 12px;
      page-break-inside: avoid;
    }

    .info-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 9px 12px;
    }

    .info-card h4 {
      margin: 0 0 6px;
      font-size: 9.5pt;
      font-weight: 700;
      color: #0369a1;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    ul, ol {
      margin: 0;
      padding-left: 18px;
    }

    li {
      margin-bottom: 4px;
      font-size: 8.5pt;
      line-height: 1.45;
    }

    .callout {
      padding: 7px 12px;
      border-radius: 6px;
      margin: 8px 0;
      font-size: 8.5pt;
      page-break-inside: avoid;
    }

    .callout.tip {
      background: #f0fdf4;
      border-left: 3px solid #22c55e;
      color: #14532d;
    }

    .callout.warn {
      background: #fffbeb;
      border-left: 3px solid #f59e0b;
      color: #78350f;
    }

    .callout.info {
      background: #eef2fd;
      border-left: 3px solid #2e4fc8;
      color: #162b70;
    }

    /* Table of contents */
    .toc-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-top: 12px;
    }

    .toc-item {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 3px 0;
      border-bottom: 1px dotted #cbd5e1;
      font-size: 8.5pt;
    }

    .toc-title {
      font-weight: 600;
      color: #1e293b;
    }

    .toc-url {
      color: #64748b;
      font-family: monospace;
      font-size: 8pt;
    }

    table.data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8pt;
      margin: 8px 0;
    }

    table.data-table th, table.data-table td {
      border: 1px solid #cbd5e1;
      padding: 4px 8px;
      text-align: left;
    }

    table.data-table th {
      background: #f1f5f9;
      font-weight: 700;
      color: #334155;
    }

    table.data-table tr:nth-child(even) {
      background: #f8fafc;
    }
  </style>
</head>
<body>

  <!-- ==================== COVER PAGE ==================== -->
  <div class="cover-page">
    <div class="cover-top">
      <div class="brand-badge">
        <span class="brand-mark-logo">MD</span>
        <span>CENTRAL SYNC &amp; SCORECARD v2026.4</span>
      </div>
      <div style="font-size: 10pt; color: #94a3b8; font-weight: 600;">
        ฉบับสมบูรณ์ · 26 หน้าจอครอบคลุม Enterprise
      </div>
    </div>

    <div class="cover-center">
      <div class="cover-eyebrow">Enterprise Operational Manual</div>
      <h1 class="cover-title">คู่มือการใช้งานระบบ<br>Man-day Scorecard</h1>
      <p class="cover-subtitle">
        คู่มือภาพประกอบทุกหน้าจอฉบับสมบูรณ์ (26 หน้าจอ) ครอบคลุมการคำนวณคะแนน Man-day,
        โฟลว์รับมืองานสั่งตรงจาก MD (MD Mandate &amp; Auto-Shift), กรอบความแม่นยำตามขนาดงาน (Tiered Tolerance),
        ฮับบริหารงานกลาง, กระดานคัมบัง, ไทม์ไลน์ Gantt, ตรวจสอบการส่งต่อข้ามทีม (SLA Handoff),
        ตรวจสอบคุณภาพ QA (DoD Gates), ตรวจสอบเวลา 3 ทาง (3-Way Time Audit), ศูนย์ยื่นอุทธรณ์คะแนน,
        การแช่แข็งคะแนน Snapshot ก่อนปิดงวด, ระบบเกณฑ์ประเมินไดนามิก (Rubric Registry),
        เส้นแนวโน้มสถิติ OLS Regression, และที่ปรึกษาการโค้ชรายบุคคล (AI Coach 1-on-1 Dialogue)
      </p>
      <div class="cover-tags">
        <span class="cover-tag">26 หน้าจอครบวงจร (v2026.4)</span>
        <span class="cover-tag">โฟลว์งานสั่งตรงจาก MD (MD-DIRECT)</span>
        <span class="cover-tag">Tiered Tolerance (XS/S/M/L/XL)</span>
        <span class="cover-tag">Dynamic Rubric Registry</span>
        <span class="cover-tag">AI Coach 1-on-1 Dialogue</span>
        <span class="cover-tag">OLS Regression Trendline</span>
        <span class="cover-tag">GitLab Approvals &amp; Peer Review Quota</span>
        <span class="cover-tag">โหมดสว่าง &amp; โหมดมืด (Zero-Reload)</span>
        <span class="cover-tag">ระบบสิทธิ์ 3 ระดับ (Admin / Lead / Member)</span>
        <span class="cover-tag">Python Analytics Hub &amp; Anomaly Radar</span>
      </div>
    </div>

    <div class="cover-bottom">
      <div><strong>ทีมพัฒนาระบบ:</strong> Man-day Scorecard Core Team</div>
      <div><strong>แพลตฟอร์ม:</strong> Angular 22.2.6 · NestJS · PostgreSQL · Syncfusion · Gemini 2.5</div>
      <div><strong>วันที่ปรับปรุง:</strong> พฤศจิกายน 2568</div>
    </div>
  </div>

  <!-- ==================== TABLE OF CONTENTS ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <h2>สารบัญคู่มือการใช้งาน (Table of Contents — 26 หน้าจอ)</h2>
    <span class="section-meta">Man-day Scorecard v2026.4 Architecture</span>
  </div>

  <p style="font-size: 8.5pt; color: #64748b; margin-bottom: 10px;">
    ระบบแบ่งออกเป็น 4 หมวดหมู่หลัก ครอบคลุมมุมมองผู้บริหาร, การบริหารงานและคิวงานด่วน MD, การวิเคราะห์คะแนนและความคลาดเคลื่อน, และการกำกับดูแลคุณภาพระดับองค์กร:
  </p>

  <div class="toc-grid">
    <div>
      <h3 style="font-size: 9.5pt; color: #2e4fc8; margin: 6px 0 3px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">หมวดที่ 1: การเข้าใช้งานและแดชบอร์ดหลัก</h3>
      <div class="toc-item"><span class="toc-title">1. เข้าสู่ระบบ &amp; สลับสิทธิ์พนักงาน</span><span class="toc-url">/login</span></div>
      <div class="toc-item"><span class="toc-title">2. แดชบอร์ดทีม &amp; กราฟ MD Mandate</span><span class="toc-url">/team</span></div>
      <div class="toc-item"><span class="toc-title">3. พอร์ทัลพื้นที่ส่วนตัวของพนักงาน</span><span class="toc-url">/me</span></div>
      <div class="toc-item"><span class="toc-title">4. สรุปสถานะงาน &amp; สัดส่วน MD Share</span><span class="toc-url">/work/summary</span></div>
      <div class="toc-item"><span class="toc-title">5. ไทม์ไลน์งาน &amp; โครงสร้างแม่ลูก (Gantt)</span><span class="toc-url">/work/timeline</span></div>
      <div class="toc-item"><span class="toc-title">6. คลังงานรอวางแผน (Backlog)</span><span class="toc-url">/work/backlog</span></div>

      <h3 style="font-size: 9.5pt; color: #2e4fc8; margin: 12px 0 3px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">หมวดที่ 2: ฮับบริหารงานและคิวงานด่วน MD</h3>
      <div class="toc-item"><span class="toc-title">7. กระดานคัมบัง &amp; Auto-Shift WIP</span><span class="toc-url">/work/board</span></div>
      <div class="toc-item"><span class="toc-title">8. รายการงานทั้งหมดแบบตารางตรึง</span><span class="toc-url">/work/list</span></div>
      <div class="toc-item"><span class="toc-title">9. ตารางคะแนนใบงาน &amp; Tiered Tolerance</span><span class="toc-url">/tickets</span></div>
      <div class="toc-item"><span class="toc-title">10. กระดานคะแนนพนักงานทั้งทีม</span><span class="toc-url">/people</span></div>
      <div class="toc-item"><span class="toc-title">11. แดชบอร์ดรายคน OLS &amp; AI Coach</span><span class="toc-url">/people/:id</span></div>
      <div class="toc-item"><span class="toc-title">12. ปฏิทินและไทม์ไลน์งานทีม (Schedule)</span><span class="toc-url">/schedule</span></div>
    </div>

    <div>
      <h3 style="font-size: 9.5pt; color: #2e4fc8; margin: 6px 0 3px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">หมวดที่ 3: ระบบวิจัย AI และการวิเคราะห์อัจฉริยะ</h3>
      <div class="toc-item"><span class="toc-title">13. ติดตามงานวิจัย AI &amp; Spike</span><span class="toc-url">/ai</span></div>
      <div class="toc-item"><span class="toc-title">14. ศูนย์วิเคราะห์อัจฉริยะ (Analytics Hub)</span><span class="toc-url">/analytics</span></div>
      <div class="toc-item"><span class="toc-title">15. การเชื่อมต่อ OpenProject, GitLab, Teams</span><span class="toc-url">/integrations</span></div>
      <div class="toc-item"><span class="toc-title">16. จัดการสิทธิ์ เกณฑ์คะแนน &amp; Audit Log</span><span class="toc-url">/admin</span></div>
      <div class="toc-item"><span class="toc-title">17. ดีไซน์ซิสเต็มและโทเคนสี MyHR Plus</span><span class="toc-url">/mockup</span></div>
      <div class="toc-item"><span class="toc-title">18. แถบเครื่องมือ หน้าต่างแจ้งเตือน &amp; Mini-Sidebar</span><span class="toc-url">Shell Controls</span></div>
      <div class="toc-item"><span class="toc-title">19. การสลับโหมดสว่างและโหมดมืด</span><span class="toc-url">Theme Toggle</span></div>

      <h3 style="font-size: 9.5pt; color: #2e4fc8; margin: 12px 0 3px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">หมวดที่ 4: การกำกับดูแลคุณภาพระดับองค์กร (v2026.4)</h3>
      <div class="toc-item"><span class="toc-title">20. คิวงานใหม่ &amp; จ่ายงานด่วน MD</span><span class="toc-url">/queue</span></div>
      <div class="toc-item"><span class="toc-title">21. ศูนย์ตรวจสอบการส่งต่อข้ามทีม &amp; SLA</span><span class="toc-url">/work/handoff</span></div>
      <div class="toc-item"><span class="toc-title">22. ศูนย์ตรวจสอบคุณภาพ QA &amp; หลุด Prod</span><span class="toc-url">/quality/audit</span></div>
      <div class="toc-item"><span class="toc-title">23. ตรวจสอบความคลาดเคลื่อนเวลา 3 ทาง</span><span class="toc-url">/analytics/time-audit</span></div>
      <div class="toc-item"><span class="toc-title">24. ระบบยื่นอุทธรณ์ &amp; ปรับปรุงคะแนน</span><span class="toc-url">/tickets/disputes</span></div>
      <div class="toc-item"><span class="toc-title">25. ห้องตรวจสอบความพร้อมก่อนปิดงวด</span><span class="toc-url">/admin/snapshot-check</span></div>
      <div class="toc-item"><span class="toc-title">26. ระบบเกณฑ์ประเมินไดนามิก (Rubric Registry)</span><span class="toc-url">/admin/rubrics</span></div>
    </div>
  </div>

  <div class="callout info" style="margin-top: 14px;">
    <strong>กติกาหลักของระบบ:</strong> 1 Man-day (MD) = 6 ชั่วโมงทำงานมาตรฐาน · วัดผล 6 สายงาน (RND, IMP, QA, UXBA, SUP, INFRA) · <strong>Fair Cutoff Rule:</strong> วัดเวลา On-Time ของ Dev เมื่อเข้า Ready for QA โดยไม่คิดเวลาค้างรอคิว QA · <strong>Tiered Tolerance:</strong> กรอบความแม่นยำยืดหยุ่นตามขนาดงาน XS/S, M, L/XL · <strong>MD Mandate Protection:</strong> งานสั่งตรงจาก MD ช่วยพักงานเดิม เลื่อนวันส่งเว้นวันหยุด และการันตีคะแนนไม่ให้เสียเปรียบ
  </div>

  <!-- ==================== 1. LOGIN ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <div class="section-title-wrap">
      <span class="section-num">1</span>
      <h2>หน้าเข้าสู่ระบบและสลับสิทธิ์การทำงาน (Login &amp; Role Switcher)</h2>
    </div>
    <div class="section-meta">
      <span class="role-badge">ทุกคนเข้าถึงได้</span> · <code>/login</code>
    </div>
  </div>

  <div class="img-container">
    <img src="manual_assets/01_login.png" alt="Login & Role Switcher Screen">
    <div class="img-caption">ภาพที่ 1: หน้าจอ Login พร้อมปุ่ม Single Sign-On (GitLab OAuth) และแผงสลับบัญชีผู้ใช้งานทั้ง 15 คน แยกตามบทบาท</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>🎯 ฟังก์ชันการเข้าสู่ระบบ</h4>
      <ul>
        <li><strong>GitLab OAuth SSO:</strong> เข้าสู่ระบบด้วยบัญชี GitLab องค์กร ปลอดภัยและตรงตามมาตรฐาน Identity Provider</li>
        <li><strong>Persona Switcher:</strong> เครื่องมือจำลองบัญชีพนักงานทั้ง 15 คน สำหรับการทดสอบและบริหารงานจริง</li>
        <li><strong>สิทธิ์ 3 ระดับ:</strong> แยกสีชัดเจนระหว่าง <code>admin</code> (สีแดง), <code>lead</code> (สีน้ำเงิน), และ <code>member</code> (สีเขียว)</li>
      </ul>
    </div>
    <div class="info-card">
      <h4>💡 ผลกระทบต่อระบบเมื่อสลับบัญชี</h4>
      <ul>
        <li>เมนูในแถบด้านข้าง (Sidebar) จะถูกกรองตามสิทธิ์ของผู้ใช้งานคนนั้นโดยอัตโนมัติ</li>
        <li>ระบบจะโหลดข้อมูลโปรไฟล์ คะแนนโควตาส่วนบุคคล และงานที่ได้รับมอบหมายขึ้นมาทันที</li>
        <li>หน้าจอที่ต้องการสิทธิ์ระดับสูง เช่น <code>/admin</code> หรือ <code>/integrations</code> จะถูกซ่อนและป้องกัน</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 2. TEAM DASHBOARD ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <div class="section-title-wrap">
      <span class="section-num">2</span>
      <h2>แดชบอร์ดทีมและดัชนีชี้วัดภาพรวม (Team Dashboard &amp; MD Mandate Share)</h2>
    </div>
    <div class="section-meta">
      <span class="role-badge">ทุกคนอ่านได้ / จับภาพ: Lead &amp; Admin</span> · <code>/team</code>
    </div>
  </div>

  <div class="img-container">
    <img src="manual_assets/02_team_dashboard.png" alt="Team Dashboard Screen">
    <div class="img-caption">ภาพที่ 2: แดชบอร์ดทีม แสดงดัชนีชี้วัดภาพรวม สัดส่วนงานรายประเภท และกราฟแท่งซ้อน Planned vs Unplanned vs MD Mandate</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>🎯 ตัวชี้วัดหลักและกราฟภาพรวม</h4>
      <ul>
        <li><strong>KPI Summary Cards:</strong> แสดงดัชนีรวมของทีม, ความแม่นยำในการส่งมอบ (On-time Delivery %), คะแนนตามเกณฑ์ DoD, และสัดส่วนงานแทรก</li>
        <li><strong>สัดส่วนภาระงาน 2568:</strong> กราฟโดนัทจำแนกประเภทงานจริงเปรียบเทียบระหว่าง Feature, Customization, และ Maintenance</li>
        <li><strong>⚡ สัดส่วนงานสั่งตรงจาก MD (StackingColumn):</strong> แสดงเปรียบเทียบ Planned MD vs Unplanned ทั่วไป vs งานสั่งตรงจาก MD (MD Mandate) แยกรายเดือน เพื่อให้ผู้บริหารเห็นผลกระทบของงานแทรกชัดเจน</li>
      </ul>
    </div>
    <div class="info-card">
      <h4>📈 กราฟแนวโน้มและการวิเคราะห์โควตา</h4>
      <ul>
        <li><strong>เส้นรายเดือน (Monthly Trends):</strong> แสดงความแม่นยำ, การส่งตามแผน, และอัตรา Rework ย้อนหลัง เทียบกับเส้นเป้าหมาย 75%</li>
        <li><strong>โควตาที่ใช้กับที่ว่าง:</strong> กราฟแท่งแสดงภาระงานปัจจุบัน (Used MD) เทียบกับโควตาว่าง (Free MD) ของพนักงานแต่ละคน</li>
        <li><strong>ตัวเลือก Snapshot ย้อนหลัง:</strong> เลือกดูสถิติรายเดือนหรือรายไตรมาสที่ถูกแช่แข็งไว้ได้โดยข้อมูลไม่เปลี่ยนตามการซิงก์ใหม่</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 3. MY WORKSPACE ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <div class="section-title-wrap">
      <span class="section-num">3</span>
      <h2>พอร์ทัลพื้นที่ส่วนตัวของพนักงาน (My Workspace &amp; Self-Coaching)</h2>
    </div>
    <div class="section-meta">
      <span class="role-badge member">มุมมองพนักงานทุกคน</span> · <code>/me</code>
    </div>
  </div>

  <div class="img-container">
    <img src="manual_assets/03_my_workspace.png" alt="My Workspace Screen">
    <div class="img-caption">ภาพที่ 3: หน้าจอ My Workspace พอร์ทัลส่วนตัวสำหรับพนักงานติดตามงานตนเอง ดัชนีพัฒนาการ และเช็คลิสต์ก่อนส่งมอบ</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>🎯 ส่วนแสดงผลสำหรับผู้ปฏิบัติงาน</h4>
      <ul>
        <li><strong>ดัชนีพัฒนาการส่วนบุคคล (Self Index):</strong> แถบความคืบหน้าแสดงคะแนนดัชนีของตนเองเทียบกับเป้าหมาย 75%</li>
        <li><strong>เส้นพัฒนาการย้อนหลัง:</strong> กราฟเส้นแสดงผลงานรายเดือนของตนเอง เพื่อให้เห็นทิศทางการเติบโต</li>
        <li><strong>รายการงานที่กำลังทำ (Active Tasks):</strong> ตารางแสดงงานที่ตนเองกำลังรับผิดชอบ วันกำหนดส่ง และสถานะคัมบัง พร้อมป้ายเตือนงานที่ถูกพัก [PAUSED]</li>
      </ul>
    </div>
    <div class="info-card">
      <h4>💡 เครื่องมือส่งเสริมการทำงาน (Self-Coaching)</h4>
      <ul>
        <li><strong>เช็คลิสต์ก่อนขอรีวิวโค้ด:</strong> ตรวจสอบว่ามี Unit Test ครบถ้วน, แนบลิงก์ MR แล้ว, และทดสอบบน Staging เรียบร้อย</li>
        <li><strong>ปุ่มลัดนำทางด่วน:</strong> กดเปิดกระดานคัมบัง, ตรวจสอบการซิงก์ GitLab MR, หรือสลับโปรไฟล์ได้ทันที</li>
        <li>ช่วยให้พนักงานสามารถกำกับดูแลตนเอง (Self-Driven) ได้โดยไม่ต้องรอหัวหน้างานสั่ง</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 4. WORK SUMMARY ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <div class="section-title-wrap">
      <span class="section-num">4</span>
      <h2>ฮับบริหารงาน - สรุปสถานะและสัดส่วนงาน (Work Summary &amp; MD Share)</h2>
    </div>
    <div class="section-meta">
      <span class="role-badge">ทุกคนเข้าถึงได้</span> · <code>/work/summary</code>
    </div>
  </div>

  <div class="img-container">
    <img src="manual_assets/04_work_summary.png" alt="Work Summary Screen">
    <div class="img-caption">ภาพที่ 4: หน้าสรุปสถานะงานในมือ การกระจายตัวตามประเภทงาน และแถบสรุปงานสั่งตรงจาก MD (MD Mandate Share %)</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>🎯 การจำแนกสถานะและภาระงาน</h4>
      <ul>
        <li><strong>สถานะงานในมือ (Active Work Breakdown):</strong> กราฟโดนัทแสดงสัดส่วนงานในแต่ละสถานะ (Backlog, In Progress, Code Review, In QA, Done)</li>
        <li><strong>การกระจายตัวตามประเภท:</strong> จำแนกระหว่างงาน Feature ใหม่, การแก้ไข Bug, งาน Refactor, และงานวิจัย R&D</li>
        <li><strong>⚡ แถบสรุปงานสั่งตรงจาก MD:</strong> แสดงจำนวนใบงาน, ผลรวมชั่วโมง MD ทั้งหมด, และคิดเป็นสัดส่วนกี่เปอร์เซ็นต์ของงานทั้งระบบ</li>
      </ul>
    </div>
    <div class="info-card">
      <h4>💡 การวิเคราะห์ประสิทธิภาพทีม</h4>
      <ul>
        <li>ให้ภาพรวมอย่างรวดเร็วว่างานส่วนใหญ่กำลังค้างอยู่ที่ขั้นตอนใด</li>
        <li>ตรวจจับคอขวด เช่น หากมีงานค้างในช่อง Code Review หรือ In QA ปริมาณมาก แสดงว่าต้องการคนช่วยตรวจรีวิวหรือทดสอบเพิ่ม</li>
        <li>ช่วยให้หัวหน้าทีมสื่อสารกับผู้บริหารได้ด้วยข้อมูลเชิงประจักษ์ว่าทีมมี Capacity เหลือสำหรับรับงานใหม่หรือไม่</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 5. WORK TIMELINE ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <div class="section-title-wrap">
      <span class="section-num">5</span>
      <h2>ฮับบริหารงาน - ไทม์ไลน์และโครงสร้างงานแม่ลูก (Work Timeline &amp; Gantt)</h2>
    </div>
    <div class="section-meta">
      <span class="role-badge">ทุกคนอ่านได้ / ปรับแผน: Lead &amp; Admin</span> · <code>/work/timeline</code>
    </div>
  </div>

  <div class="img-container">
    <img src="manual_assets/05_work_timeline.png" alt="Work Timeline Gantt Screen">
    <div class="img-caption">ภาพที่ 5: แผนภูมิแกนต์ (Gantt Chart) แสดงโครงสร้างงานแบบลำดับชั้นแม่ลูก พร้อมแถบควบคุมการย่อขยายและการค้นหา</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>🎯 โครงสร้างงานแบบลำดับชั้น (Parent/Child Hierarchy)</h4>
      <ul>
        <li><strong>การจัดกลุ่มแบบต้นไม้:</strong> รองรับการแสดงผล Epic &rarr; Feature &rarr; Task ตามความสัมพันธ์จริงจาก OpenProject</li>
        <li><strong>เครื่องมือบน Toolbar:</strong> ปุ่มกางออกทั้งหมด (Expand All), ยุบทั้งหมด (Collapse All), ซูมเข้าออก (Zoom In/Out) เพื่อดูระดับวัน สัปดาห์ หรือเดือน</li>
        <li><strong>ช่องค้นหาแบบ Real-time:</strong> พิมพ์ค้นหาตามรหัสใบงานหรือชื่อชิ้นงานเพื่อกระโดดไปยังแถบแกนต์ทันที</li>
      </ul>
    </div>
    <div class="info-card">
      <h4>💡 การแก้ไขกำหนดการและการป้องกัน FirstDueOn</h4>
      <ul>
        <li><strong>การลากปรับวันที่ (Drag-and-Drop):</strong> ผู้ใช้ระดับ Admin และ Lead สามารถลากปรับวันเริ่มงานและวันส่งมอบบนเส้นแกนต์ได้</li>
        <li><strong>FirstDueOn Protection:</strong> การแก้วันส่งมอบบน Timeline จะบันทึกเป็น <code>dueDate</code> แต่จะไม่เขียนทับ <code>firstDueOn</code> (เว้นแต่เป็นคำสั่ง Auto-Shift จาก MD) เพื่อคงความเที่ยงตรงในการวัดคะแนน On-time</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 6. WORK BACKLOG ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <div class="section-title-wrap">
      <span class="section-num">6</span>
      <h2>ฮับบริหารงาน - คลังงานและประเมินขนาด (Work Backlog &amp; Sizing)</h2>
    </div>
    <div class="section-meta">
      <span class="role-badge">ทุกคนอ่านได้ / วางแผน: Lead &amp; Admin</span> · <code>/work/backlog</code>
    </div>
  </div>

  <div class="img-container">
    <img src="manual_assets/06_work_backlog.png" alt="Work Backlog Screen">
    <div class="img-caption">ภาพที่ 6: คลังงานที่รอวางแผน (Backlog) แสดงรายการงานใหม่ที่ยังไม่ได้เริ่ม พร้อมขนาดประมาณการ (T-Shirt Size)</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>🎯 การประเมินขนาดงาน (T-Shirt Size to MD)</h4>
      <ul>
        <li><strong>XS (0.25 MD / 1.5 ชม.):</strong> งานแก้ไขข้อความ ปรับสี หรือแก้บั๊กเล็กน้อย</li>
        <li><strong>S (0.5 MD / 3.0 ชม.):</strong> งานปรับปรุง UI เล็กน้อย หรือเขียนสคริปต์สั้นๆ</li>
        <li><strong>M (1.0 MD / 6.0 ชม.):</strong> พัฒนาฟังก์ชันขนาดมาตรฐาน 1 วันทำงาน</li>
        <li><strong>L (2.0 MD / 12.0 ชม.):</strong> ฟังก์ชันที่มีความซับซ้อนปานกลาง มีการต่อ API</li>
        <li><strong>XL (3.0+ MD / 18+ ชม.):</strong> ฟังก์ชันใหญ่ที่ควรพิจารณาแตกเป็นข้อย่อย</li>
      </ul>
    </div>
    <div class="info-card">
      <h4>💡 การดึงงานเข้าแผน (Sprint Planning)</h4>
      <ul>
        <li>สามารถกรองดูตามสายงาน Implement, R&D, QA, UXBA, หรือ Infra</li>
        <li>ตรวจสอบว่าใบงานมีเกณฑ์การรับมอบ (Acceptance Criteria) และกำหนดคะแนน Story Points เรียบร้อยหรือไม่</li>
        <li>เมื่อมอบหมายคนรับผิดชอบและระบุวันเริ่มงาน การ์ดจะย้ายเข้าสู่กระดานคัมบังโดยอัตโนมัติ</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 7. WORK KANBAN BOARD ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <div class="section-title-wrap">
      <span class="section-num">7</span>
      <h2>ฮับบริหารงาน - กระดานคัมบังและการจัดการสถานะ (Kanban Board &amp; MD Auto-Shift)</h2>
    </div>
    <div class="section-meta">
      <span class="role-badge">ทุกคน (ย้ายตามสิทธิ์)</span> · <code>/work/board</code>
    </div>
  </div>

  <div class="img-container">
    <img src="manual_assets/07_work_board.png" alt="Kanban Board Screen">
    <div class="img-caption">ภาพที่ 7: กระดานคัมบัง 7 คอลัมน์สถานะ รองรับ Drag-and-Drop, ตัวสลับ Swimlane, ป้ายเตือน [MD-DIRECT], และการ์ด [PAUSED]</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>🎯 วงจรสถานะงาน 7 ขั้นตอน (Workflow Columns)</h4>
      <ul>
        <li><strong>1. Backlog &rarr; 2. In Progress:</strong> กำลังพัฒนาโค้ด (บันทึกวันเริ่มอัตโนมัติ)</li>
        <li><strong>3. Code Review &rarr; 4. Ready for QA:</strong> ผ่านรีวิว (จุด Fair Cutoff)</li>
        <li><strong>5. In QA &rarr; 6. Reopened:</strong> ตีกลับแก้ไข &rarr; <strong>7. Done:</strong> ตรวจรับปิดงาน</li>
        <li><strong>Swimlane Switcher:</strong> สลับการจัดกลุ่มตามผู้รับผิดชอบ (Assignee) หรือสายงาน (Track)</li>
      </ul>
    </div>
    <div class="info-card">
      <h4>⚡ โฟลว์รับมืองานสั่งตรงจาก MD (MD-DIRECT &amp; Auto-Shift)</h4>
      <ul>
        <li><strong>Active WIP Auto-Detection:</strong> เมื่อลากการ์ด MD เข้า In Progress ระบบจะเช็กอัตโนมัติว่าน้องคนนั้นมีงานอื่นค้างในมือหรือไม่</li>
        <li><strong>Auto-Shift Dialog:</strong> มี Checkbox ติ๊ก "งานสั่งตรงจาก MD" พร้อม <code>ejs-multiselect</code> เลือกงานค้างในมือเพื่อเลื่อนวันส่งแรก (firstDueOn) เว้นวันเสาร์-อาทิตย์ในคลิกเดียว</li>
        <li><strong>[PAUSED] State:</strong> การ์ดเดิมจะแสดงป้าย [PAUSED] พร้อมปรับความโปร่งแสง และการันตีคะแนนไม่ให้เสียเปรียบ</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 8. WORK LIST ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <div class="section-title-wrap">
      <span class="section-num">8</span>
      <h2>ฮับบริหารงาน - รายการงานทั้งหมด (Work List Table &amp; Freeze Columns)</h2>
    </div>
    <div class="section-meta">
      <span class="role-badge">ทุกคนเข้าถึงได้</span> · <code>/work/list</code>
    </div>
  </div>

  <div class="img-container">
    <img src="manual_assets/08_work_list.png" alt="Work List Screen">
    <div class="img-caption">ภาพที่ 8: ตารางรวมรายการงานทั้งหมด พร้อมคอลัมน์ตรึง ค้นหาแบบหลายเงื่อนไข และส่งออกข้อมูลเป็น Excel</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>🎯 คุณสมบัติตารางประสิทธิภาพสูง (Syncfusion Grid)</h4>
      <ul>
        <li><strong>คอลัมน์ตรึง (Frozen Columns):</strong> ตรึงรหัสใบงานและชื่องานไว้ด้านซ้ายเสมอ ทำให้เลื่อนดูข้อมูลทางขวาได้สะดวกโดยไม่หลุดบริบท</li>
        <li><strong>เครื่องมือเลือกแสดงคอลัมน์ (Column Chooser):</strong> สามารถเปิด/ปิดคอลัมน์ที่ต้องการดูได้ตามความต้องการส่วนบุคคล</li>
        <li><strong>ระบบจัดกลุ่มและกรอง (Grouping &amp; Filtering):</strong> ลากหัวคอลัมน์เพื่อจัดกลุ่มตามสถานะ หรือกรองตามช่วงวันที่ได้อย่างรวดเร็ว</li>
      </ul>
    </div>
    <div class="info-card">
      <h4>💡 การส่งออกข้อมูลและการรวมผล</h4>
      <ul>
        <li><strong>ส่งออกเป็น Excel / CSV:</strong> กดปุ่ม Export บนแถบเครื่องมือเพื่อนำข้อมูลไปทำรายงานเพิ่มเติมได้ทันที</li>
        <li><strong>แถวสรุปผลรวม (Aggregates Footer):</strong> แสดงผลรวมของประมาณการ Man-day (Sum Estimate MD) และชั่วโมงที่ใช้จริง (Sum Actual MD) ที่ด้านล่างของตาราง</li>
        <li>จดจำการตั้งค่าตาราง (Grid Persistence) แม้จะเปลี่ยนหน้าหรือรีเฟรชเบราว์เซอร์</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 9. TICKETS SCORECARD ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <div class="section-title-wrap">
      <span class="section-num">9</span>
      <h2>ตารางคะแนนใบงานฉบับเต็มและ Tiered Tolerance (Tickets Scorecard Grid)</h2>
    </div>
    <div class="section-meta">
      <span class="role-badge">ทุกคนเข้าถึงได้</span> · <code>/tickets</code>
    </div>
  </div>

  <div class="img-container">
    <img src="manual_assets/09_tickets_scorecard.png" alt="Tickets Scorecard Grid Screen">
    <div class="img-caption">ภาพที่ 9: ตารางคะแนนใบงานฉบับเต็ม แสดงการคำนวณคะแนน On-Time, ความแม่นยำ (Tiered Tolerance), และเครดิต Peer Review</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>🎯 เกณฑ์ความแม่นยำตามขนาดงาน (Tiered Tolerance)</h4>
      <ul>
        <li><strong>XS / S (&le; 0.5 MD):</strong> กรอบกว้าง [0.5, 2.0] ได้เต็ม 20 คะแนน (ยอมรับความแปรปรวนของงานเล็ก)</li>
        <li><strong>M (1.0 MD):</strong> กรอบมาตรฐาน [0.8, 1.5] ได้เต็ม 20 คะแนน</li>
        <li><strong>L / XL (&ge; 2.0 MD):</strong> กรอบวินัยเข้ม [0.85, 1.3] ได้เต็ม 20 คะแนน</li>
        <li><strong>Net Actual MD:</strong> หักลบวันพักงาน (<code>pausedDays</code>), เวลาติดบล็อก, และเวลารอคิว QA ก่อนคำนวณอัตราส่วน</li>
      </ul>
    </div>
    <div class="info-card">
      <h4>🛡️ คะแนนส่งมอบและโควตาตรวจโค้ด (Peer Review MD)</h4>
      <ul>
        <li><strong>On-Time Delivery (40 คะแนน):</strong> ส่งก่อน/ตรงกำหนดได้เต็ม 40 (งานที่ถูกพักโดย MD Mandate การันตี 40 คะแนนเต็ม)</li>
        <li><strong>DoD Evidence (20 คะแนน):</strong> ตรวจสอบ Unit Test ผ่าน และมีลิงก์ GitLab Merge Request</li>
        <li><strong>Peer Review Credit (10-15%):</strong> เครดิตเวลาโควตาพิเศษให้กับผู้ตรวจโค้ด (Reviewer/Approver) ที่ดึงจาก GitLab API</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 10. PEOPLE BOARD ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <div class="section-title-wrap">
      <span class="section-num">10</span>
      <h2>กระดานคะแนนพนักงานทั้งทีม (People Board &amp; Rankings)</h2>
    </div>
    <div class="section-meta">
      <span class="role-badge">ทุกคนเข้าถึงได้</span> · <code>/people</code>
    </div>
  </div>

  <div class="img-container">
    <img src="manual_assets/10_people_board.png" alt="People Board Screen">
    <div class="img-caption">ภาพที่ 10: กระดานจัดอันดับคะแนนพนักงานทั้งทีม แสดงดัชนีคะแนนรวม อัตราโควตา และสถานะผ่านเกณฑ์ประเมิน</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>🎯 ดัชนีชี้วัดรายบุคคล (Individual Index)</h4>
      <ul>
        <li><strong>สูตรคะแนนสาย Implement:</strong> On-time 40% + Accuracy 20% + DoD 20% + Reopen (หักลบ) + Workload Quota</li>
        <li><strong>สูตรคะแนนสาย R&D:</strong> ความสำเร็จของ Spike/PoC 40% + Accuracy 20% + DoD 20% + นวัตกรรมและการแบ่งปันความรู้</li>
        <li><strong>เกณฑ์มาตรฐาน (Baseline 75%):</strong> แถบสีเขียวแสดงผู้ที่ผ่านเกณฑ์ประเมินมาตรฐานขององค์กร</li>
      </ul>
    </div>
    <div class="info-card">
      <h4>💡 Dynamic Leave Quota &amp; Workload Balancing</h4>
      <ul>
        <li><strong>ปรับลดโควตาตามวันลา:</strong> Net Quota ปรับลดลงอัตโนมัติตามสัดส่วนวันลาและวันหยุดนักขัตฤกษ์ โดยไม่เสียเปรียบ</li>
        <li>ช่วยให้หัวหน้างานมองเห็นว่าใครกำลังมีภาระงานล้นมือ (Overload) หรือใครยังมีพื้นที่ว่าง (Underload) สำหรับกระจายงาน</li>
        <li>สามารถคลิกที่ชื่อพนักงานเพื่อเข้าสู่หน้าเจาะลึกรายคน (Person Dashboard) ได้ทันที</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 11. PERSON DASHBOARD ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <div class="section-title-wrap">
      <span class="section-num">11</span>
      <h2>แดชบอร์ดรายคนและการประเมินแบบ 1-on-1 (Person Dashboard &amp; MD Workload)</h2>
    </div>
    <div class="section-meta">
      <span class="role-badge">ทุกคนอ่านได้ / พนักงานดูของตนเอง</span> · <code>/people/:id</code>
    </div>
  </div>

  <div class="img-container">
    <img src="manual_assets/11_person_detail.png" alt="Person Detail Screen">
    <div class="img-caption">ภาพที่ 11: หน้าจอเจาะลึกข้อมูลรายบุคคล กราฟสัดส่วนงานสั่งตรงจาก MD กราฟประวัติคะแนนย้อนหลัง และปุ่มเลื่อน 1-on-1 ต่อเนื่อง</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>🎯 การวิเคราะห์เชิงลึกรายบุคคล</h4>
      <ul>
        <li><strong>1-on-1 Continuous Navigation:</strong> ปุ่ม Previous / Next เลื่อนดูข้อมูลลูกทีมทีละคนอย่างราบรื่นระหว่างการพูดคุยประเมินงาน</li>
        <li><strong>⚡ ผลกระทบของงานสั่งตรงจาก MD:</strong> กราฟแท่งซ้อน (StackedColumn) แสดงสัดส่วนชั่วโมงงาน Planned vs Unplanned vs MD Mandate ของพนักงานคนนั้น</li>
        <li><strong>Peer Review Hours:</strong> แสดงชั่วโมงและโควตาเครดิตที่ได้จากการตรวจโค้ดให้เพื่อนในทีม</li>
      </ul>
    </div>
    <div class="info-card">
      <h4>💡 ประวัติงานและข้อเสนอแนะเพื่อการพัฒนา</h4>
      <ul>
        <li><strong>เส้นแนวโน้มสถิติ OLS Regression Trendline:</strong> กราฟเส้นประสีม่วง (#a855f7) คำนวณ Least-Squares Slope ชี้ทิศทางพัฒนาการย้อนหลัง 6 เดือน พร้อมป้าย Slope</li>
        <li><strong>AI Coach 1-on-1 Dialogue Panel:</strong> ที่ปรึกษาการโค้ชด้วย AI (Gemini 2.5 Flash / Thai Rule Engine) พร้อมชิปคำถามด่วนแนะนำ 4 มิติ</li>
        <li><strong>สถิติการถูกตีกลับ (Reopen Analysis):</strong> จำแนกสาเหตุข้อผิดพลาด ช่วยให้หัวหน้าโค้ชชิ่งได้ตรงจุด</li>
        <li><strong>ตารางงานทั้งหมดของบุคคล:</strong> ดูรายการงานที่ปิดแล้วและงานที่กำลังทำอยู่ พร้อมคะแนนของแต่ละใบงาน</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 12. TEAM SCHEDULE ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <div class="section-title-wrap">
      <span class="section-num">12</span>
      <h2>ปฏิทินและไทม์ไลน์งานทีม (Team Schedule Calendar)</h2>
    </div>
    <div class="section-meta">
      <span class="role-badge">ทุกคนเข้าถึงได้</span> · <code>/schedule</code>
    </div>
  </div>

  <div class="img-container">
    <img src="manual_assets/12_schedule.png" alt="Team Schedule Screen">
    <div class="img-caption">ภาพที่ 12: ปฏิทินกำหนดการทำงานของทีม แสดงช่วงเวลาเริ่ม-สิ้นสุดของแต่ละใบงาน และมุมมองการจัดสรรทรัพยากร</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>🎯 มุมมองปฏิทินอัจฉริยะ (Syncfusion Schedule)</h4>
      <ul>
        <li><strong>มุมมองหลากหลาย:</strong> สลับดูได้ทั้งแบบรายวัน (Day), รายสัปดาห์ (Week), รายเดือน (Month), และไทม์ไลน์ตามสายงาน (Timeline Month)</li>
        <li><strong>รหัสสีตามสถานะงาน:</strong> สีเขียวสำหรับงานที่เสร็จสมบูรณ์แล้ว, สีน้ำเงินสำหรับงานที่กำลังทำ, และสีเหลืองสำหรับงานในคิว</li>
        <li><strong>ตรวจจับกำหนดส่งชนกัน:</strong> ชี้ให้เห็นวันที่ทีมมีกำหนดส่งมอบงานหลายใบพร้อมกัน เพื่อเตรียมความพร้อมของทีม QA</li>
      </ul>
    </div>
    <div class="info-card">
      <h4>💡 การประสานงานและการส่งมอบ</h4>
      <ul>
        <li>ช่วยให้ทีมมองเห็นภาพรวมของรอบ Sprint ได้อย่างชัดเจน</li>
        <li>เห็นช่วงวันลาและวันหยุดนักขัตฤกษ์เพื่อการวางแผนงานที่ไม่สะดุด</li>
        <li>สามารถคลิกที่กล่องกิจกรรมเพื่อเปิดดูรายละเอียดของใบงานนั้นๆ ได้ทันที</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 13. AI & RESEARCH TRACKING ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <div class="section-title-wrap">
      <span class="section-num">13</span>
      <h2>ระบบติดตามงานวิจัย AI และ Spike (AI &amp; Research Tracking)</h2>
    </div>
    <div class="section-meta">
      <span class="role-badge">ทุกคนเข้าถึงได้</span> · <code>/ai</code>
    </div>
  </div>

  <div class="img-container">
    <img src="manual_assets/13_ai_tracking.png" alt="AI & Research Tracking Screen">
    <div class="img-caption">ภาพที่ 13: หน้าจอติดตามงานวิจัย AI และ Spike บันทึกผลลัพธ์ PoC นวัตกรรม และการให้คะแนนสาย R&D</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>🎯 การจัดการงานวิจัยและทดลอง (Spike / PoC)</h4>
      <ul>
        <li><strong>Spike Ticket Tracking:</strong> ติดตามใบงานที่ตั้งขึ้นเพื่อการสำรวจเทคโนโลยีใหม่ หรือการพิสูจน์ความเป็นไปได้ (Proof of Concept)</li>
        <li><strong>บันทึกผลการทดลอง 3 สถานะ:</strong><br>
          • <strong>Adopted:</strong> สำเร็จ นำเทคโนโลยีมาใช้งานจริงในระบบ<br>
          • <strong>Alternative Chosen:</strong> ได้ข้อสรุป แต่เลือกแนวทางอื่นที่คุ้มค่ากว่า<br>
          • <strong>Dropped:</strong> ไม่นำมาใช้ เนื่องจากข้อจำกัดทางเทคนิค (ยังได้คะแนนการวิจัย)
        </li>
      </ul>
    </div>
    <div class="info-card">
      <h4>💡 การให้คะแนนแบบส่งเสริมการเรียนรู้</h4>
      <ul>
        <li>สายงานวิจัยไม่ถูกหักคะแนนหากผลการทดลองออกมาเป็น Dropped หากมีเอกสารสรุปความรู้อย่างครบถ้วน</li>
        <li>ระบบเน้นการส่งเสริมนวัตกรรมและความคุ้มค่าของการทดลองก่อนเริ่มงาน Feature ใหญ่</li>
        <li>มีตารางสรุปผลงาน AI ประจำไตรมาสเพื่อนำเสนอต่อผู้บริหาร</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 14. PYTHON ANALYTICS HUB ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <div class="section-title-wrap">
      <span class="section-num">14</span>
      <h2>ศูนย์วิเคราะห์อัจฉริยะ (Python Analytics Intelligence Hub)</h2>
    </div>
    <div class="section-meta">
      <span class="role-badge">Lead &amp; Admin (รันวิเคราะห์) / ทุกคนอ่าน</span> · <code>/analytics</code>
    </div>
  </div>

  <div class="img-container">
    <img src="manual_assets/14_analytics.png" alt="Python Analytics Hub Screen">
    <div class="img-caption">ภาพที่ 14: ศูนย์วิเคราะห์อัจฉริยะ ขับเคลื่อนด้วย Python Analytics Engine แสดงความสมบูรณ์การซิงก์ และคำแนะนำโค้ชชิ่ง</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>🎯 เครื่องมือวิเคราะห์ 5 เสาหลัก (5 Intelligence Pillars)</h4>
      <ul>
        <li><strong>1. Sync Hygiene Readiness (%):</strong> ตรวจสอบความถูกต้องของข้อมูลใบงาน วันที่ครบกำหนด และการลงบันทึกเวลา</li>
        <li><strong>2. Z-Score Outlier Radar:</strong> ตรวจหาใบงานที่มีค่าผิดปกติเชิงสถิติ (งานกินเวลาเกิน 2 SD)</li>
        <li><strong>3. Delivery Risk Radar:</strong> แจ้งเตือนใบงานที่มีความเสี่ยงสูงว่าจะส่งมอบไม่ทัน</li>
        <li><strong>4. 1-on-1 Coaching Insights:</strong> สรุปประเด็นคำแนะนำสำหรับหัวหน้างานใช้พูดคุยพัฒนารายคน</li>
        <li><strong>5. Module &amp; Variance Bottlenecks:</strong> วิเคราะห์โมดูลที่มีปัญหาเกิด Bug ซ้ำซาก</li>
      </ul>
    </div>
    <div class="info-card">
      <h4>💡 ขับเคลื่อนด้วย Python 3 Data Engine</h4>
      <ul>
        <li>ประมวลผลผ่านสคริปต์ <code>scripts/analytics_engine.py</code> ฝั่งเซิร์ฟเวอร์ ให้ผลลัพธ์ทางสถิติที่แม่นยำ</li>
        <li>ปุ่ม <strong>"รันวิเคราะห์ AI ทันที"</strong> ช่วยคำนวณข้อมูลใหม่สดตามสถานการณ์ล่าสุด</li>
        <li>รองรับการชดเชยเวลาของงานที่ถูกพักโดย MD Mandate ไม่ให้กลายเป็น False Alarm Outlier</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 15. INTEGRATIONS ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <div class="section-title-wrap">
      <span class="section-num">15</span>
      <h2>การเชื่อมต่อระบบภายนอก OpenProject, GitLab, Teams (Integrations Hub)</h2>
    </div>
    <div class="section-meta">
      <span class="role-badge admin">Admin เท่านั้น (ตั้งค่า)</span> · <code>/integrations</code>
    </div>
  </div>

  <div class="img-container">
    <img src="manual_assets/15_integrations.png" alt="Integrations Screen">
    <div class="img-caption">ภาพที่ 15: หน้าจอตั้งค่าการเชื่อมต่อ 3 ระบบหลัก (OpenProject, GitLab, Microsoft Teams) พร้อมประวัติการซิงก์ข้อมูล</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>🎯 การเชื่อมต่อทั้ง 3 ระบบ</h4>
      <ul>
        <li><strong>1. OpenProject:</strong> ซิงก์ Work Packages, ชั่วโมงทำงาน (Time Entries) พร้อมกติกา FirstDueOn Lock ป้องกันการเขียนทับวันส่งแรก</li>
        <li><strong>2. GitLab API v4:</strong> ดึง Merge Requests พร้อมดึงรายชื่อ Reviewers &amp; Approvals จาก <code>/merge_requests/:iid/approvals</code> เพื่อคำนวณ Peer Review Quota</li>
        <li><strong>3. Microsoft Teams Webhook:</strong> ยิงแจ้งเตือนใบงานที่หลุดกำหนดส่ง หรืองานค้าง SLA ข้ามทีมเข้าแชลแนลทีมโดยตรง</li>
      </ul>
    </div>
    <div class="info-card">
      <h4>💡 ตารางประวัติการซิงก์ (Sync Runs History)</h4>
      <ul>
        <li>แสดงรอบการซิงก์ย้อนหลัง พร้อมสถานะ (Success / Failed), จำนวนใบงานที่เพิ่มใหม่, และระยะเวลาที่ใช้</li>
        <li>ปุ่ม <strong>"ซิงก์เดี๋ยวนี้ (Sync Now)"</strong> สั่งดึงข้อมูลล่าสุดจาก OpenProject ทันทีโดยไม่ต้องรอรอบ Cron</li>
        <li>ระบบจับคู่ผู้ใช้ OpenProject กับพนักงานใน Scorecard (User Mapping)</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 16. ADMIN HUB ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <div class="section-title-wrap">
      <span class="section-num">16</span>
      <h2>การจัดการสิทธิ์ เกณฑ์คะแนน และประวัติระบบ (Admin Hub &amp; Audit Log)</h2>
    </div>
    <div class="section-meta">
      <span class="role-badge admin">Admin เท่านั้น</span> · <code>/admin</code>
    </div>
  </div>

  <div class="img-container">
    <img src="manual_assets/16_admin.png" alt="Admin Hub Screen">
    <div class="img-caption">ภาพที่ 16: หน้าจอศูนย์กลางผู้ดูแลระบบ ปรับสิทธิ์พนักงาน โควตารายสัปดาห์ น้ำหนักคะแนน และตารางประวัติ Audit Log</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>🎯 การกำหนดค่าหลักของระบบ</h4>
      <ul>
        <li><strong>Access Role Matrix:</strong> กำหนดสิทธิ์รายคนระหว่าง <code>admin</code>, <code>lead</code>, และ <code>member</code></li>
        <li><strong>Level Overrides:</strong> ปรับระดับตำแหน่งรายบุคคล (Senior, Mid, Junior, FirstMonth)</li>
        <li><strong>Weekly Quotas:</strong> กำหนดโควตาชั่วโมงทำงานมาตรฐานต่อสัปดาห์ของแต่ละระดับตำแหน่ง</li>
        <li><strong>Track Weights:</strong> ปรับน้ำหนักสูตรคะแนนระหว่างผลงานตามแผน, คุณภาพ DoD, และสัดส่วนงานแทรก</li>
      </ul>
    </div>
    <div class="info-card">
      <h4>💡 บันทึกประวัติการเปลี่ยนแปลง (Audit Log)</h4>
      <ul>
        <li>บันทึกทุกการกระทำสำคัญในระบบ: ใครเป็นคนแก้, แก้ไขเรื่องอะไร, ค่าเดิมคืออะไร, และค่าใหม่คืออะไร</li>
        <li>บันทึกการอนุมัติเลื่อนกำหนดส่งงานด่วน MD, การปรับสิทธิ์, การจับ Snapshot, และการรัน Analytics</li>
        <li>เป็นไปตามมาตรฐานความปลอดภัยและการตรวจสอบย้อนกลับ (Traceability &amp; Compliance)</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 17. DESIGN SYSTEM MOCKUP ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <div class="section-title-wrap">
      <span class="section-num">17</span>
      <h2>ดีไซน์ซิสเต็มและคู่มือสไตล์ MyHR Plus (Design System &amp; Color Tokens)</h2>
    </div>
    <div class="section-meta">
      <span class="role-badge">ทุกคนเข้าถึงได้</span> · <code>/mockup</code>
    </div>
  </div>

  <div class="img-container">
    <img src="manual_assets/17_mockup.png" alt="Design System Mockup Screen">
    <div class="img-caption">ภาพที่ 17: หน้าจอสาธิตส่วนประกอบ UI (Design Tokens) สีหลัก MyHR Royal Blue, ฟอนต์ Sarabun/IBM Plex, และชุดการ์ด</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>🎯 โทเคนสีและรูปแบบตามมาตรฐาน MyHR Plus</h4>
      <ul>
        <li><strong>สีหลัก (Brand Colors):</strong> MyHR Royal Blue (<code>#2e4fc8</code>), สีรอง (<code>#4c68e5</code>), และสีเน้น AI Spike (<code>#7465e8</code>)</li>
        <li><strong>แบบอักษรผสมผสาน:</strong> 'IBM Plex Sans Thai' สำหรับส่วนหัว, 'Montserrat' สำหรับตัวเลข/รหัส, และ 'Sarabun' สำหรับเนื้อหาภาษาไทย</li>
        <li><strong>การ์ดและคอนเทนเนอร์:</strong> ออกแบบให้มีความโค้งมน นุ่มนวล และมีเงาบางเบาตามมาตรฐานองค์กร</li>
      </ul>
    </div>
    <div class="info-card">
      <h4>💡 ประโยชน์ของหน้านี้</h4>
      <ul>
        <li>ใช้เป็น Single Source of Truth สำหรับนักพัฒนาในการอ้างอิง CSS Classes, ปุ่ม, ชิป, และสไตล์กราฟ</li>
        <li>ทดสอบความเข้ากันได้ของคอมโพเนนต์ Syncfusion กับชุดสไตล์หลักของระบบ</li>
        <li>จำลองโฟลว์การทำงานตั้งแต่การสร้างใบงานไปจนถึงการคำนวณคะแนน</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 18. APPBAR CONTROLS & ALERTS ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <div class="section-title-wrap">
      <span class="section-num">18</span>
      <h2>แถบเครื่องมือหลัก หน้าต่างแจ้งเตือน และ Mini-Sidebar (AppBar &amp; Alerts)</h2>
    </div>
    <div class="section-meta">
      <span class="role-badge">ทุกคนเข้าถึงได้</span> · <code>Shell Controls</code>
    </div>
  </div>

  <div class="img-container">
    <img src="manual_assets/18_alert_dialog.png" alt="Alerts Dialog Screen">
    <div class="img-caption">ภาพที่ 18: หน้าต่างแจ้งเตือนใบงานที่ต้องเฝ้าระวัง พร้อมช่องค้นหา Real-time Text Filter กรองตามรหัสใบงานได้ทันที</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>🎯 ฟังก์ชันบนแถบเครื่องมือหลัก (AppBar)</h4>
      <ul>
        <li><strong>ปุ่มพับเมนู Mini-Sidebar:</strong> กดปุ่ม Hamburger บน Desktop เพื่อพับเมนูเหลือ 68px แสดงเฉพาะไอคอน ช่วยเพิ่มพื้นที่ทำงานให้กับ Gantt และตาราง Grid อีก 192px</li>
        <li><strong>ชิปสถานะระบบ:</strong> แสดงสถานะว่ากำลัง <code>ต่อ API</code> จริง, <code>ออฟไลน์ (Seed)</code>, หรืออยู่ใน <code>โหมดจำลอง</code></li>
        <li><strong>ปุ่มสลับมุมมองพนักงาน:</strong> ช่วยให้ Admin และ Lead สามารถกดจำลองมุมมองแบบ Member เพื่อตรวจดูความถูกต้องของ UI ได้</li>
      </ul>
    </div>
    <div class="info-card">
      <h4>💡 หน้าต่างแจ้งเตือนค้นหาได้ (#alertDialog)</h4>
      <ul>
        <li>ปุ่มแจ้งเตือนพร้อม Badge สีแดงกะพริบระบุจำนวนใบงานที่มีความเสี่ยง</li>
        <li>เมื่อคลิกจะเปิด Syncfusion Dialog แสดงรายการงานที่หลุดกำหนดส่ง หรือทำงานเกินเวลาที่ประมาณการไว้</li>
        <li><strong>ช่องค้นหา Real-time:</strong> มีช่อง <code>ejs-textbox</code> พิมพ์รหัสใบงานหรือชื่อโมดูลเพื่อกรองรายการแจ้งเตือนได้ทันทีโดยไม่ต้องเลื่อนหา</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 19. LIGHT & DARK MODE ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <div class="section-title-wrap">
      <span class="section-num">19</span>
      <h2>ระบบโหมดสว่างและโหมดมืด (Syncfusion Tailwind 3 Dual Theming)</h2>
    </div>
    <div class="section-meta">
      <span class="role-badge">ทุกคนเข้าถึงได้</span> · <code>AppBar Theme Toggle</code>
    </div>
  </div>

  <div class="img-container">
    <img src="manual_assets/19_light_mode_team.png" alt="Light Mode Screen">
    <div class="img-caption">ภาพที่ 19: แดชบอร์ดทีมในโหมดสว่าง (Light Theme) สลับได้ทันทีแบบ Zero-Reload พร้อมความคมชัดระดับ WCAG 2.2</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>🎯 สถาปัตยกรรม Dual Theme ของระบบ</h4>
      <ul>
        <li><strong>ปุ่มสลับธีมบน AppBar (#appbar-theme-toggle):</strong> แสดงไอคอนดวงอาทิตย์/พระจันทร์ พร้อมข้อความ <code>โหมดสว่าง</code> / <code>โหมดมืด</code></li>
        <li><strong>Zero-Reload Switching:</strong> สลับชุดสไตล์สเปกตรัมระหว่าง <code>tailwind3.css</code> และ <code>tailwind3-dark.css</code> ทันทีโดยไม่ต้องโหลดหน้าเว็บใหม่</li>
        <li><strong>Dynamic Chart Theming:</strong> กราฟและแถบความคืบหน้าทั้ง 30 จุด ผูกสัญญาณสลับธีมแสดงผลคมชัดอัตโนมัติ</li>
      </ul>
    </div>
    <div class="info-card">
      <h4>💡 ความคมชัดและการจดจำค่า</h4>
      <ul>
        <li><strong>Frozen Columns Opaque Background:</strong> คอลัมน์ที่ถูกตรึงจะมีพื้นหลังทึบเสมอ (สีขาวใน Light Mode, สีกรมท่าเข้มใน Dark Mode) ป้องกันตัวอักษรของคอลัมน์ที่เลื่อนมาทับซ้อนกัน</li>
        <li><strong>Zero FOUC (Flash of Unstyled Content):</strong> ฝัง inline script ใน <code>index.html</code> เพื่ออ่านค่าจาก <code>localStorage</code> และเซ็ตธีมตั้งแต่เฟรมแรกที่เปิดเว็บ</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 20. NEW WORK QUEUE ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <div class="section-title-wrap">
      <span class="section-num">20</span>
      <h2>คิวงานใหม่และการจ่ายงานด่วน MD (New Work &amp; MD Mandate Queue)</h2>
    </div>
    <div class="section-meta">
      <span class="role-badge">Lead &amp; Admin (จ่ายงาน) / สมาชิกอ่าน</span> · <code>/queue</code>
    </div>
  </div>

  <div class="img-container">
    <img src="manual_assets/20_queue.png" alt="New Work Queue Screen">
    <div class="img-caption">ภาพที่ 20: หน้าจอคิวงานใหม่ พร้อมคำสั่งจ่ายงานด่วน MD ทันที และระบบเขียนสถานะกลับ OpenProject (Writeback)</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>🎯 การรับงานและกระจายงานอย่างเป็นธรรม</h4>
      <ul>
        <li><strong>Capacity Balancing:</strong> แสดงโควตาชั่วโมงทำงานที่ว่างของพนักงานแต่ละคน ช่วยให้ Lead เลือกคนรับงานได้อย่างเหมาะสม</li>
        <li><strong>⚡ คำสั่ง "รับงานด่วน MD &amp; เลื่อนงานเดิม":</strong> กดจ่ายงานแทรกตรงจาก MD พร้อมเปิดหน้าต่างยืนยันพักงานเดิมและเลื่อนวันส่งของน้องทันที</li>
        <li><strong>Writeback Confirmation:</strong> เมื่อเปิดใช้ <code>OPENPROJECT_WRITEBACK=true</code> จะมี Dialog สรุปการเปลี่ยน Assignee และวันส่งมอบกลับไปยัง OpenProject</li>
      </ul>
    </div>
    <div class="info-card">
      <h4>💡 การปกป้องดัชนีชี้วัดของผู้ปฏิบัติงาน</h4>
      <ul>
        <li>งานที่จ่ายผ่านปุ่มนี้จะได้รับการตั้งค่าสถานะ <code>is_md_direct: true</code> โดยอัตโนมัติ</li>
        <li>ตรวจจับงานเดิมที่ค้างอยู่ในมือของพนักงานคนนั้น และบันทึกประวัติการเลื่อนกำหนดส่งลงในตาราง <code>ticket_due_shifts</code></li>
        <li>ลดขั้นตอนความยุ่งยากของหัวหน้างานในการคำนวณวันส่งใหม่ด้วยตนเอง</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 21. HANDOFF & SLA ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <div class="section-title-wrap">
      <span class="section-num">21</span>
      <h2>ศูนย์ตรวจสอบการส่งต่อและคอขวดข้ามทีม (Cross-Team Handoff &amp; SLA Inspector)</h2>
    </div>
    <div class="section-meta">
      <span class="role-badge">ทุกคนอ่านได้ / Ping: Lead &amp; Admin</span> · <code>/work/handoff</code>
    </div>
  </div>

  <div class="img-container">
    <img src="manual_assets/21_work_handoff.png" alt="Cross-Team Handoff Screen">
    <div class="img-caption">ภาพที่ 21: หน้าจอตรวจสอบการส่งต่อข้ามทีม กราฟ Stage Aging แนวนอน ตาราง Blocker Matrix และปุ่ม Ping แจ้งเตือนผ่าน Teams</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>🎯 ฟังก์ชันการตรวจจับคอขวดข้ามทีม</h4>
      <ul>
        <li><strong>กราฟ Stage Aging by Track (StackingBar):</strong> แสดงชั่วโมงเฉลี่ยที่การ์ดค้างในแต่ละสถานะ (In Progress, Code Review, In QA, Blocked) แยกตามทีม FE, BE, QA, Implement, และ Infra</li>
        <li><strong>Cross-Team Blocker Matrix:</strong> บอร์ดแสดงทีมที่กำลังรออีกทีมปลดล็อกงาน เช่น FE รอ API จาก BE หรือ Dev รอแก้ปัญหา Environment จาก Infra</li>
        <li><strong>ปุ่ม Ping Teams:</strong> ยิงแจ้งเตือนผ่าน Microsoft Teams Webhook ถึงผู้รับช่วงหรือทีมที่กำลังบล็อกงานได้ในคลิกเดียว</li>
      </ul>
    </div>
    <div class="info-card">
      <h4>💡 Fair Cutoff Rule (กติกาการวัดผลที่เป็นธรรม)</h4>
      <ul>
        <li><strong>On-Time Delivery ของ Dev:</strong> วัดจากเวลาที่การ์ดย้ายเข้าสู่สถานะ <code>Ready for QA</code> ครั้งแรกเทียบกับ <code>first_due_on</code></li>
        <li><strong>QA Waiting Buffer:</strong> เวลาที่ใบงานค้างรอคิวการทดสอบในถัง QA จะไม่ถูกนำมาหักคะแนนความล่าช้าของนักพัฒนา</li>
        <li><strong>ตารางตรึง 2 คอลัมน์แรก (Frozen Columns):</strong> ตรึงรหัสใบงานและสถานะค้าง สะดวกในการเลื่อนตรวจสอบเวลาที่ใช้จริงเทียบกับเกณฑ์ SLA</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 22. QA & DEFECT AUDIT ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <div class="section-title-wrap">
      <span class="section-num">22</span>
      <h2>ศูนย์ตรวจสอบคุณภาพ QA และช่องโหว่บั๊ก (QA &amp; Defect Leakage Audit)</h2>
    </div>
    <div class="section-meta">
      <span class="role-badge">ทุกคนอ่านได้ / บันทึกผล: QA, Lead, Admin</span> · <code>/quality/audit</code>
    </div>
  </div>

  <div class="img-container">
    <img src="manual_assets/22_quality_audit.png" alt="QA Defect Audit Screen">
    <div class="img-caption">ภาพที่ 22: ศูนย์ตรวจสอบคุณภาพ QA ตัวชี้วัด 4 มิติ ตารางตรวจสอบ Definition of Done (DoD) และปุ่ม Reject to Dev</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>🎯 ตัวชี้วัดคุณภาพ 4 มิติ (QA KPIs)</h4>
      <ul>
        <li><strong>First-Time Right %:</strong> สัดส่วนใบงานที่ผ่านการทดสอบรอบแรกโดยไม่ถูกตีกลับ (เป้าหมาย &ge; 85%)</li>
        <li><strong>Reopen Rate (QA ตีกลับ):</strong> อัตราการส่งงานกลับไปแก้ไข เพื่อชี้เป้าโมดูลที่โค้ดยังขาดความเสถียร</li>
        <li><strong>Bug Escape (หลุด Prod):</strong> อัตราบั๊กที่หลุดรอดจากถัง QA ไปพบใน Production (เกณฑ์มาตรฐาน &le; 5.0%)</li>
        <li><strong>DoD Evidence Completion:</strong> สัดส่วนความครบถ้วนของหลักฐาน Definition of Done</li>
      </ul>
    </div>
    <div class="info-card">
      <h4>🛡️ DoD Gate Verifier &amp; One-Click Reject</h4>
      <ul>
        <li><strong>DoD Gate Verifier (แท็บ 1):</strong> ตรวจสอบอัตโนมัติว่าใบงานมีลิงก์ MR, Unit Test ผ่าน, และแนบผลทดสอบบน Staging ครบถ้วนหรือไม่</li>
        <li><strong>ปุ่ม Reject to Dev:</strong> หากหลักฐานไม่ครบ QA สามารถกดส่งใบงานตีกลับไปยัง Dev พร้อมแจ้งเตือนได้ทันที</li>
        <li><strong>วิเคราะห์ Reopen Root-Causes (แท็บ 2):</strong> แจกแจงสาเหตุของบั๊ก (Logic, UI, API, Requirement, Environment) เพื่อการปรับปรุงอย่างต่อเนื่อง</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 23. 3-WAY TIME AUDIT ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <div class="section-title-wrap">
      <span class="section-num">23</span>
      <h2>หน้าจอตรวจสอบความคลาดเคลื่อนของเวลา 3 ทาง (3-Way Time &amp; Variance Inspector)</h2>
    </div>
    <div class="section-meta">
      <span class="role-badge">Admin &amp; Lead</span> · <code>/analytics/time-audit</code>
    </div>
  </div>

  <div class="img-container">
    <img src="manual_assets/23_time_audit.png" alt="3-Way Time Audit Screen">
    <div class="img-caption">ภาพที่ 23: หน้าจอตรวจสอบความคลาดเคลื่อนของเวลา 3 ทาง เปรียบเทียบ Estimate MD vs OpenProject Actual vs GitLab Commit Span</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>🎯 การเปรียบเทียบเวลา 3 มิติ</h4>
      <ul>
        <li><strong>(1) Estimate MD:</strong> เวลาประมาณการตามขนาดใบงาน (XS, S, M, L, XL)</li>
        <li><strong>(2) OpenProject Actual MD:</strong> เวลาที่พนักงานบันทึก Time Entry จริงใน OpenProject</li>
        <li><strong>(3) GitLab Commit Span:</strong> ระยะเวลาทำงานจริงที่วัดจาก First Commit จนถึงเวลาที่ Merge Request สำเร็จ</li>
      </ul>
    </div>
    <div class="info-card">
      <h4>🔍 ตรรกะตรวจจับความผิดปกติ (Python Engine)</h4>
      <ul>
        <li><strong>Missing Time Log:</strong> สถานะงานเป็น Code Review หรือ Done แต่ Actual MD เป็น 0 (ลืมลงเวลา)</li>
        <li><strong>Ghost In-Progress:</strong> สถานะ In Progress เกิน 3 วันทำการ แต่ไม่พบ Commit ใน GitLab</li>
        <li><strong>Time Mismatch:</strong> เวลาที่กรอกใน OpenProject ต่างจากช่วงเวลาบน GitLab เกิน &plusmn;50%</li>
        <li><strong>Outlier:</strong> สัดส่วนเวลาจริงต่อเวลาประมาณการสูงเกิน 1.5x (Z-Score สูงผิดปกติ)</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 24. SCORE DISPUTES ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <div class="section-title-wrap">
      <span class="section-num">24</span>
      <h2>ระบบยื่นอุทธรณ์และขอปรับปรุงคะแนนใบงาน (Score Dispute &amp; Exception Center)</h2>
    </div>
    <div class="section-meta">
      <span class="role-badge">Member ยื่นขอ / Lead &amp; Admin อนุมัติ</span> · <code>/tickets/disputes</code>
    </div>
  </div>

  <div class="img-container">
    <img src="manual_assets/24_tickets_disputes.png" alt="Score Disputes Screen">
    <div class="img-caption">ภาพที่ 24: ระบบยื่นอุทธรณ์คะแนนแบบ Split View พร้อมการจำลองผลคะแนนล่วงหน้า (Projected Score Diff) และประวัติ Audit Log</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>🎯 Split View พิจารณาคำขอ</h4>
      <ul>
        <li><strong>ฝั่งซ้าย: ตารางรายการคำขอ (Grid):</strong> แสดงสถานะคำขอ (รออนุมัติ, อนุมัติแล้ว, ปฏิเสธ) พร้อมรหัสใบงานและประเภทการขอยกเว้น</li>
        <li><strong>ฝั่งขวา: แผงพิจารณาและแบบจำลอง (Simulation Panel):</strong> แสดงรายละเอียดเหตุผล พร้อมลิงก์หลักฐานแนบ (เช่น แชท Teams หรือบันทึก Incident)</li>
        <li><strong>ปุ่มยื่นคำขอ (+ ejs-dialog):</strong> พนักงานทั่วไปสามารถส่งคำขอยกเว้นป้าย BLK, ENV, REQ ได้ด้วยตนเอง</li>
      </ul>
    </div>
    <div class="info-card">
      <h4>📊 การจำลองผลคะแนนล่วงหน้า (Projected Score Diff)</h4>
      <ul>
        <li><strong>คะแนนจำลองใบงาน:</strong> แสดงให้เห็นทันทีว่าหากอนุมัติ คะแนนของใบงานจะปรับจากเท่าใดไปเป็นเท่าใด (เช่น 60.0 &rarr; 100.0)</li>
        <li><strong>ดัชนีจำลองรายคน:</strong> คำนวณผลกระทบต่อคะแนนรวมของพนักงานล่วงหน้า (เช่น 72.4 &rarr; 78.5)</li>
        <li><strong>บันทึกความโปร่งใส (Audit Log):</strong> ทุกการอนุมัติหรือปฏิเสธจะถูกบันทึกพร้อมหมายเหตุของผู้อนุมัติลงในประวัติระบบ</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 25. PRE-SNAPSHOT FREEZE GATE ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <div class="section-title-wrap">
      <span class="section-num">25</span>
      <h2>ห้องตรวจสอบความพร้อมก่อนปิดงวดคะแนน (Pre-Snapshot Readiness &amp; Freeze Gate)</h2>
    </div>
    <div class="section-meta">
      <span class="role-badge">Admin &amp; Lead</span> · <code>/admin/snapshot-check</code>
    </div>
  </div>

  <div class="img-container">
    <img src="manual_assets/25_snapshot_check.png" alt="Pre-Snapshot Freeze Gate Screen">
    <div class="img-caption">ภาพที่ 25: ห้องตรวจสอบความพร้อมก่อนปิดงวดคะแนน เช็คลิสต์ 4 ด่าน แถบ Readiness % และตาราง Snapshot Preview Diff</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>🎯 Automated Pre-Flight Checks (เช็คลิสต์ 4 ด่าน)</h4>
      <ul>
        <li><strong>ด่าน 1: การซิงก์ OpenProject &amp; GitLab:</strong> ตรวจสอบว่าระบบได้รับข้อมูลล่าสุดและไม่มี Schema Conflict (Sync Readiness &ge; 90%)</li>
        <li><strong>ด่าน 2: คำขอทบทวนคะแนนที่ค้างอยู่:</strong> ตรวจจับคำขอในระบบอุทธรณ์ที่ยังไม่ได้รับการพิจารณา</li>
        <li><strong>ด่าน 3: ใบงานปิดแล้วแต่ลืมลงเวลา:</strong> ตรวจสอบว่าใบงานสถานะ Done ทุกใบมี Actual MD ครบถ้วน</li>
        <li><strong>ด่าน 4: โควตาและวันลา:</strong> ตรวจสอบว่าโควตาสุทธิของพนักงานทุกคนได้รับการปรับลดตามวันลาและวันหยุดเรียบร้อยแล้ว</li>
      </ul>
    </div>
    <div class="info-card">
      <h4>🔒 ตาราง Snapshot Preview Diff &amp; การแช่แข็งคะแนน</h4>
      <ul>
        <li><strong>Snapshot Preview Diff:</strong> ตารางเปรียบเทียบดัชนีงวดก่อนหน้าเทียบกับงวดปัจจุบันที่จะถูกบันทึกจริง แสดงส่วนต่าง (+/-) และสถานะผ่านเป้า</li>
        <li><strong>Readiness Progress Bar:</strong> แสดงคะแนนความพร้อมรวมเป็นเปอร์เซ็นต์ (ต้อง &ge; 75% จึงจะอนุญาตให้แช่แข็ง)</li>
        <li><strong>Two-Step Freeze Confirmation:</strong> บังคับทำเครื่องหมายยืนยันความถูกต้องก่อนกดปุ่ม Freeze Snapshot เพื่อป้องกันความผิดพลาด</li>
      </ul>
    </div>
  </div>

  <!-- ==================== 26. RUBRIC REGISTRY & DYNAMIC SCORING ==================== -->
  <div class="page-break"></div>
  <div class="section-header">
    <div class="section-title-wrap">
      <span class="section-num">26</span>
      <h2>ระบบจัดการเกณฑ์ประเมินไดนามิก (Rubric Registry &amp; Dynamic Scoring)</h2>
    </div>
    <div class="section-meta">
      <span class="role-badge">Admin</span> · <code>/admin/rubrics</code>
    </div>
  </div>

  <div class="img-container">
    <img src="manual_assets/26_admin_rubrics.png" alt="Rubric Registry Screen">
    <div class="img-caption">ภาพที่ 26: หน้าจอจัดการเกณฑ์ประเมินคะแนนไดนามิก ปรับแต่งพารามิเตอร์ขนาดงาน (XS–XL) และเกณฑ์ชี้วัดแบบเรียลไทม์ผ่าน Syncfusion Inline Edit Grid</div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <h4>⚙️ Dynamic Rubric Grid (Syncfusion Inline Edit)</h4>
      <ul>
        <li><strong>Inline Editing:</strong> ดับเบิลคลิกแถวในตารางเพื่อแก้ไขพารามิเตอร์เกณฑ์ประเมินได้โดยตรง (Normal Mode) เช่น min_ratio, max_ratio, และ points</li>
        <li><strong>เกณฑ์ขนาดงานแบบลดหลั่น (Tiered Tolerance):</strong> รองรับการปรับกรอบความแม่นยำตามขนาดงานจริง (XS, S, M, L, XL) เพื่อความเป็นธรรม</li>
        <li><strong>เกณฑ์ส่งตรง &amp; เกณฑ์คุณภาพ:</strong> ควบคุมเกณฑ์ On-time 40 คะแนน, เกณฑ์ DoD 40 คะแนน, และสูตรวิจัย R&amp;D</li>
      </ul>
    </div>
    <div class="info-card">
      <h4>🤖 AI Coach 1-on-1 Assistant &amp; OLS Trendline</h4>
      <ul>
        <li><strong>เส้นแนวโน้มสถิติ OLS Regression:</strong> แสดงเส้นประสีม่วง (#a855f7) คำนวณ Least-Squares Slope บนหน้าโปรไฟล์พนักงาน (/people/:id) ตรวจวัดแนวโน้มพัฒนาการ</li>
        <li><strong>AI Coach 1-on-1 Dialogue:</strong> เชื่อมต่อ Gemini 2.5 Flash พร้อม Thai Rule Engine Fallback สรุปบทวิเคราะห์ 4 มิติสำหรับลีดใช้พูดคุย 1-on-1</li>
        <li><strong>OpenProject Activity Comments:</strong> บันทึกข้อความ Markdown ลง /activities อัตโนมัติเมื่อสั่งพักงานหรือเลื่อนวันจาก MD Mandate</li>
      </ul>
    </div>
  </div>

  <div class="callout tip" style="margin-top: 14px;">
    <strong>สรุปภาพรวมระบบ Enterprise (v2026.4):</strong> ระบบ Man-day Scorecard เวอร์ชัน v2026.4 รองรับการทำงานแบบครบวงจร 26 หน้าจอ ครอบคลุม 6 สายงานหลัก พร้อมเกณฑ์ประเมินไดนามิก (Rubric Registry), การวิเคราะห์เชิงสถิติ OLS Regression, ที่ปรึกษาการโค้ชด้วย AI (Gemini 2.5 Flash), การตรวจวัด SLA ข้ามทีม, การอุทธรณ์คะแนนที่โปร่งใส, การชดเชยคะแนนงานสั่งตรงจาก MD (MD Mandate), และการแช่แข็งคะแนนที่เชื่อถือได้ตามมาตรฐานวิศวกรรมซอฟต์แวร์ระดับองค์กร
  </div>

</body>
</html>
`;

async function main() {
  const htmlPath = resolve(process.cwd(), 'docs/user-manual.html');
  const pdfPathEn = resolve(process.cwd(), 'docs/user-manual.pdf');
  const pdfPathTh = resolve(process.cwd(), 'docs/คู่มือการใช้งานระบบ.pdf');
  const currentArtifactDir = resolve('C:/Users/Ooh-Ao/.gemini/antigravity/brain/9d098c0d-93d5-4d41-b629-1bd6cf853cdd');
  const artifactPdfPath = resolve(currentArtifactDir, 'คู่มือการใช้งานระบบ.pdf');

  console.log('Writing HTML manual to:', htmlPath);
  writeFileSync(htmlPath, htmlContent, 'utf-8');

  const edgePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  if (!existsSync(edgePath)) {
    console.error('Edge executable not found at:', edgePath);
    process.exit(1);
  }

  console.log('Generating PDF via Microsoft Edge Headless...');
  const fileUrl = 'file:///' + htmlPath.replace(/\\\\/g, '/');

  const proc = spawn(edgePath, [
    '--headless=new',
    '--disable-gpu',
    '--run-all-compositor-stages-before-draw',
    '--no-pdf-header-footer',
    '--print-to-pdf=' + pdfPathEn,
    fileUrl,
  ]);

  proc.on('close', (code) => {
    if (code === 0 && existsSync(pdfPathEn)) {
      const size = statSync(pdfPathEn).size;
      console.log(`✅ user-manual.pdf generated successfully! (${(size / 1024 / 1024).toFixed(2)} MB)`);
      
      // Copy to Thai filename and artifact directory
      copyFileSync(pdfPathEn, pdfPathTh);
      console.log('✅ Copied to:', pdfPathTh);

      if (existsSync(currentArtifactDir)) {
        try {
          copyFileSync(pdfPathEn, artifactPdfPath);
          console.log('✅ Copied to artifact dir:', artifactPdfPath);
        } catch (e) {
          console.warn('Could not copy to artifact dir:', e.message);
        }
      }
    } else {
      console.error('❌ Failed to generate PDF, exit code:', code);
      process.exit(1);
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
