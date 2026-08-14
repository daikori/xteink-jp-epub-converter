import './style.css';
import { unzipSync, zipSync, strToU8 } from 'fflate';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root not found');

app.innerHTML = `
  <div class="shell">
    <a class="skip-link" href="#main">本文へスキップ</a>
    <header class="header">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 4h11a5 5 0 0 1 5 5v11H9a5 5 0 0 1-5-5V4Z" stroke="currentColor" stroke-width="1.6"/>
            <path d="M8 9h8M8 13h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </span>
        <div>
          <p class="eyebrow">Xteink JP EPUB Converter</p>
          <h1>Xteink JP EPUB Converter</h1>
        </div>
      </div>
      <button class="theme-toggle" type="button" data-theme-toggle aria-label="テーマ切り替え">🌓</button>
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
          <li>最新ファームウェア（行頭を強制的に1字下げする設定に対応した端末）向けに、1セクションを1つの p タグへまとめる字下げ方式と、&lt;p&gt;&lt;br /&gt;&lt;/p&gt; による改行方式を、それぞれ有効化チェックと方式選択で切り替えられます</li>
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
        </div>
        <label class="toggle"><input id="indentModeEnable" type="checkbox" checked />字下げオプションを有効にする</label>
        <fieldset class="option-group">
          <legend>字下げ方式</legend>
          <label class="toggle"><input type="radio" name="indentMode" value="legacy" checked />従来方式（pタグ先頭に空 spanを追加）</label>
          <label class="toggle"><input type="radio" name="indentMode" value="newFirmware" />新ファームウェア対応（1セクションを1つのpタグにまとめ、行末に&lt;br /&gt;を追加）</label>
        </fieldset>
        <label class="toggle"><input id="brModeEnable" type="checkbox" checked />改行オプションを有効にする</label>
        <fieldset class="option-group">
          <legend>改行方式（pタグ外の&lt;br&gt;タグ）</legend>
          <label class="toggle"><input type="radio" name="brMode" value="legacy" checked />従来方式（&lt;p&gt; &lt;/p&gt; に変換）</label>
          <label class="toggle"><input type="radio" name="brMode" value="newFirmware" />新ファームウェア対応（&lt;p&gt;　&lt;br /&gt;&lt;/p&gt; に変換）</label>
        </fieldset>

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
        <div class="progress-block">
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
          <article class="stat"><span class="stat-label">字下げ処理</span><strong id="statIndent">0</strong></article>
          <article class="stat"><span class="stat-label">br変換</span><strong id="statBr">0</strong></article>
          <article class="stat"><span class="stat-label">警告</span><strong id="statWarn">0</strong></article>
        </div>
        <div class="log-wrap">
          <p class="kicker">ログ</p>
          <pre id="logBox">まだ変換していません。</pre>
        </div>
      </section>

      <section class="panel card notes-panel">
        <div class="section-head">
          <p class="kicker">注意事項</p>
          <h2>ご利用にあたって</h2>
        </div>
        <ul class="notes" role="list">
          <li>mimetype は先頭かつ無圧縮で再格納するようにしています</li>
          <li>壊れた文書はスキップし、可能な分だけ継続します</li>
          <li>ブラウザ内処理なので、サイズの大きい EPUB はブラウザが重くなる場合があります</li>
          <li>青空文庫タブ使用時は、青空文庫の利用規約および著作権法に従ってご利用ください</li>
          <li>このサイトを利用することに伴ういかなる不利益においても、サイト側は一切責任を負いませんのでご注意ください</li>
          <li>EPUB ファイルを変換するので、EPUB の著作権、著作者人格権（同一性保持権等）、出版権、ライセンス条件その他関連する権利関係は、すべて利用者自身の責任でお願いします</li>
          <li>ソースコードは <a href="https://github.com/daikori/xteink-jp-epub-converter" target="_blank" rel="noopener noreferrer">GitHub</a> で公開しています</li>
        </ul>
      </section>
    </main>

    <footer class="footer">
      <p>Made for Xteink readers.</p>
    </footer>
  </div>
`;

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

