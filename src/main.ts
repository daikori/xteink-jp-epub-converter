import './style.css';

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
        <p class="lead">Xteink には、行頭が2文字分下がる、ルビが表示されない、改行が無視されるなどといった仕様があります。本ウェブアプリでは、これらの問題を解消するため、以下の内容でEPUBを変換します。</p>
        <ul class="feature-list" role="list">
          <li>ルビタグ を「漢字（かんじ）」のように変換します</li>
          <li>各 p タグ先頭の直後に空 span を追加します。これにより Xteink 側に p タグを誤認させ、行頭の字下げを文章側の行頭（全角スペース）で見るようにします</li>
          <li>空白行を挿入する目的で入れられた改行（ br タグ）を p タグ + 半角スペースに変換して、Xteink 側に改行として認識させます</li>
          <li>指定した EPUB はサーバーに保存しません。すべてブラウザで完結するようにしています</li>
          <li>青空文庫から直接作品を検索して変換するタブも利用できます</li>
        </ul>
      </section>

      <section class="panel card uploader-panel">
        <div class="section-head">
          <p class="kicker">変換</p>
          <h2>ソースを選ぶ</h2>
        </div>

        <div class="source-tabs" role="tablist" aria-label="ソース選択">
          <button class="tab-btn tab-btn--active" role="tab" aria-selected="true"
            aria-controls="tab-panel-epub" id="tab-epub" data-tab="epub">
            EPUBファイル
          </button>
          <button class="tab-btn" role="tab" aria-selected="false"
            aria-controls="tab-panel-aozora" id="tab-aozora" data-tab="aozora">
            青空文庫から取得
          </button>
        </div>

        <div id="tab-panel-epub" role="tabpanel" aria-labelledby="tab-epub" class="tab-panel">
          <label class="dropzone" id="dropzone">
            <input id="fileInput" type="file" accept=".epub,application/epub+zip" />
            <span class="dropzone-title">ここにEPUBをドロップ、またはクリックしてください</span>
            <span class="dropzone-subtitle">推奨サイズは50MB以下</span>
          </label>
          <div class="selected-file" id="selectedFile" hidden></div>
        </div>

        <div id="tab-panel-aozora" role="tabpanel" aria-labelledby="tab-aozora" class="tab-panel" hidden>
          <div class="aozora-search">
            <div class="aozora-search-row">
              <input id="aozoraQuery" type="search"
                placeholder="作品名・著者名で検索（例：坊っちゃん、夏目漱石）"
                class="aozora-input" />
              <button id="aozoraSearchBtn" type="button" class="btn btn-secondary">検索</button>
            </div>
            <div id="aozoraStatus" class="aozora-status" hidden></div>
            <div id="aozoraResults" class="aozora-results" hidden></div>
            <div id="aozoraSelected" class="aozora-selected-work" hidden>
              <p class="kicker">選択中の作品</p>
              <p id="aozoraSelectedTitle" class="aozora-selected-title"></p>
              <p id="aozoraSelectedAuthor" class="aozora-selected-author"></p>
            </div>
          </div>
        </div>

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
          <li>青空文庫タブ使用時は、青空文庫の利用規約および著作権法に従ってご利用ください</li>
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

// ── Theme toggle ──────────────────────────────────────────────
(function setupTheme() {
  const root = document.documentElement;
  const btn = document.querySelector<HTMLButtonElement>('[data-theme-toggle]')!;
  const saved = localStorage.getItem('theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  root.dataset.theme = saved;
  btn.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    localStorage.setItem('theme', next);
  });
})();

// ── Tab switching ─────────────────────────────────────────────
const tabBtns = document.querySelectorAll<HTMLButtonElement>('.tab-btn');
const tabPanels = document.querySelectorAll<HTMLElement>('.tab-panel');
let activeTab: 'epub' | 'aozora' = 'epub';

tabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab as 'epub' | 'aozora';
    if (tab === activeTab) return;
    activeTab = tab;
    tabBtns.forEach((b) => {
      const isActive = b.dataset.tab === tab;
      b.classList.toggle('tab-btn--active', isActive);
      b.setAttribute('aria-selected', String(isActive));
    });
    tabPanels.forEach((panel) => { panel.hidden = !panel.id.endsWith(tab); });
    updateConvertButton();
  });
});

