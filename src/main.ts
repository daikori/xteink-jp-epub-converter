import './style.css';
import { unzipSync } from 'fflate';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root not found');

app.innerHTML = `
  <a class="skip-link" href="#main">本文へスキップ</a>
  <div class="shell">
    <header class="header">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4">
            <rect x="8" y="6" width="24" height="36" rx="4"></rect>
            <path d="M18 14v20M24 14v20"></path>
            <path d="M36 12v24"></path>
          </svg>
        </div>
        <div>
          <p class="eyebrow">Browser-only EPUB tool</p>
          <h1>Xteink JP EPUB Converter</h1>
        </div>
      </div>
      <button class="theme-toggle" type="button" data-theme-toggle aria-label="Switch theme">
        <span class="theme-icon">◐</span>
      </button>
    </header>

    <main id="main" class="main-grid">
      <section class="hero card">
        <p class="kicker">これはなに？</p>
        <h2>EPUBの行頭文字下げ、ルビ表示ができるよう変換します</h2>
        <p class="lead">Xteink には、行頭が2文字分下がる、ルビが表示されない、改行が無視されるなどといった仕様があります。本Webアプリでは、これらの問題を解消するため、以下の内容でEPUBを変換します。</p>
        <ul class="feature-list" role="list">
          <li>ルビタグ を「漢字（かんじ）」のように変換します</li>
          <li>各 p タグ先頭の直後に空 span を追加します。これにより Xteink 側に p タグを誤認させ、行頭の字下げを文章側の行頭（全角スペース）で見るようにします</li>
          <li>空白行を挿入する目的で入れられた改行（ br タグ）を p タグ + 半角スペースに変換して、Xteink 側に改行として認識させます</li>
          <li>指定した EPUB はサーバーに保存しません。すべてブラウザで完結するようにしています</li>
        </ul>
      </section>

      <section class="panel card uploader-panel">
        <div class="section-head">
          <p class="kicker">変換</p>
          <h2>EPUB を指定する</h2>
        </div>
        <label class="dropzone" id="dropzone">
          <input id="fileInput" type="file" accept=".epub,application/epub+zip" />
          <span class="dropzone-title">ここにEPUBをドロップ、またはクリックしてください</span>
          <span class="dropzone-subtitle">推奨サイズは50MB以下</span>
        </label>
        <div class="selected-file" id="selectedFile" hidden></div>
        <div class="toggles">
          <label class="toggle"><input id="rubyToggle" type="checkbox" checked />ルビを括弧書きへ変換</label>
          <label class="toggle"><input id="spanToggle" type="checkbox" checked />p先頭に空spanを追加</label>
          <label class="toggle"><input id="brToggle" type="checkbox" checked />&lt;br&gt;タグを空白行に変換</label>
        </div>

        <div class="cover-section">
          <p class="kicker">表紙設定</p>
          <div class="cover-modes">
            <label class="toggle">
              <input type="radio" name="coverMode" value="none" id="coverNone" checked />
              設定しない
            </label>
            <label class="toggle">
              <input type="radio" name="coverMode" value="generate" id="coverGenerate" />
              タイトルから自動生成
            </label>
          </div>
          <div class="cover-generate-panel" id="coverGeneratePanel" hidden>
            <button type="button" class="btn btn-secondary" id="previewCoverBtn">プレビューを表示</button>
            <div class="cover-preview-wrap" id="coverPreviewWrap" hidden>
              <canvas id="coverCanvas" class="cover-canvas"></canvas>
              <p class="cover-preview-meta" id="coverPreviewMeta"></p>
            </div>
          </div>
        </div>

        <div class="actions">
          <button id="convertButton" class="btn btn-primary" type="button" disabled>変換する</button>
          <button id="downloadButton" class="btn btn-secondary" type="button" disabled>ダウンロード</button>
        </div>
        <div class="progress-block" aria-live="polite">
          <div class="progress-meta">
            <span id="statusText">EPUBを選択してください</span>
            <span id="progressPercent">0%</span>
          </div>
          <div class="progress-bar"><div id="progressFill"></div></div>
        </div>
      </section>

      <section class="panel card stats-panel">
        <div class="section-head">
          <p class="kicker">結果</p>
          <h2>変換サマリ</h2>
        </div>
        <div class="stats-grid">
          <article class="stat"><span class="stat-label">HTML/XHTML</span><strong id="statHtml">0</strong></article>
          <article class="stat"><span class="stat-label">Ruby変換</span><strong id="statRuby">0</strong></article>
          <article class="stat"><span class="stat-label">Span追加</span><strong id="statSpan">0</strong></article>
          <article class="stat"><span class="stat-label">br変換</span><strong id="statBr">0</strong></article>
          <article class="stat"><span class="stat-label">警告</span><strong id="statWarn">0</strong></article>
        </div>
        <div class="log-wrap">
          <h3>ログ</h3>
          <pre id="logBox">まだ処理をしていません。</pre>
        </div>
      </section>

      <section class="panel card notes-panel">
        <div class="section-head">
          <p class="kicker">詳細仕様</p>
          <h2>このツールについて</h2>
        </div>
        <ul class="notes" role="list">
          <li>処理対象は EPUB 内の .xhtml / .html / .htm　となります</li>
          <li>mimetype は先頭かつ無圧縮で再格納するようにしています</li>
          <li>壊れた文書はスキップし、可能な分だけ継続します</li>
          <li>ブラウザ内処理なので、サイズの大きい EPUB はブラウザが重くなる場合があります</li>
          <li>このサイトを利用することに伴ういかなる不利益において、サイト側は一切責任を負いませんのでご注意ください</li>
          <li>EPUB ファイルを変換するので、EPUB の著作権、著作者人格権（同一性保持権等）、出版権、ライセンス条件その他関連する権利関係は、すべて利用者自身の責任でお願いします</li>
          <li>ソースコードは <a href="https://github.com/daikori/xteink-jp-epub-converter" target="_blank" rel="noopener noreferrer">GitHub</a> で公開しています</li>
        </ul>
      </section>
    </main>

    <footer class="footer">
      <p>© 2026 daikori — <a href="https://github.com/daikori/xteink-jp-epub-converter" target="_blank" rel="noopener noreferrer">GitHub</a></p>
    </footer>
  </div>
`;

