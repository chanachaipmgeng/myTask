/**
 * สร้าง PDF คู่มือหน้าจอจาก docs/คู่มือการใช้งานหน้าจอ.md
 * พร้อมคำอธิบายละเอียด (ตารางจุดประสงค์/สิ่งที่เห็น/ปุ่ม/ผล/สิทธิ์) + รูปแคป
 *
 *   node scripts/capture_all_screens.mjs --person=chanachai
 *   node scripts/build-manual-pdf.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, copyFileSync, statSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MD_PATH = resolve(process.cwd(), 'docs/คู่มือการใช้งานหน้าจอ.md');
const DOCS = resolve(process.cwd(), 'docs');

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMd(text) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return s;
}

/** แปลง markdown คู่มือหน้าจอ → HTML สำหรับพิมพ์ PDF */
function markdownToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let inUl = false;
  let inOl = false;
  let inTable = false;
  let tableRows = [];
  let inFence = false;
  let fenceBuf = [];

  const closeLists = () => {
    if (inUl) {
      out.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      out.push('</ol>');
      inOl = false;
    }
  };

  const flushTable = () => {
    if (!inTable) return;
    inTable = false;
    const rows = tableRows.filter((r) => r.length);
    tableRows = [];
    if (rows.length < 2) return;
    // skip separator row |---|
    const body = rows.filter((cells) => !cells.every((c) => /^:?-+:?$/.test(c.trim())));
    if (!body.length) return;
    const isDetailTable =
      body.length >= 2 &&
      body.every((cells) => cells.length >= 2) &&
      body[0][0].trim() === '' &&
      body.slice(1).every((cells) => /^\*\*.+\*\*$/.test(cells[0].trim()) || cells[0].trim().startsWith('**'));

    if (isDetailTable) {
      out.push('<dl class="detail-grid">');
      for (const cells of body.slice(1)) {
        const label = cells[0].replace(/\*\*/g, '').trim();
        const value = cells.slice(1).join(' · ').trim();
        out.push(`<div class="detail-row"><dt>${inlineMd(label)}</dt><dd>${inlineMd(value)}</dd></div>`);
      }
      out.push('</dl>');
      return;
    }

    out.push('<table class="md-table"><tbody>');
    body.forEach((cells, idx) => {
      const tag = idx === 0 ? 'th' : 'td';
      out.push(
        '<tr>' +
          cells.map((c) => `<${tag}>${inlineMd(c.trim())}</${tag}>`).join('') +
          '</tr>',
      );
    });
    out.push('</tbody></table>');
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      flushTable();
      closeLists();
      if (!inFence) {
        inFence = true;
        fenceBuf = [];
      } else {
        inFence = false;
        const lang = (lines[i - fenceBuf.length - 1] || '').replace(/^```/, '').trim();
        if (lang === 'mermaid') {
          out.push('<div class="callout"><strong>โฟลว์สรุป</strong><pre class="flow">');
          out.push(escapeHtml(fenceBuf.join('\n')));
          out.push('</pre></div>');
        } else {
          out.push('<pre><code>' + escapeHtml(fenceBuf.join('\n')) + '</code></pre>');
        }
        fenceBuf = [];
      }
      i += 1;
      continue;
    }
    if (inFence) {
      fenceBuf.push(line);
      i += 1;
      continue;
    }

    if (/^\|/.test(line)) {
      closeLists();
      inTable = true;
      const cells = line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim());
      tableRows.push(cells);
      i += 1;
      continue;
    }
    if (inTable) flushTable();

    const img = /^!\[([^\]]*)\]\(([^)]+)\)/.exec(line.trim());
    if (img) {
      closeLists();
      let src = img[2].replace(/^\.\//, '');
      if (src.startsWith('manual-screenshots/')) {
        const abs = resolve(DOCS, src);
        if (existsSync(abs)) {
          out.push(`<figure class="shot"><img src="${src}" alt="${escapeHtml(img[1])}" /><figcaption>${escapeHtml(img[1] || src)}</figcaption></figure>`);
        } else {
          out.push(`<p class="missing">ยังไม่มีรูป ${escapeHtml(src)}</p>`);
        }
      }
      i += 1;
      continue;
    }

    if (/^---+\s*$/.test(line)) {
      closeLists();
      out.push('<hr />');
      i += 1;
      continue;
    }

    if (line.startsWith('# ')) {
      closeLists();
      out.push(`<h1>${inlineMd(line.slice(2))}</h1>`);
      i += 1;
      continue;
    }
    if (line.startsWith('## ')) {
      closeLists();
      out.push(`<h2 class="section">${inlineMd(line.slice(3))}</h2>`);
      i += 1;
      continue;
    }
    if (line.startsWith('### ')) {
      closeLists();
      out.push(`<article class="screen"><h3>${inlineMd(line.slice(4))}</h3>`);
      // close article later before next h3/h2 — use marker
      out.push('<!--screen-open-->');
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      closeLists();
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${inlineMd(quote.join(' '))}</blockquote>`);
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      if (inOl) {
        out.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        out.push('<ul>');
        inUl = true;
      }
      out.push(`<li>${inlineMd(line.replace(/^[-*]\s+/, ''))}</li>`);
      i += 1;
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      if (inUl) {
        out.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        out.push('<ol>');
        inOl = true;
      }
      out.push(`<li>${inlineMd(line.replace(/^\d+\.\s+/, ''))}</li>`);
      i += 1;
      continue;
    }

    if (!line.trim()) {
      closeLists();
      i += 1;
      continue;
    }

    closeLists();
    out.push(`<p>${inlineMd(line)}</p>`);
    i += 1;
  }
  flushTable();
  closeLists();

  // close screen articles
  let html = out.join('\n');
  html = html.replace(/<!--screen-open-->/g, '');
  // wrap consecutive content after h3 until next h2/h3/hr into article — simpler: replace pattern
  html = html.replace(/<article class="screen">([\s\S]*?)(?=<article class="screen">|<h2 class="section">|<hr \/>|$)/g, '<article class="screen">$1</article>\n');
  return html;
}