// ── EPUB file handling ────────────────────────────────────────
const fileInput = document.querySelector<HTMLInputElement>('#fileInput')!;
const dropzone = document.querySelector<HTMLLabelElement>('#dropzone')!;
const selectedFileEl = document.querySelector<HTMLDivElement>('#selectedFile')!;
let selectedFile: File | null = null;

function handleFile(file: File) {
  if (!file.name.toLowerCase().endsWith('.epub')) { alert('EPUBファイルを選択してください。'); return; }
  selectedFile = file;
  selectedFileEl.hidden = false;
  selectedFileEl.textContent = `選択中: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
  updateConvertButton();
}

fileInput.addEventListener('change', () => { if (fileInput.files?.[0]) handleFile(fileInput.files[0]); });
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('is-dragging'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragging'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('is-dragging');
  if (e.dataTransfer?.files[0]) handleFile(e.dataTransfer.files[0]);
});

// ── Aozora Bunko search (CSV index) ──────────────────────────
//
// ZIP取得優先順位:
//   1. /aozora_list.zip  (public/ にバンドルされた同梱ファイル、CORS不要)
//   2. allorigins.win プロキシ経由で青空文庫から直接取得（フォールバック）
//
// CSV: list_person_all_extended_utf8.csv (UTF-8 BOM付き)
//   col 0:  作品ID
//   col 1:  作品名
//   col 13: 図書カードURL
//   col 15: 姓
//   col 16: 名
//   col 45: テキストファイルURL
//   col 50: XHTML/HTMLファイルURL

const AOZORA_CSV_ZIP_BUNDLED = '/aozora_list.zip';
const AOZORA_CSV_ZIP_URL =
  'https://www.aozora.gr.jp/index_pages/list_person_all_extended_utf8.zip';
const AOZORA_CSV_ZIP_PROXY =
  `https://api.allorigins.win/raw?url=${encodeURIComponent(AOZORA_CSV_ZIP_URL)}`;

interface AozoraBook {
  title: string;
  author: string;
  card_url: string;
  xhtml_url?: string;
  zip_url?: string;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuote = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') { inQuote = true; }
      else if (ch === ',') { result.push(cur); cur = ''; }
      else { cur += ch; }
    }
  }
  result.push(cur);
  return result;
}

type CsvRow = string[];
let csvCache: CsvRow[] | null = null;
let csvLoadPromise: Promise<CsvRow[]> | null = null;

async function loadAozoraIndex(
  onProgress?: (msg: string) => void,
): Promise<CsvRow[]> {
  if (csvCache) return csvCache;
  if (csvLoadPromise) return csvLoadPromise;

  csvLoadPromise = (async () => {
    const { unzipSync } = await import('fflate');

    onProgress?.('青空文庫インデックスを読み込み中...');

    let buf: ArrayBuffer | null = null;
    try {
      const res = await fetch(AOZORA_CSV_ZIP_BUNDLED);
      if (res.ok) buf = await res.arrayBuffer();
    } catch { /* fall through */ }

    if (!buf) {
      onProgress?.('バンドル版の読み込みに失敗しました。外部から取得中... (約3MB)');
      const res = await fetch(AOZORA_CSV_ZIP_PROXY);
      if (!res.ok) throw new Error(`インデックス取得失敗: HTTP ${res.status}`);
      buf = await res.arrayBuffer();
    }

    onProgress?.('インデックスを解析中...');
    const entries = unzipSync(new Uint8Array(buf));
    const csvKey = Object.keys(entries).find((k) => k.endsWith('.csv'));
    if (!csvKey) throw new Error('ZIP内にCSVファイルが見つかりませんでした');

    let text = new TextDecoder('utf-8').decode(entries[csvKey]);
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const lines = text.split(/\r?\n/);
    const rows: CsvRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) rows.push(parseCsvLine(line));
    }
    csvCache = rows;
    return rows;
  })();

  return csvLoadPromise;
}

function searchFromCsv(rows: CsvRow[], query: string, limit = 20): AozoraBook[] {
  const q = query.toLowerCase();
  const results: AozoraBook[] = [];
  for (const cols of rows) {
    if (results.length >= limit) break;
    const title   = cols[1]  ?? '';
    const sei     = cols[15] ?? '';
    const mei     = cols[16] ?? '';
    const author  = `${sei}${mei}` || (cols[14] ?? '');
    const cardUrl = cols[13] ?? '';
    const xhtmlUrl = cols[50]?.trim() || '';
    const textUrl  = cols[45]?.trim() || '';

    if (title.toLowerCase().includes(q) || author.toLowerCase().includes(q)) {
      const book: AozoraBook = { title, author, card_url: cardUrl };
      if (xhtmlUrl) book.xhtml_url = xhtmlUrl;
      else if (textUrl) book.zip_url = textUrl;
      results.push(book);
    }
  }
  return results;
}