const fileInput = document.querySelector<HTMLInputElement>('#fileInput')!;
const dropzone = document.querySelector<HTMLLabelElement>('#dropzone')!;
const selectedFile = document.querySelector<HTMLDivElement>('#selectedFile')!;
const convertButton = document.querySelector<HTMLButtonElement>('#convertButton')!;
const downloadButton = document.querySelector<HTMLButtonElement>('#downloadButton')!;
const rubyToggle = document.querySelector<HTMLInputElement>('#rubyToggle')!;
const spanToggle = document.querySelector<HTMLInputElement>('#spanToggle')!;
const brToggle = document.querySelector<HTMLInputElement>('#brToggle')!;
const statusText = document.querySelector<HTMLSpanElement>('#statusText')!;
const progressPercent = document.querySelector<HTMLSpanElement>('#progressPercent')!;
const progressFill = document.querySelector<HTMLDivElement>('#progressFill')!;
const statHtml = document.querySelector<HTMLElement>('#statHtml')!;
const statRuby = document.querySelector<HTMLElement>('#statRuby')!;
const statSpan = document.querySelector<HTMLElement>('#statSpan')!;
const statBr = document.querySelector<HTMLElement>('#statBr')!;
const statWarn = document.querySelector<HTMLElement>('#statWarn')!;
const logBox = document.querySelector<HTMLElement>('#logBox')!;
const coverGeneratePanel = document.querySelector<HTMLDivElement>('#coverGeneratePanel')!;
const previewCoverBtn = document.querySelector<HTMLButtonElement>('#previewCoverBtn')!;
const coverPreviewWrap = document.querySelector<HTMLDivElement>('#coverPreviewWrap')!;
const coverCanvas = document.querySelector<HTMLCanvasElement>('#coverCanvas')!;
const coverPreviewMeta = document.querySelector<HTMLParagraphElement>('#coverPreviewMeta')!;

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

let selected: File | null = null;
let outputBlob: Blob | null = null;
let outputName = '';
let epubTitle = '';
let epubAuthor = '';

// ---- カバーモード ----
document.querySelectorAll<HTMLInputElement>('input[name="coverMode"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    const mode = (document.querySelector<HTMLInputElement>('input[name="coverMode"]:checked'))?.value ?? 'none';
    coverGeneratePanel.hidden = mode !== 'generate';
  });
});