function buildHtmlDocument(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <title>คู่มือหน้าจอ Man-day Scorecard — มุมชนะชัย (Admin) v2026.11</title>
  <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    @page {
      size: A4;
      margin: 14mm 12mm 16mm 12mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: 'Sarabun', Tahoma, sans-serif;
      font-size: 10.5pt;
      line-height: 1.55;
      color: #0f172a;
      margin: 0;
    }
    .cover {
      min-height: 92vh;
      padding: 48px 36px;
      page-break-after: always;
      background: linear-gradient(145deg, #0b1120, #1e3a8a 55%, #2746b3);
      color: #fff;
      border-radius: 12px;
    }
    .cover h1 { font-size: 26pt; line-height: 1.3; margin: 40px 0 16px; }
    .cover .meta { opacity: 0.92; font-size: 11pt; margin: 0.4rem 0; }
    .badge {
      display: inline-block; padding: 6px 14px; border-radius: 999px;
      background: rgba(56,189,248,.18); border: 1px solid rgba(56,189,248,.4);
      color: #7dd3fc; font-weight: 700;
    }
    h1 { font-size: 18pt; color: #2746b3; page-break-after: avoid; }
    h2.section {
      font-size: 14pt; color: #fff; background: #2746b3;
      padding: 8px 12px; border-radius: 8px; margin: 22px 0 12px;
      page-break-after: avoid;
    }
    h3 {
      font-size: 12.5pt; color: #1e3a8a; margin: 0 0 8px;
      page-break-after: avoid; border-bottom: 2px solid #dbeafe; padding-bottom: 4px;
    }
    article.screen {
      page-break-inside: avoid;
      break-inside: avoid;
      margin: 0 0 18px;
      padding: 12px 14px 14px;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      background: #fafbff;
    }
    p { margin: 0.35rem 0 0.55rem; }
    ul, ol { margin: 0.35rem 0 0.7rem; padding-left: 1.25rem; }
    li { margin: 0.2rem 0; }
    blockquote {
      margin: 0.6rem 0 1rem;
      padding: 8px 12px;
      border-left: 4px solid #f59e0b;
      background: #fffbeb;
      color: #78350f;
    }
    code {
      font-family: Consolas, 'Courier New', monospace;
      font-size: 9pt;
      background: #f1f5f9;
      padding: 1px 5px;
      border-radius: 4px;
    }
    a { color: #2746b3; text-decoration: none; }
    hr { border: none; border-top: 1px solid #cbd5e1; margin: 16px 0; }
    .detail-grid {
      display: grid;
      gap: 0;
      margin: 8px 0 12px;
      border: 1px solid #dbeafe;
      border-radius: 8px;
      overflow: hidden;
      background: #fff;
    }
    .detail-row {
      display: grid;
      grid-template-columns: 7.5rem 1fr;
      gap: 0;
      border-bottom: 1px solid #e2e8f0;
    }
    .detail-row:last-child { border-bottom: none; }
    .detail-row dt {
      margin: 0;
      padding: 7px 10px;
      background: #eff6ff;
      color: #1e40af;
      font-weight: 700;
      font-size: 9.5pt;
    }
    .detail-row dd {
      margin: 0;
      padding: 7px 10px;
      font-size: 10pt;
    }
    table.md-table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0 12px;
      font-size: 9.5pt;
    }
    table.md-table th, table.md-table td {
      border: 1px solid #cbd5e1;
      padding: 5px 8px;
      text-align: left;
      vertical-align: top;
    }
    table.md-table th { background: #eff6ff; color: #1e40af; }
    figure.shot {
      margin: 10px 0 4px;
      page-break-inside: avoid;
    }
    figure.shot img {
      display: block;
      width: 100%;
      max-height: 118mm;
      object-fit: contain;
      object-position: top;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #f8fafc;
    }
    figure.shot figcaption {
      font-size: 8.5pt;
      color: #64748b;
      margin-top: 4px;
      text-align: center;
    }
    .missing { color: #b91c1c; }
    .callout {
      margin: 10px 0;
      padding: 10px 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }
    pre.flow {
      white-space: pre-wrap;
      font-size: 8.5pt;
      margin: 6px 0 0;
      color: #334155;
    }
    /* ซ่อน h1 ซ้ำจาก md บนหน้าปกแยกแล้ว — แสดงเป็น intro */
    body > h1:first-of-type { display: none; }
  </style>
</head>
<body>
  <section class="cover">
    <div class="badge">Man-day Scorecard · v2026.11</div>
    <h1>คู่มือการใช้งานหน้าจอ<br/>มุมชนะชัย (Admin)</h1>
    <p class="meta">ฉบับละเอียด — จุดประสงค์ · สิ่งที่เห็นบนจอ · ปุ่มสำคัญ · ผลเมื่อกด · สิทธิ์ admin</p>
    <p class="meta">แคปจอ Light Mode · Dev Login ชนะชัย · รวมงานทีม · คุณภาพ · Admin · Integrations · Drawer 360°</p>
    <p class="meta">แหล่ง: docs/คู่มือการใช้งานหน้าจอ.md</p>
  </section>
  ${bodyHtml}
</body>
</html>`;
}

async function main() {
  if (!existsSync(MD_PATH)) {
    console.error('ไม่พบ', MD_PATH);
    process.exit(1);
  }
  const md = readFileSync(MD_PATH, 'utf-8');
  const body = markdownToHtml(md);
  const html = buildHtmlDocument(body);

  const htmlPath = resolve(DOCS, 'user-manual.html');
  const pdfPathEn = resolve(DOCS, 'user-manual.pdf');
  const pdfPathTh = resolve(DOCS, 'คู่มือการใช้งานระบบ.pdf');

  writeFileSync(htmlPath, html, 'utf-8');
  console.log('Wrote', htmlPath);

  const edgePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const edgePathAlt = 'C:/Program Files/Microsoft/Edge/Application/msedge.exe';
  const edge = existsSync(edgePath) ? edgePath : edgePathAlt;
  if (!existsSync(edge)) {
    console.error('Edge not found');
    process.exit(1);
  }

  const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
  console.log('Printing PDF via Edge (รายละเอียดจาก Markdown)...');

  await new Promise((resolvePromise, reject) => {
    const proc = spawn(
      edge,
      [
        '--headless=new',
        '--disable-gpu',
        '--run-all-compositor-stages-before-draw',
        '--no-pdf-header-footer',
        `--print-to-pdf=${pdfPathEn}`,
        fileUrl,
      ],
      { stdio: 'inherit' },
    );
    proc.on('close', (code) => {
      if (code === 0 && existsSync(pdfPathEn)) resolvePromise();
      else reject(new Error(`Edge PDF failed code=${code}`));
    });
  });

  let copied = false;
  for (let attempt = 0; attempt < 5 && !copied; attempt += 1) {
    try {
      copyFileSync(pdfPathEn, pdfPathTh);
      copied = true;
    } catch {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  const mb = (statSync(pdfPathEn).size / 1024 / 1024).toFixed(2);
  console.log(`✅ user-manual.pdf (${mb} MB)`);
  if (copied) console.log(`✅ ${pdfPathTh}`);
  else console.warn(`⚠️ คัดลอกไปชื่อไทยไม่สำเร็จ (ไฟล์อาจถูกเปิดค้าง) — ใช้ docs/user-manual.pdf`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