const aozoraQueryEl   = document.querySelector<HTMLInputElement>('#aozoraQuery')!;
const aozoraSearchBtn = document.querySelector<HTMLButtonElement>('#aozoraSearchBtn')!;
const aozoraStatusEl  = document.querySelector<HTMLDivElement>('#aozoraStatus')!;
const aozoraResultsEl = document.querySelector<HTMLDivElement>('#aozoraResults')!;
const aozoraSelectedEl       = document.querySelector<HTMLDivElement>('#aozoraSelected')!;
const aozoraSelectedTitleEl  = document.querySelector<HTMLParagraphElement>('#aozoraSelectedTitle')!;
const aozoraSelectedAuthorEl = document.querySelector<HTMLParagraphElement>('#aozoraSelectedAuthor')!;

let selectedAozoraBook: AozoraBook | null = null;

function setAozoraStatus(msg: string, show = true) {
  aozoraStatusEl.textContent = msg;
  aozoraStatusEl.hidden = !show;
}

function escHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function searchAozora(query: string): Promise<void> {
  setAozoraStatus('検索中...');
  aozoraResultsEl.hidden = true;
  aozoraResultsEl.innerHTML = '';

  let rows: CsvRow[];
  try {
    rows = await loadAozoraIndex((msg) => setAozoraStatus(msg));
  } catch (e) {
    setAozoraStatus(`エラー: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }

  const books = searchFromCsv(rows, query);

  if (!books.length) {
    setAozoraStatus('検索結果が見つかりませんでした。別のキーワードで試してください。');
    return;
  }

  setAozoraStatus(`${books.length} 件見つかりました`);
  aozoraResultsEl.hidden = false;
  aozoraResultsEl.innerHTML = books.map((book, i) =>
    `<button class="aozora-result-item" type="button" data-idx="${i}">
      <span class="aozora-result-title">${escHtml(book.title)}</span>
      <span class="aozora-result-author">${escHtml(book.author)}</span>
    </button>`
  ).join('');
  aozoraResultsEl.querySelectorAll<HTMLButtonElement>('.aozora-result-item').forEach((btn, i) => {
    btn.addEventListener('click', () => selectAozoraBook(books[i]));
  });
}

function selectAozoraBook(book: AozoraBook) {
  selectedAozoraBook = book;
  aozoraSelectedEl.hidden = false;
  aozoraSelectedTitleEl.textContent = book.title;
  aozoraSelectedAuthorEl.textContent = book.author;
  setAozoraStatus('作品を選択しました。「変換する」ボタンを押してください。');
  updateConvertButton();
}

aozoraSearchBtn.addEventListener('click', () => { const q = aozoraQueryEl.value.trim(); if (q) searchAozora(q); });
aozoraQueryEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const q = aozoraQueryEl.value.trim(); if (q) searchAozora(q); } });

// ── Options ────────────────────────────────────────────────────
const rubyToggle = document.querySelector<HTMLInputElement>('#rubyToggle')!;
const spanToggle = document.querySelector<HTMLInputElement>('#spanToggle')!;
const brToggle = document.querySelector<HTMLInputElement>('#brToggle')!;
const coverNoneRadio = document.querySelector<HTMLInputElement>('#coverNone')!;
const coverGenerateRadio = document.querySelector<HTMLInputElement>('#coverGenerate')!;
const coverGeneratePanel = document.querySelector<HTMLElement>('#coverGeneratePanel')!;
const previewCoverBtn = document.querySelector<HTMLButtonElement>('#previewCoverBtn')!;
const coverPreviewWrap = document.querySelector<HTMLElement>('#coverPreviewWrap')!;
const coverCanvas = document.querySelector<HTMLCanvasElement>('#coverCanvas')!;
const coverPreviewMeta = document.querySelector<HTMLParagraphElement>('#coverPreviewMeta')!;

[coverNoneRadio, coverGenerateRadio].forEach((r) =>
  r.addEventListener('change', () => { coverGeneratePanel.hidden = !coverGenerateRadio.checked; })
);

// ── Cover generation ───────────────────────────────────────────
const COVER_W = 768, COVER_H = 1280;

function getBookTitle(): string {
  if (activeTab === 'aozora' && selectedAozoraBook) return selectedAozoraBook.title;
  if (selectedFile) return selectedFile.name.replace(/\.epub$/i, '');
  return 'タイトル';
}

function getBookAuthor(): string {
  if (activeTab === 'aozora' && selectedAozoraBook) return selectedAozoraBook.author;
  return '';
}

// author が空文字列の場合は著者行を描画しない
function renderCoverToCanvas(canvas: HTMLCanvasElement, title: string, author: string): void {
  canvas.width = COVER_W; canvas.height = COVER_H;
  const ctx2d = canvas.getContext('2d')!;
  const isDark = document.documentElement.dataset.theme === 'dark';
  const bg = isDark ? '#171614' : '#f7f6f2';
  const fg = isDark ? '#d2d0cb' : '#28251d';
  const accent = isDark ? '#4f98a3' : '#01696f';

  ctx2d.fillStyle = bg; ctx2d.fillRect(0, 0, COVER_W, COVER_H);
  ctx2d.fillStyle = accent; ctx2d.fillRect(0, 0, 12, COVER_H);

  // タイトル：中央附近に描画。著者名がある場合は少し上にシフト
  const titleY = author ? COVER_H / 2 - 60 : COVER_H / 2;
  ctx2d.fillStyle = fg;
  ctx2d.font = `bold 72px "Hiragino Mincho ProN", "Yu Mincho", serif`;
  ctx2d.textAlign = 'center';
  wrapText(ctx2d, title, COVER_W / 2, titleY, COVER_W - 120, 90);

  // 著者名描画
  if (author) {
    ctx2d.fillStyle = fg;
    ctx2d.font = `500 44px "Hiragino Mincho ProN", "Yu Mincho", serif`;
    ctx2d.textAlign = 'center';
    ctx2d.fillText(author, COVER_W / 2, titleY + 90 * Math.ceil(title.length / 10) + 80);
  }

  // フッター
  ctx2d.fillStyle = accent;
  ctx2d.font = `500 28px Inter, system-ui, sans-serif`;
  ctx2d.textAlign = 'center';
  ctx2d.fillText('Xteink JP EPUB Converter', COVER_W / 2, COVER_H - 80);
}

function wrapText(ctx2d: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const lines: string[] = [];
  let line = '';
  for (const ch of [...text]) {
    const test = line + ch;
    if (ctx2d.measureText(test).width > maxWidth && line) { lines.push(line); line = ch; }
    else line = test;
  }
  if (line) lines.push(line);
  const startY = y - (lines.length * lineHeight) / 2 + lineHeight / 2;
  lines.forEach((l, i) => ctx2d.fillText(l, x, startY + i * lineHeight));
}

previewCoverBtn.addEventListener('click', () => {
  renderCoverToCanvas(coverCanvas, getBookTitle(), getBookAuthor());
  coverPreviewWrap.hidden = false;
  coverPreviewMeta.textContent = `${COVER_W}×${COVER_H}px`;
});

// ── Convert button state ───────────────────────────────────────
const convertButton  = document.querySelector<HTMLButtonElement>('#convertButton')!;
const downloadButton = document.querySelector<HTMLButtonElement>('#downloadButton')!;
const statusText     = document.querySelector<HTMLSpanElement>('#statusText')!;
const progressPercent = document.querySelector<HTMLSpanElement>('#progressPercent')!;
const progressFill   = document.querySelector<HTMLDivElement>('#progressFill')!;

function setStatus(msg: string, pct?: number) {
  statusText.textContent = msg;
  if (pct !== undefined) { progressPercent.textContent = `${Math.round(pct)}%`; progressFill.style.width = `${pct}%`; }
}

function updateConvertButton() {
  if (activeTab === 'epub') {
    convertButton.disabled = !selectedFile;
    if (!selectedFile) setStatus('EPUBを選択してください');
  } else {
    convertButton.disabled = !selectedAozoraBook;
    if (!selectedAozoraBook) setStatus('青空文庫から作品を選択してください');
  }
}

// ── Worker management ──────────────────────────────────────────
let currentWorker: Worker | null = null;
let resultBlob: Blob | null = null;
let resultFileName = '';

function terminateWorker() { if (currentWorker) { currentWorker.terminate(); currentWorker = null; } }

function buildWorker(): Worker {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
}

function buildOptions() {
  return {
    convertRuby: rubyToggle.checked,
    addEmptySpan: spanToggle.checked,
    convertBrToEmptyP: brToggle.checked,
    cover: coverGenerateRadio.checked
      ? { mode: 'generate' as const, imageBuffer: null as unknown as ArrayBuffer, imageType: 'image/jpeg' }
      : { mode: 'none' as const },
  };
}

async function canvasToJpegBuffer(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('canvas.toBlob failed')); return; }
      blob.arrayBuffer().then(resolve).catch(reject);
    }, 'image/jpeg', 0.92);
  });
}

// ── Convert – EPUB file ────────────────────────────────────────
async function convertEpubFile() {
  if (!selectedFile) return;
  terminateWorker();
  convertButton.disabled = true; downloadButton.disabled = true; resultBlob = null;
  setStatus('準備中...', 0);
  const options = buildOptions();
  if (coverGenerateRadio.checked) {
    renderCoverToCanvas(coverCanvas, getBookTitle(), getBookAuthor());
    await new Promise<void>((r) => setTimeout(r, 0));
    const imgBuffer = await canvasToJpegBuffer(coverCanvas);
    (options.cover as { mode: 'generate'; imageBuffer: ArrayBuffer; imageType: string }).imageBuffer = imgBuffer;
  }
  const fileBuffer = await selectedFile.arrayBuffer();
  const worker = buildWorker();
  currentWorker = worker;
  worker.onmessage = handleWorkerMessage;
  worker.onerror = (e) => { setStatus(`エラー: ${e.message}`, 0); convertButton.disabled = false; terminateWorker(); };
  const transfers: ArrayBuffer[] = [fileBuffer];
  if (options.cover.mode === 'generate' && options.cover.imageBuffer) transfers.push(options.cover.imageBuffer);
  worker.postMessage({ type: 'process', payload: { fileName: selectedFile.name, fileBuffer, options } }, transfers);
}

// ── Convert – Aozora Bunko ─────────────────────────────────────
async function convertAozora() {
  if (!selectedAozoraBook) return;
  terminateWorker();
  convertButton.disabled = true; downloadButton.disabled = true; resultBlob = null;

  const book = selectedAozoraBook;

  if (!book.xhtml_url && !book.zip_url) {
    setStatus('この作品に本文ファイルが見つかりませんでした。', 0);
    convertButton.disabled = false;
    return;
  }

  let xhtmlContent = '';
  try {
    if (book.xhtml_url) {
      setStatus('青空文庫からXHTMLを取得中...', 3);
      xhtmlContent = await fetchTextViaProxyChain(book.xhtml_url);
    } else if (book.zip_url) {
      setStatus('青空文庫からZIPを取得中...', 3);
      xhtmlContent = await fetchHtmlFromZip(book.zip_url);
    }
    if (!xhtmlContent) throw new Error('本文コンテンツが空でした');
  } catch (e) {
    setStatus(`取得エラー: ${e instanceof Error ? e.message : String(e)}`, 0);
    convertButton.disabled = false;
    return;
  }

  setStatus('EPUB変換中...', 10);
  const options = buildOptions();
  if (coverGenerateRadio.checked) {
    renderCoverToCanvas(coverCanvas, getBookTitle(), getBookAuthor());
    await new Promise<void>((r) => setTimeout(r, 0));
    const imgBuffer = await canvasToJpegBuffer(coverCanvas);
    (options.cover as { mode: 'generate'; imageBuffer: ArrayBuffer; imageType: string }).imageBuffer = imgBuffer;
  }
  const worker = buildWorker();
  currentWorker = worker;
  worker.onmessage = handleWorkerMessage;
  worker.onerror = (e) => { setStatus(`エラー: ${e.message}`, 0); convertButton.disabled = false; terminateWorker(); };
  const transfers: ArrayBuffer[] = [];
  if (options.cover.mode === 'generate' && options.cover.imageBuffer) transfers.push(options.cover.imageBuffer);
  worker.postMessage(
    { type: 'build_aozora', payload: { xhtmlContent, title: book.title, author: book.author, options } },
    transfers
  );
}

// ── Proxy chain for HTML fetch ──────────────────────────────────
//
// 青空文庫のHTMLはCORS非対応なので、複数のプロキシをチェーンする。
// 優先順:
//   1. 直接 fetch（同オリジン・ CDNキャッシュがあれば成功することもあるため一応試みるが通常はCORSエラー）
//   2. corsproxy.io  → レスポンスをそのままテキストとして返す
//   3. allorigins /raw → バイナリ山に使うエンドポイントだがテキストもOK
//   4. allorigins /get → JSONラッパー・ .contentsを取り出す

async function fetchTextViaProxyChain(url: string): Promise<string> {
  // 1. 直接試み（失敗してもエラーを引かない）
  try {
    const res = await fetch(url);
    if (res.ok) return await res.text();
  } catch { /* CORS NG → fall through */ }

  // 2. corsproxy.io
  try {
    const res = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(url)}`);
    if (res.ok) return await res.text();
  } catch { /* fall through */ }

  // 3. allorigins /raw
  try {
    const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
    if (res.ok) return await res.text();
  } catch { /* fall through */ }

  // 4. allorigins /get (最終手段、JSONラッパー)
  const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`すべてのプロキシで取得失敗しました (HTTP ${res.status})`);
  const data = await res.json() as { contents: string | null };
  if (!data.contents) throw new Error('プロキシから空のレスポンスが返ってきました');
  return data.contents;
}