// ---- EPUBメタデータ取得 ----
async function extractMetaFromEpub(file: File): Promise<{ title: string; author: string }> {
  try {
    const buf = await file.arrayBuffer();
    const entries = unzipSync(new Uint8Array(buf));

    // container.xml からOPFパスを取得
    const containerBytes = entries['META-INF/container.xml'];
    if (!containerBytes) return { title: '', author: '' };
    const containerXml = new TextDecoder().decode(containerBytes);
    const opfPathMatch = containerXml.match(/full-path=["']([^"']+\.opf)["']/i);
    if (!opfPathMatch) return { title: '', author: '' };

    const opfBytes = entries[opfPathMatch[1]];
    if (!opfBytes) return { title: '', author: '' };
    const opfXml = new TextDecoder().decode(opfBytes);

    const titleMatch = opfXml.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
    const authorMatch = opfXml.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);

    return {
      title: titleMatch?.[1]?.trim() ?? '',
      author: authorMatch?.[1]?.trim() ?? ''
    };
  } catch {
    return { title: '', author: '' };
  }
}

// ---- 背景パターン ----
type PatternFn = (ctx: CanvasRenderingContext2D, W: number, H: number) => void;

const bgPatterns: PatternFn[] = [
  // 0: シンプル無地
  (ctx, W, H) => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); },
  // 1: 縦ストライプ
  (ctx, W, H) => {
    ctx.fillStyle = '#fafafa'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  },
  // 2: 斜めストライプ
  (ctx, W, H) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.lineWidth = 1;
    for (let i = -H; i < W + H; i += 28) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke(); }
  },
  // 3: ドット
  (ctx, W, H) => {
    ctx.fillStyle = '#fafafa'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    const step = 32;
    for (let x = step / 2; x < W; x += step)
      for (let y = step / 2; y < H; y += step) { ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill(); }
  },
  // 4: クロスハッチ
  (ctx, W, H) => {
    ctx.fillStyle = '#fafafa'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1;
    const step = 32;
    for (let x = 0; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  },
  // 5: ボーダーフレーム
  (ctx, W, H) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, W - 40, H - 40);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
    ctx.strokeRect(28, 28, W - 56, H - 56);
  },
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const char of text) {
    const test = current + char;
    if (ctx.measureText(test).width > maxWidth && current.length > 0) {
      lines.push(current);
      current = char;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawCoverToCanvas(canvas: HTMLCanvasElement, title: string, author: string): void {
  const W = 480, H = 800;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const seed = hashString(title || 'untitled');
  bgPatterns[seed % bgPatterns.length](ctx, W, H);

  // デコレーションライン
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(48, 80); ctx.lineTo(W - 48, 80); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(48, H - 110); ctx.lineTo(W - 48, H - 110); ctx.stroke();

  // タイトル描画：行数を計算しながらフォントサイズを動的に決定
  const displayTitle = title || '（タイトルなし）';
  const maxWidth = W - 96;
  const FONT_BASE = `'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic', sans-serif`;
  let fontSize = displayTitle.length <= 10 ? 52 : displayTitle.length <= 20 ? 42 : 34;
  let lines: string[] = [];
  while (fontSize >= 22) {
    ctx.font = `bold ${fontSize}px ${FONT_BASE}`;
    lines = wrapText(ctx, displayTitle, maxWidth);
    if (lines.length * fontSize * 1.5 <= H * 0.55) break;
    fontSize -= 4;
  }

  const lineHeight = fontSize * 1.5;
  const totalTextH = lines.length * lineHeight;
  const titleStartY = H * 0.38 - totalTextH / 2;

  // 文字背景帯（白半透明）
  const padX = 32, padY = 16;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  (ctx as CanvasRenderingContext2D & { roundRect: Function }).roundRect(
    W / 2 - maxWidth / 2 - padX,
    titleStartY - lineHeight / 2 - padY,
    maxWidth + padX * 2,
    totalTextH + padY * 2,
    8
  );
  ctx.fill();

  ctx.fillStyle = '#111111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${fontSize}px ${FONT_BASE}`;
  lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, titleStartY + i * lineHeight);
  });

  // 著者名
  if (author) {
    ctx.font = `20px ${FONT_BASE}`;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(author, W / 2, H - 68);
  }
}

