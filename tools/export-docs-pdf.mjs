// 把使用手冊與技術架構說明書匯出成 PDF（docs/pdf/）。
// 用法：npm run docs:pdf
// 需要本機安裝 Google Chrome；可用環境變數 CHROME_PATH 指定其他 Chromium 執行檔。
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Marked } from 'marked';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = join(root, 'docs');
const outDir = join(docsDir, 'pdf');

const DOCUMENTS = [
  {
    source: 'USER_MANUAL.md',
    output: 'H5-EMU-使用手冊.pdf',
    title: 'H5-EMU 使用手冊',
    subtitle: '大廳、手機與電腦操作、存檔、快轉倒帶與常見問題',
    audience: '玩家',
  },
  {
    source: 'ARCHITECTURE.md',
    output: 'H5-EMU-技術架構說明書.pdf',
    title: 'H5-EMU 技術架構說明書',
    subtitle: '系統分層、後端介面、存檔架構、效能與擴充指南',
    audience: '開發者',
  },
];

/** 與 GitHub 相同的標題錨點規則，讓文件內的目錄連結在 PDF 裡也能點。 */
function slugify(text) {
  return text.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');
}

const ALERTS = {
  NOTE: { label: '說明', className: 'note' },
  TIP: { label: '提示', className: 'tip' },
  IMPORTANT: { label: '重要', className: 'important' },
  WARNING: { label: '注意', className: 'warning' },
  CAUTION: { label: '警告', className: 'warning' },
};

function renderMarkdown(markdown) {
  const used = new Map();
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth, text }) {
        const base = slugify(text.replace(/<[^>]+>/g, ''));
        const count = used.get(base) ?? 0;
        used.set(base, count + 1);
        const id = count === 0 ? base : `${base}-${count}`;
        return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        // 兩份文件互相引用時，改成連到對應的 PDF。
        const target = DOCUMENTS.reduce((value, doc) => value.replace(doc.source, doc.output), href);
        const titleAttr = title ? ` title="${title}"` : '';
        return `<a href="${target}"${titleAttr}>${this.parser.parseInline(tokens)}</a>`;
      },
    },
  });
  let html = marked.parse(markdown);
  // GitHub 提示框：> [!NOTE] …
  html = html.replace(/<blockquote>\s*<p>\[!(\w+)\]\s*(?:<br>)?\s*([\s\S]*?)<\/blockquote>/g, (match, kind, body) => {
    const alert = ALERTS[kind.toUpperCase()];
    if (!alert) return match;
    return `<div class="alert alert-${alert.className}"><div class="alert-title">${alert.label}</div><p>${body}</div>`;
  });
  return html;
}

