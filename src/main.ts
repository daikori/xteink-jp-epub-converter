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

// ── Aozora Bunko search (GitHub Contents API) ────────────────────
//
// aozorabunko/aozorabunko リポジトリのカードHTMLファイルを
// GitHub Search API でファイル名検索し、作品の book_id を導出。
// XHTML 本文 URL は
//   https://www.aozora.gr.jp/cards/<author_id>/files/<book_id>_ruby_<hash>.html
// の形式だが hash が不明なので、カードページ
//   https://www.aozora.gr.jp/cards/<author_id>/card<book_id>.html
// から ZIP リンクをスクレイピングして取得する。
// スクレイピングは CORS のため allorigins.win プロキシ経由。

interface AozoraBook {
  title: string;
  author: string;
  book_id: string;    // e.g. "000773"
  author_id: string;  // e.g. "000148"
  card_url: string;
}

const aozoraQueryEl  = document.querySelector<HTMLInputElement>('#aozoraQuery')!;
const aozoraSearchBtn = document.querySelector<HTMLButtonElement>('#aozoraSearchBtn')!;
const aozoraStatusEl  = document.querySelector<HTMLDivElement>('#aozoraStatus')!;
const aozoraResultsEl = document.querySelector<HTMLDivElement>('#aozoraResults')!;
const aozoraSelectedEl      = document.querySelector<HTMLDivElement>('#aozoraSelected')!;
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