async function getCoverBuffer(): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
  const mode = (document.querySelector<HTMLInputElement>('input[name="coverMode"]:checked'))?.value ?? 'none';
  if (mode !== 'generate') return null;

  const tmpCanvas = document.createElement('canvas');
  drawCoverToCanvas(tmpCanvas, epubTitle, epubAuthor);
  return new Promise((resolve) => {
    tmpCanvas.toBlob((blob) => {
      if (!blob) { resolve(null); return; }
      blob.arrayBuffer().then((buf) => resolve({ buffer: buf, mimeType: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  });
}

// ---- プレビューボタン ----
previewCoverBtn.addEventListener('click', () => {
  drawCoverToCanvas(coverCanvas, epubTitle, epubAuthor);
  coverPreviewWrap.hidden = false;
  const meta = epubTitle ? `「${epubTitle}」${epubAuthor ? ' / ' + epubAuthor : ''}` : '（タイトル未取得）';
  coverPreviewMeta.textContent = meta;
});

// ---- テーマ ----
function setTheme(initial?: 'light' | 'dark') {
  const root = document.documentElement;
  let mode = initial ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  root.dataset.theme = mode;
  const toggle = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
  toggle?.addEventListener('click', () => {
    mode = mode === 'dark' ? 'light' : 'dark';
    root.dataset.theme = mode;
  });
}
setTheme();

function setProgress(value: number, label: string) {
  const clamped = Math.max(0, Math.min(100, value));
  progressFill.style.width = `${clamped}%`;
  progressPercent.textContent = `${Math.round(clamped)}%`;
  statusText.textContent = label;
}

function setFile(file: File | null) {
  selected = file;
  outputBlob = null;
  downloadButton.disabled = true;
  epubTitle = '';
  epubAuthor = '';
  if (!file) {
    selectedFile.hidden = true;
    convertButton.disabled = true;
    setProgress(0, 'EPUBを選択してください');
    return;
  }
  selectedFile.hidden = false;
  selectedFile.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`;
  convertButton.disabled = false;
  setProgress(0, '変換準備OK。');

  // バックグラウンドでメタデータ取得
  extractMetaFromEpub(file).then(({ title, author }) => {
    epubTitle = title;
    epubAuthor = author;
  });
}

fileInput.addEventListener('change', () => setFile(fileInput.files?.[0] ?? null));

dropzone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropzone.classList.add('is-dragging');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragging'));
dropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropzone.classList.remove('is-dragging');
  const file = event.dataTransfer?.files?.[0] ?? null;
  if (file) setFile(file);
});

convertButton.addEventListener('click', async () => {
  if (!selected) return;
  convertButton.disabled = true;
  downloadButton.disabled = true;
  statHtml.textContent = '0';
  statRuby.textContent = '0';
  statSpan.textContent = '0';
  statBr.textContent = '0';
  statWarn.textContent = '0';
  logBox.textContent = '処理開始...';
  setProgress(2, 'ファイル読み込み中...');

  const cover = await getCoverBuffer();

  const buffer = await selected.arrayBuffer();
  const transferables: Transferable[] = [buffer];
  if (cover) transferables.push(cover.buffer);

  worker.postMessage({
    type: 'process',
    payload: {
      fileName: selected.name,
      fileBuffer: buffer,
      options: {
        convertRuby: rubyToggle.checked,
        addEmptySpan: spanToggle.checked,
        convertBrToEmptyP: brToggle.checked,
        cover: cover ? { mode: 'generate', imageBuffer: cover.buffer, imageType: cover.mimeType } : { mode: 'none' }
      }
    }
  }, transferables);
});

worker.addEventListener('message', (event: MessageEvent) => {
  const data = event.data as
    | { type: 'progress'; payload: { progress: number; message: string } }
    | { type: 'done'; payload: { blob: Blob; fileName: string; summary: { htmlFiles: number; rubyConversions: number; spanInsertions: number; brConversions: number; warnings: string[]; logs: string[] } } }
    | { type: 'error'; payload: { message: string } };

  if (data.type === 'progress') {
    setProgress(data.payload.progress, data.payload.message);
    return;
  }

  if (data.type === 'done') {
    outputBlob = data.payload.blob;
    outputName = data.payload.fileName;
    downloadButton.disabled = false;
    convertButton.disabled = false;
    setProgress(100, '変換完了。ダウンロードできます。');
    statHtml.textContent = String(data.payload.summary.htmlFiles);
    statRuby.textContent = String(data.payload.summary.rubyConversions);
    statSpan.textContent = String(data.payload.summary.spanInsertions);
    statBr.textContent = String(data.payload.summary.brConversions);
    statWarn.textContent = String(data.payload.summary.warnings.length);
    logBox.textContent = [...data.payload.summary.logs, ...data.payload.summary.warnings.map((w) => `WARN: ${w}`)].join('\n') || 'ログなし';
    return;
  }

  convertButton.disabled = false;
  setProgress(0, `エラー: ${data.payload.message}`);
  logBox.textContent = `ERROR: ${data.payload.message}\nEPUBが壊れている、またはサポート外の構造の可能性があります。`;
});

downloadButton.addEventListener('click', () => {
  if (!outputBlob) return;
  const url = URL.createObjectURL(outputBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = outputName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});