function stripLeadingTitle(markdown) {
  // 封面已顯示標題與開頭說明，正文從第一個章節開始。
  const firstSection = markdown.search(/^## /m);
  return firstSection > 0 ? markdown.slice(firstSection) : markdown;
}

function leadParagraphs(markdown) {
  const head = markdown.slice(0, Math.max(0, markdown.search(/^## /m)));
  return head
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('>'))
    .join('\n');
}

function buildHtml(doc, markdown, today) {
  const lead = new Marked({ gfm: true }).parse(leadParagraphs(markdown));
  const body = renderMarkdown(stripLeadingTitle(markdown));
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<base href="${pathToFileURL(docsDir).href}/">
<title>${doc.title}</title>
<style>
  :root {
    --ink: #1f1a14; --muted: #6b5f52; --paper: #fffdf8; --line: #e4dccd;
    --red: #c0392b; --cream: #f3ead8; --code: #f6f1e7;
  }
  @page {
    size: A4;
    margin: 20mm 16mm 18mm;
    @top-left { content: "${doc.title}"; font: 8pt "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif; color: #8a7d6e; }
    @top-right { content: "H5-EMU"; font: 700 8pt sans-serif; color: #c0392b; letter-spacing: 0.08em; }
    @bottom-center { content: counter(page) " / " counter(pages); font: 8pt sans-serif; color: #8a7d6e; }
  }
  @page :first { margin: 0; @top-left { content: none; } @top-right { content: none; } @bottom-center { content: none; } }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0; color: var(--ink); background: #fff;
    font: 10.5pt/1.75 "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", "Noto Sans CJK TC", sans-serif;
  }
  .cover {
    height: 297mm; padding: 34mm 22mm 24mm; background: var(--cream);
    display: flex; flex-direction: column; break-after: page;
  }
  .cover-kicker { font: 700 10pt/1 sans-serif; letter-spacing: 0.32em; color: #3d5a4a; }
  .cover-brand { margin: 10mm 0 0; font: 800 54pt/1 "Arial Black", "Microsoft JhengHei", sans-serif; letter-spacing: -0.02em; }
  .cover-brand span { color: var(--red); }
  .cover h1 { margin: 10mm 0 3mm; font-size: 28pt; line-height: 1.25; border: 0; padding: 0; }
  .cover-sub { font-size: 13pt; color: var(--muted); }
  .cover-rule { margin: 12mm 0 8mm; border-top: 2px solid var(--ink); }
  .cover-lead { font-size: 11pt; color: #3b332a; max-width: 150mm; }
  .cover-lead p { margin: 0 0 3mm; }
  .cover-meta { margin-top: auto; display: flex; gap: 14mm; font-size: 9.5pt; color: var(--muted); }
  .cover-meta strong { display: block; color: var(--ink); font-size: 11pt; }
  h2 {
    break-before: page; margin: 0 0 5mm; padding: 0 0 2.5mm;
    font-size: 19pt; line-height: 1.3; border-bottom: 2.5px solid var(--red);
  }
  h3 { margin: 7mm 0 2mm; font-size: 13pt; color: #3b332a; }
  h2 + h3 { margin-top: 3mm; }
  h3, h4 { break-after: avoid; }
  p { margin: 0 0 3mm; }
  ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
  li { margin: 0.8mm 0; }
  a { color: #a5281b; text-decoration: none; }
  strong { color: #111; }
  hr { display: none; }
  code {
    font: 9pt "Cascadia Mono", Consolas, "Microsoft JhengHei", monospace;
    background: var(--code); border: 1px solid var(--line); border-radius: 3px; padding: 0 3px;
  }
  pre { background: var(--code); border: 1px solid var(--line); border-radius: 6px; padding: 3mm 4mm; break-inside: avoid; }
  pre code { border: 0; padding: 0; background: none; }
  table { width: 100%; border-collapse: collapse; margin: 2mm 0 5mm; font-size: 9.5pt; break-inside: auto; }
  tr { break-inside: avoid; }
  th, td { border: 1px solid var(--line); padding: 1.8mm 2.5mm; vertical-align: top; text-align: left; }
  thead th { background: #efe5d2; }
  tbody tr:nth-child(even) td { background: #fbf8f2; }
  img { display: block; max-width: 100%; max-height: 225mm; margin: 2mm auto 5mm; object-fit: contain; break-inside: avoid;
        border: 1px solid var(--line); border-radius: 4px; }
  td img { margin: 0 auto; max-height: 190mm; }
  /* 架構圖較高：限制高度，讓圖和說明文字盡量在同一頁 */
  img[src*="architecture/"] { max-height: 165mm; }
  /* 電腦版截圖縮小一點，一頁可以放兩張 */
  img[src*="manual/d-"] { max-width: 84%; }
  /* 小標題、說明文字與緊接的圖片盡量不要被拆到兩頁 */
  h3 + p, h3 + ul, p:has(+ p > img), p:has(+ table img) { break-after: avoid; }
  /* 手機截圖兩欄並排的表格：去掉表格框線，讓它看起來像圖片組 */
  table:has(td img) td { border: 0; background: none !important; text-align: center; font-size: 9pt; color: var(--muted); }
  table:has(td img) { break-inside: avoid; }
  .alert { margin: 3mm 0 5mm; padding: 3mm 4mm; border-left: 4px solid; border-radius: 4px; break-inside: avoid; }
  .alert p { margin: 0; }
  .alert-title { font-weight: 700; margin-bottom: 1mm; }
  .alert-note, .alert-tip { border-color: #2f6fb3; background: #eef4fb; }
  .alert-important { border-color: #7b4bc2; background: #f4effb; }
  .alert-warning { border-color: #c9862a; background: #fdf5e8; }
</style>
</head>
<body>
  <section class="cover">
    <div class="cover-kicker">RETRO GAMES MAGAZINE</div>
    <div class="cover-brand"><span>H5</span>-EMU</div>
    <h1>${doc.title}</h1>
    <div class="cover-sub">${doc.subtitle}</div>
    <div class="cover-rule"></div>
    <div class="cover-lead">${lead}</div>
    <div class="cover-meta">
      <div><strong>${doc.audience}</strong>讀者</div>
      <div><strong>${today}</strong>匯出日期</div>
      <div><strong>${doc.source}</strong>原始文件</div>
    </div>
  </section>
  ${body}
</body>
</html>`;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : { channel: 'chrome' });
  const workDir = join(tmpdir(), `h5emu-docs-pdf-${process.pid}`);
  mkdirSync(workDir, { recursive: true });
  try {
    const page = await browser.newPage();
    for (const doc of DOCUMENTS) {
      const markdown = readFileSync(join(docsDir, doc.source), 'utf8');
      const htmlPath = join(workDir, doc.source.replace(/\.md$/, '.html'));
      writeFileSync(htmlPath, buildHtml(doc, markdown, today));
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
      await page.evaluate(() => Promise.all(Array.from(document.images, (img) => img.decode().catch(() => {}))));
      const missing = await page.evaluate(() => Array.from(document.images).filter((img) => !img.naturalWidth).map((img) => img.getAttribute('src')));
      if (missing.length) throw new Error(`${doc.source} 有圖片讀不到：${missing.join(', ')}`);
      const target = join(outDir, doc.output);
      await page.pdf({ path: target, format: 'A4', printBackground: true, preferCSSPageSize: true, outline: true, tagged: true });
      console.log(`✓ ${doc.source} → docs/pdf/${doc.output}`);
    }
  } finally {
    await browser.close();
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