// GitHub Search API でカードファイルを検索し、パスから author_id / book_id を抽出
async function searchAozora(query: string): Promise<void> {
  setAozoraStatus('検索中...');
  aozoraResultsEl.hidden = true;
  aozoraResultsEl.innerHTML = '';

  // GitHub Search API: search for card HTML files whose path contains the query
  // Endpoint is public (unauthenticated) but rate-limited to 10 req/min
  const ghUrl =
    `https://api.github.com/search/code` +
    `?q=${encodeURIComponent(query)}+repo:aozorabunko/aozorabunko+path:cards+filename:card&per_page=20`;

  let items: Array<{ name: string; path: string; html_url: string }>;
  try {
    const res = await fetch(ghUrl, {
      headers: { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (res.status === 403 || res.status === 429) {
      throw new Error('GitHub API のレートリミットです。1分待ってから再試行してください。');
    }
    if (!res.ok) throw new Error(`GitHub API エラー: HTTP ${res.status}`);
    const data = await res.json();
    items = data.items ?? [];
  } catch (e) {
    setAozoraStatus(`エラー: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }

  if (!items.length) {
    setAozoraStatus('検索結果が見つかりませんでした。別のキーワードで試してください。');
    return;
  }

  // path 形式: cards/<author_id>/card<book_id>.html
  const books: AozoraBook[] = items
    .map((item) => {
      const m = item.path.match(/cards\/([0-9]+)\/card([0-9]+)\.html$/);
      if (!m) return null;
      const author_id = m[1].padStart(6, '0');
      const book_id   = m[2].padStart(6, '0');
      // タイトルはファイル名から抽出できないので記述子のみ表示、詳細はカードページで確認できる
      const card_url = `https://www.aozora.gr.jp/cards/${author_id}/card${book_id}.html`;
      return {
        title: `作品 #${book_id}`,
        author: `著者 #${author_id}`,
        book_id,
        author_id,
        card_url,
      } satisfies AozoraBook;
    })
    .filter((b): b is AozoraBook => b !== null);

  // カードページの内容を並列取得してタイトル・著者を補完する
  setAozoraStatus(`${books.length} 件見つかりました。詳細を読み込み中...`);
  const enriched = await Promise.all(books.map(enrichBookMeta));

  setAozoraStatus(`${enriched.length} 件見つかりました`);
  aozoraResultsEl.hidden = false;
  aozoraResultsEl.innerHTML = enriched.map((book, i) =>
    `<button class="aozora-result-item" type="button" data-idx="${i}">
      <span class="aozora-result-title">${escHtml(book.title)}</span>
      <span class="aozora-result-author">${escHtml(book.author)}</span>
    </button>`
  ).join('');
  aozoraResultsEl.querySelectorAll<HTMLButtonElement>('.aozora-result-item').forEach((btn, i) => {
    btn.addEventListener('click', () => selectAozoraBook(enriched[i]));
  });
}

// allorigins 経由でカードページを取得しタイトル・著者・XHTML URL を抽出
async function enrichBookMeta(book: AozoraBook): Promise<AozoraBook> {
  try {
    const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(book.card_url)}`;
    const res = await fetch(proxy);
    if (!res.ok) return book;
    const { contents } = await res.json() as { contents: string };

    // タイトル抽出: <title>タイトル 著者名のページ</title>
    const titleM = contents.match(/<title>([^<]+)<\/title>/i);
    // 著者抽出: 「著者名」のリンク
    const authorM = contents.match(/<a[^>]+\/cards\/[0-9]+\/[^>]+>([^<]+)<\/a>/i);
    // XHTML ファイル URL 抽出 (「テキストファイル(XHTML)」リンク)
    const xhtmlM = contents.match(/href="([^"]+\.html)"/i);
    // ZIP URL 抽出 (「テキストファイル(ruby/しおり付きテキスト)」)
    const zipM = contents.match(/href="([^"]+_ruby_[^"]+\.zip)"/i)
              ?? contents.match(/href="([^"]+\.zip)"/i);

    return {
      ...book,
      title:  titleM  ? titleM[1].replace(/\s*のページ$/, '').trim() : book.title,
      author: authorM ? authorM[1].trim() : book.author,
      card_url: book.card_url,
      // 内部岡用に zip_url を保持するため型を拡張
      ...(zipM  ? { zip_url:   (zipM[1].startsWith('http') ? zipM[1] : `https://www.aozora.gr.jp${zipM[1]}`) } : {}),
      ...(xhtmlM ? { xhtml_url: (xhtmlM[1].startsWith('http') ? xhtmlM[1] : `https://www.aozora.gr.jp${xhtmlM[1]}`) } : {}),
    } as AozoraBook & { zip_url?: string; xhtml_url?: string };
  } catch {
    return book;
  }
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

function renderCoverToCanvas(canvas: HTMLCanvasElement, title: string): void {
  canvas.width = COVER_W; canvas.height = COVER_H;
  const ctx2d = canvas.getContext('2d')!;
  const isDark = document.documentElement.dataset.theme === 'dark';
  const bg = isDark ? '#171614' : '#f7f6f2';
  const fg = isDark ? '#d2d0cb' : '#28251d';
  const accent = isDark ? '#4f98a3' : '#01696f';
  ctx2d.fillStyle = bg; ctx2d.fillRect(0, 0, COVER_W, COVER_H);
  ctx2d.fillStyle = accent; ctx2d.fillRect(0, 0, 12, COVER_H);
  ctx2d.fillStyle = fg;
  ctx2d.font = `bold 72px "Hiragino Mincho ProN", "Yu Mincho", serif`;
  ctx2d.textAlign = 'center';
  wrapText(ctx2d, title, COVER_W / 2, COVER_H / 2, COVER_W - 120, 90);
  ctx2d.fillStyle = accent;
  ctx2d.font = `500 30px Inter, system-ui, sans-serif`;
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
  renderCoverToCanvas(coverCanvas, getBookTitle());
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
    renderCoverToCanvas(coverCanvas, getBookTitle());
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

  const book = selectedAozoraBook as AozoraBook & { xhtml_url?: string; zip_url?: string };

  // 本文URLの候補を決定: xhtml_url > zip_urlの ZIP を展開してHTMLを取り出す
  if (!book.xhtml_url && !book.zip_url) {
    setStatus('この作品に本文ファイルが見つかりませんでした。', 0);
    convertButton.disabled = false;
    return;
  }

  let xhtmlContent = '';
  try {
    if (book.xhtml_url) {
      setStatus('青空文庫からXHTMLを取得中...', 3);
      xhtmlContent = await fetchViaProxy(book.xhtml_url);
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
    renderCoverToCanvas(coverCanvas, getBookTitle());
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

// allorigins.win 経由でテキスト取得
async function fetchViaProxy(url: string): Promise<string> {
  // まず直接試行
  try {
    const res = await fetch(url);
    if (res.ok) return await res.text();
  } catch { /* fall through */ }
  // allorigins フォールバック
  const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
  const res2 = await fetch(proxy);
  if (!res2.ok) throw new Error(`プロキシ経由でも取得失敗: HTTP ${res2.status}`);
  const data = await res2.json() as { contents: string };
  return data.contents ?? '';
}

// ZIP を展開して .html / .xhtml を取り出す
async function fetchHtmlFromZip(zipUrl: string): Promise<string> {
  const { unzipSync } = await import('fflate');
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(zipUrl)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`ZIP取得失敗: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
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
