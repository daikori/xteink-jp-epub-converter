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
        <p class="kicker"これはなに？</p>
        <h2>EPUBの行頭文字下げ、ルビ表示ができるよう変換します</h2>
        <p class="lead">Xteink には、行頭が2文字分下がる、ルビ付きの行が表示されないといった仕様があります。本Webアプリでは、これらの問題を解消するため、以下の内容でEPUBを変換します。</p>
        <ul class="feature-list" role="list">
          <li>ルビタグ を「漢字（かんじ）」のように変換します</li>
          <li>各 p タグ先頭に空 span を追加します。これによりXteink側に p タグを誤認させ、行頭の字下げを文章側にて入られた全角空白を見るようにします</li>
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
        </ul>
      </section>
    </main>
  </div>
`;

const fileInput = document.querySelector<HTMLInputElement>('#fileInput')!;
const dropzone = document.querySelector<HTMLLabelElement>('#dropzone')!;
const selectedFile = document.querySelector<HTMLDivElement>('#selectedFile')!;
const convertButton = document.querySelector<HTMLButtonElement>('#convertButton')!;
const downloadButton = document.querySelector<HTMLButtonElement>('#downloadButton')!;
const rubyToggle = document.querySelector<HTMLInputElement>('#rubyToggle')!;
const spanToggle = document.querySelector<HTMLInputElement>('#spanToggle')!;
const statusText = document.querySelector<HTMLSpanElement>('#statusText')!;
const progressPercent = document.querySelector<HTMLSpanElement>('#progressPercent')!;
const progressFill = document.querySelector<HTMLDivElement>('#progressFill')!;
const statHtml = document.querySelector<HTMLElement>('#statHtml')!;
const statRuby = document.querySelector<HTMLElement>('#statRuby')!;
const statSpan = document.querySelector<HTMLElement>('#statSpan')!;
const statWarn = document.querySelector<HTMLElement>('#statWarn')!;
const logBox = document.querySelector<HTMLElement>('#logBox')!;

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

let selected: File | null = null;
let outputBlob: Blob | null = null;
let outputName = '';

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
  statWarn.textContent = '0';
  logBox.textContent = '処理開始...';
  setProgress(2, 'ファイル読み込み中...');

  const buffer = await selected.arrayBuffer();
  worker.postMessage({
    type: 'process',
    payload: {
      fileName: selected.name,
      fileBuffer: buffer,
      options: {
        convertRuby: rubyToggle.checked,
        addEmptySpan: spanToggle.checked
      }
    }
  }, [buffer]);
});

worker.addEventListener('message', (event: MessageEvent) => {
  const data = event.data as
    | { type: 'progress'; payload: { progress: number; message: string } }
    | { type: 'done'; payload: { blob: Blob; fileName: string; summary: { htmlFiles: number; rubyConversions: number; spanInsertions: number; warnings: string[]; logs: string[] } } }
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