const fileInput = document.querySelector<HTMLInputElement>('#fileInput')!;
const dropzone = document.querySelector<HTMLLabelElement>('#dropzone')!;
const selectedFileEl = document.querySelector<HTMLDivElement>('#selectedFile')!;
let selectedFile: File | null = null;
let epubTitle = '';
let epubAuthor = '';

async function extractMetaFromEpub(file: File): Promise<{ title: string; author: string }> {
  try {
    const buf = await file.arrayBuffer();
    const entries = unzipSync(new Uint8Array(buf));

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

function handleFile(file: File) {
  if (!file.name.toLowerCase().endsWith('.epub')) { alert('EPUBファイルを選択してください。'); return; }
  selectedFile = file;
  epubTitle = '';
  epubAuthor = '';
  selectedFileEl.hidden = false;
  selectedFileEl.textContent = `選択中: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
  updateConvertButton();
  extractMetaFromEpub(file).then(({ title, author }) => {
    epubTitle = title;
    epubAuthor = author;
  });
}

fileInput.addEventListener('change', () => { if (fileInput.files?.[0]) handleFile(fileInput.files[0]); });
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('is-dragging'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragging'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('is-dragging');
  if (e.dataTransfer?.files[0]) handleFile(e.dataTransfer.files[0]);
});

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
    const { unzipSync: uz } = await import('fflate');

    onProgress?.('READING_INDEX');

    let buf: ArrayBuffer | null = null;
    try {
      const res = await fetch(AOZORA_CSV_ZIP_BUNDLED);
      if (res.ok) buf = await res.arrayBuffer();
    } catch { /* fall through */ }

    if (!buf) {
      onProgress?.('FETCH_FALLBACK');
      const res = await fetch(AOZORA_CSV_ZIP_PROXY);
      if (!res.ok) throw new Error(`INDEX_FETCH_ERROR: HTTP ${res.status}`);
      buf = await res.arrayBuffer();
    }

    onProgress?.('PARSING_INDEX');
    const entries = uz(new Uint8Array(buf));
    const csvKey = Object.keys(entries).find((k) => k.endsWith('.csv'));
    if (!csvKey) throw new Error('CSV_NOT_FOUND');

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
  setAozoraStatus('SEARCHING');
  aozoraResultsEl.hidden = true;
  aozoraResultsEl.innerHTML = '';

  let rows: CsvRow[];
  try {
    rows = await loadAozoraIndex((msg) => setAozoraStatus(msg));
  } catch (e) {
    setAozoraStatus(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }

  const books = searchFromCsv(rows, query);

  if (!books.length) {
    setAozoraStatus('NO_RESULTS');
    return;
  }

  setAozoraStatus(`${books.length} FOUND`);
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
  setAozoraStatus('SELECTED');
  updateConvertButton();
}

aozoraSearchBtn.addEventListener('click', () => { const q = aozoraQueryEl.value.trim(); if (q) searchAozora(q); });
aozoraQueryEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const q = aozoraQueryEl.value.trim(); if (q) searchAozora(q); } });

const rubyToggle = document.querySelector<HTMLInputElement>('#rubyToggle')!;
const indentModeEnable = document.querySelector<HTMLInputElement>('#indentModeEnable')!;
const brModeEnable = document.querySelector<HTMLInputElement>('#brModeEnable')!;
const indentModeRadios = document.querySelectorAll<HTMLInputElement>('input[name="indentMode"]');
const brModeRadios = document.querySelectorAll<HTMLInputElement>('input[name="brMode"]');
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

function syncIndentModeRadios() {
  indentModeRadios.forEach((r) => { r.disabled = !indentModeEnable.checked; });
}
function syncBrModeRadios() {
  brModeRadios.forEach((r) => { r.disabled = !brModeEnable.checked; });
}
indentModeEnable.addEventListener('change', syncIndentModeRadios);
brModeEnable.addEventListener('change', syncBrModeRadios);
syncIndentModeRadios();
syncBrModeRadios();

function getIndentMode(): 'legacy' | 'newFirmware' {
  const el = document.querySelector<HTMLInputElement>('input[name="indentMode"]:checked');
  return (el?.value as 'legacy' | 'newFirmware') ?? 'legacy';
}

function getBrMode(): 'legacy' | 'newFirmware' {
  const el = document.querySelector<HTMLInputElement>('input[name="brMode"]:checked');
  return (el?.value as 'legacy' | 'newFirmware') ?? 'legacy';
}

type PatternFn = (ctx: CanvasRenderingContext2D, W: number, H: number) => void;

const bgPatterns: PatternFn[] = [
  (ctx, W, H) => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H); },
  (ctx, W, H) => {
    ctx.fillStyle = '#fafafa'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  },
  (ctx, W, H) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.lineWidth = 1;
    for (let i = -H; i < W + H; i += 28) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke(); }
  },
  (ctx, W, H) => {
    ctx.fillStyle = '#fafafa'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    const step = 32;
    for (let x = step / 2; x < W; x += step)
      for (let y = step / 2; y < H; y += step) { ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill(); }
  },
  (ctx, W, H) => {
    ctx.fillStyle = '#fafafa'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1;
    const step = 32;
    for (let x = 0; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  },
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

  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(48, 80); ctx.lineTo(W - 48, 80); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(48, H - 110); ctx.lineTo(W - 48, H - 110); ctx.stroke();

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

  if (author) {
    ctx.font = `20px ${FONT_BASE}`;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(author, W / 2, H - 68);
  }
}

function getBookTitle(): string {
  if (activeTab === 'aozora' && selectedAozoraBook) return selectedAozoraBook.title;
  return epubTitle;
}

function getBookAuthor(): string {
  if (activeTab === 'aozora' && selectedAozoraBook) return selectedAozoraBook.author;
  return epubAuthor;
}

previewCoverBtn.addEventListener('click', () => {
  const title = getBookTitle();
  const author = getBookAuthor();
  drawCoverToCanvas(coverCanvas, title, author);
  coverPreviewWrap.hidden = false;
  const meta = title ? `「${title}」${author ? ' / ' + author : ''}` : '（タイトル未取得）';
  coverPreviewMeta.textContent = meta;
});

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
    if (!selectedFile) setStatus('EPUB_SELECT_PROMPT');
  } else {
    convertButton.disabled = !selectedAozoraBook;
    if (!selectedAozoraBook) setStatus('AOZORA_SELECT_PROMPT');
  }
}

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
    applyIndent: indentModeEnable.checked,
    indentMode: getIndentMode(),
    applyBr: brModeEnable.checked,
    brMode: getBrMode(),
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

async function convertEpubFile() {
  if (!selectedFile) return;
  terminateWorker();
  convertButton.disabled = true; downloadButton.disabled = true; resultBlob = null;
  setStatus('PREPARING', 0);
  const options = buildOptions();
  if (coverGenerateRadio.checked) {
    drawCoverToCanvas(coverCanvas, getBookTitle(), getBookAuthor());
    await new Promise<void>((r) => setTimeout(r, 0));
    const imgBuffer = await canvasToJpegBuffer(coverCanvas);
    (options.cover as { mode: 'generate'; imageBuffer: ArrayBuffer; imageType: string }).imageBuffer = imgBuffer;
  }
  const fileBuffer = await selectedFile.arrayBuffer();
  const worker = buildWorker();
  currentWorker = worker;
  worker.onmessage = handleWorkerMessage;
  worker.onerror = (e) => { setStatus(`ERROR: ${e.message}`, 0); convertButton.disabled = false; terminateWorker(); };
  const transfers: ArrayBuffer[] = [fileBuffer];
  if (options.cover.mode === 'generate' && options.cover.imageBuffer) transfers.push(options.cover.imageBuffer);
  worker.postMessage({ type: 'process', payload: { fileName: selectedFile.name, fileBuffer, options } }, transfers);
}

async function convertAozora() {
  if (!selectedAozoraBook) return;
  terminateWorker();
  convertButton.disabled = true; downloadButton.disabled = true; resultBlob = null;

  const book = selectedAozoraBook;

  if (!book.xhtml_url && !book.zip_url) {
    setStatus('NO_CONTENT_FOUND', 0);
    convertButton.disabled = false;
    return;
  }

  let xhtmlBytes: ArrayBuffer | null = null;
  try {
    if (book.xhtml_url) {
      setStatus('FETCHING_XHTML', 3);
      xhtmlBytes = await fetchBytesViaProxy(book.xhtml_url);
    } else if (book.zip_url) {
      setStatus('FETCHING_ZIP', 3);
      xhtmlBytes = await fetchHtmlBytesFromZip(book.zip_url);
    }
    if (!xhtmlBytes || xhtmlBytes.byteLength === 0) throw new Error('EMPTY_CONTENT');
  } catch (e) {
    setStatus(`FETCH_ERROR: ${e instanceof Error ? e.message : String(e)}`, 0);
    convertButton.disabled = false;
    return;
  }

  setStatus('CONVERTING', 10);
  const options = buildOptions();
  if (coverGenerateRadio.checked) {
    drawCoverToCanvas(coverCanvas, getBookTitle(), getBookAuthor());
    await new Promise<void>((r) => setTimeout(r, 0));
    const imgBuffer = await canvasToJpegBuffer(coverCanvas);
    (options.cover as { mode: 'generate'; imageBuffer: ArrayBuffer; imageType: string }).imageBuffer = imgBuffer;
  }
  const worker = buildWorker();
  currentWorker = worker;
  worker.onmessage = handleWorkerMessage;
  worker.onerror = (e) => { setStatus(`ERROR: ${e.message}`, 0); convertButton.disabled = false; terminateWorker(); };

  const transfers: ArrayBuffer[] = [xhtmlBytes];
  if (options.cover.mode === 'generate' && options.cover.imageBuffer) transfers.push(options.cover.imageBuffer);
  worker.postMessage(
    { type: 'build_aozora', payload: { xhtmlBytes, title: book.title, author: book.author, options } },
    transfers,
  );
}

async function fetchBytesViaProxy(url: string): Promise<ArrayBuffer> {
  const proxyUrl = `/proxy?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`PROXY_FETCH_ERROR: HTTP ${res.status}`);
  return res.arrayBuffer();
}

async function fetchHtmlBytesFromZip(zipUrl: string): Promise<ArrayBuffer> {
  const { unzipSync: uz } = await import('fflate');
  const proxyUrl = `/proxy?url=${encodeURIComponent(zipUrl)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`ZIP_FETCH_ERROR: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const entries = uz(new Uint8Array(buf));
  const htmlKey = Object.keys(entries).find((k) => /\.(html|xhtml)$/i.test(k));
  if (!htmlKey) throw new Error('NO_HTML_IN_ZIP');
  const bytes = entries[htmlKey];
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function handleWorkerMessage(event: MessageEvent) {
  const { type, payload } = event.data;
  if (type === 'progress') { setStatus(payload.message, payload.progress); return; }
  if (type === 'done') {
    resultBlob = payload.blob; resultFileName = payload.fileName;
    const s = payload.summary;
    document.querySelector<HTMLElement>('#statHtml')!.textContent  = String(s.htmlFiles);
    document.querySelector<HTMLElement>('#statRuby')!.textContent  = String(s.rubyConversions);
    document.querySelector<HTMLElement>('#statIndent')!.textContent = String(s.indentConversions);
    document.querySelector<HTMLElement>('#statBr')!.textContent    = String(s.brConversions);
    document.querySelector<HTMLElement>('#statWarn')!.textContent  = String(s.warnings.length);
    const logLines = [...s.logs, ...(s.warnings.length ? ['', '--- WARN ---', ...s.warnings] : [])];
    document.querySelector<HTMLElement>('#logBox')!.textContent = logLines.join('\n') || '(no log)';
    setStatus('DONE', 100);
    convertButton.disabled = false; downloadButton.disabled = false;
    terminateWorker(); return;
  }
  if (type === 'error') { setStatus(`ERROR: ${payload.message}`, 0); convertButton.disabled = false; terminateWorker(); }
}

convertButton.addEventListener('click', () => {
  if (activeTab === 'epub') convertEpubFile();
  else convertAozora();
});

downloadButton.addEventListener('click', () => {
  if (!resultBlob) return;
  const url = URL.createObjectURL(resultBlob);
  const a = document.createElement('a');
  a.href = url; a.download = resultFileName; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});