// ZIP を展開して .html / .xhtml を取り出す
async function fetchHtmlFromZip(zipUrl: string): Promise<string> {
  const { unzipSync } = await import('fflate');
  // ZIPはRAWバイナリなのでプロキシチェーンで取得
  let buf: ArrayBuffer | null = null;

  // corsproxy.io (raw binary対応)
  try {
    const res = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(zipUrl)}`);
    if (res.ok) buf = await res.arrayBuffer();
  } catch { /* fall through */ }

  // allorigins /raw
  if (!buf) {
    try {
      const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(zipUrl)}`);
      if (res.ok) buf = await res.arrayBuffer();
    } catch { /* fall through */ }
  }

  if (!buf) throw new Error('ZIPの取得に失敗しました');

  const entries = unzipSync(new Uint8Array(buf));
  const htmlKey = Object.keys(entries).find((k) => /\.(html|xhtml)$/i.test(k));
  if (!htmlKey) throw new Error('ZIP内にHTML/XHTMLファイルが見つかりませんでした');
  return new TextDecoder('utf-8').decode(entries[htmlKey]);
}

// ── Worker message handler ─────────────────────────────────────
function handleWorkerMessage(event: MessageEvent) {
  const { type, payload } = event.data;
  if (type === 'progress') { setStatus(payload.message, payload.progress); return; }
  if (type === 'done') {
    resultBlob = payload.blob; resultFileName = payload.fileName;
    const s = payload.summary;
    document.querySelector<HTMLElement>('#statHtml')!.textContent  = String(s.htmlFiles);
    document.querySelector<HTMLElement>('#statRuby')!.textContent  = String(s.rubyConversions);
    document.querySelector<HTMLElement>('#statSpan')!.textContent  = String(s.spanInsertions);
    document.querySelector<HTMLElement>('#statBr')!.textContent    = String(s.brConversions);
    document.querySelector<HTMLElement>('#statWarn')!.textContent  = String(s.warnings.length);
    const logLines = [...s.logs, ...(s.warnings.length ? ['', '--- 警告 ---', ...s.warnings] : [])];
    document.querySelector<HTMLElement>('#logBox')!.textContent = logLines.join('\n') || '(ログなし)';
    setStatus('完了！ダウンロードボタンを押してください', 100);
    convertButton.disabled = false; downloadButton.disabled = false;
    terminateWorker(); return;
  }
  if (type === 'error') { setStatus(`エラー: ${payload.message}`, 0); convertButton.disabled = false; terminateWorker(); }
}

// ── Convert button ─────────────────────────────────────────────
convertButton.addEventListener('click', () => {
  if (activeTab === 'epub') convertEpubFile();
  else convertAozora();
});

// ── Download ───────────────────────────────────────────────────
downloadButton.addEventListener('click', () => {
  if (!resultBlob) return;
  const url = URL.createObjectURL(resultBlob);
  const a = document.createElement('a');
  a.href = url; a.download = resultFileName; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});
