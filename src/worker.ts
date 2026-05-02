import { unzipSync, zipSync, strToU8 } from 'fflate';

type Options = {
  convertRuby: boolean;
  addEmptySpan: boolean;
};

type ProcessRequest = {
  type: 'process';
  payload: {
    fileName: string;
    fileBuffer: ArrayBuffer;
    options: Options;
  };
};

type Summary = {
  htmlFiles: number;
  rubyConversions: number;
  spanInsertions: number;
  warnings: string[];
  logs: string[];
};

const ctx: Worker = self as unknown as Worker;

ctx.onmessage = (event: MessageEvent<ProcessRequest>) => {
  if (event.data.type !== 'process') return;

  try {
    const { fileName, fileBuffer, options } = event.data.payload;
    postProgress(5, 'EPUBを展開中...');

    const zipEntries = unzipSync(new Uint8Array(fileBuffer));
    const summary: Summary = { htmlFiles: 0, rubyConversions: 0, spanInsertions: 0, warnings: [], logs: [] };
    const outputEntries: Record<string, [Uint8Array, { level: number }]> = {};

    const names = Object.keys(zipEntries);
    if (!names.includes('mimetype')) throw new Error('mimetype が見つからない。EPUBではないかもしれない。');

    const htmlNames = names.filter((name) => /\.(xhtml|html|htm)$/i.test(name));
    let processed = 0;

    const mimetypeBytes = zipEntries['mimetype'];
    outputEntries['mimetype'] = [mimetypeBytes, { level: 0 }];

    for (const name of names) {
      if (name === 'mimetype') continue;
      const bytes = zipEntries[name];

      if (!/\.(xhtml|html|htm)$/i.test(name)) {
        outputEntries[name] = [bytes, { level: 6 }];
        continue;
      }

      summary.htmlFiles += 1;
      processed += 1;
      postProgress(8 + (processed / Math.max(htmlNames.length, 1)) * 74, `${name} を処理中...`);

      try {
        const source = decodeBytes(bytes);
        const result = processMarkup(source, options);
        summary.rubyConversions += result.rubyConversions;
        summary.spanInsertions += result.spanInsertions;
        summary.logs.push(`${name}: ruby=${result.rubyConversions}, span=${result.spanInsertions}`);
        outputEntries[name] = [strToU8(result.text), { level: 6 }];
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        summary.warnings.push(`WARN: ${name}: ${message}`);
        outputEntries[name] = [bytes, { level: 6 }];
      }
    }

    if (options.convertRuby && summary.rubyConversions === 0 && summary.htmlFiles > 0) {
      summary.logs.push('INFO: ルビタグが見つかりませんでした（元のEPUBにルビがない可能性があります）');
    }
    if (options.addEmptySpan && summary.spanInsertions === 0 && summary.htmlFiles > 0) {
      summary.logs.push('INFO: <p>タグが見つかりませんでした');
    }

    postProgress(90, 'EPUBを再構築中...');

    const orderedEntries: [string, Uint8Array, { level: number }][] = [];
    orderedEntries.push(['mimetype', mimetypeBytes, { level: 0 }]);
    for (const name of names) {
      if (name === 'mimetype') continue;
      const entry = outputEntries[name];
      if (!entry) continue;
      orderedEntries.push([name, entry[0], entry[1]]);
    }

    const zipped = zipSync(
      Object.fromEntries(orderedEntries.map(([name, data, opts]) => [name, [data, opts]])),
      { level: 6 }
    );

    const outputName = buildOutputName(fileName);
    const blob = new Blob([zipped], { type: 'application/epub+zip' });

    ctx.postMessage({
      type: 'done',
      payload: { blob, fileName: outputName, summary }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.postMessage({ type: 'error', payload: { message } });
  }
};

function postProgress(progress: number, message: string) {
  ctx.postMessage({ type: 'progress', payload: { progress, message } });
}

function buildOutputName(fileName: string) {
  return fileName.toLowerCase().endsWith('.epub')
    ? fileName.replace(/\.epub$/i, '_x4.epub')
    : `${fileName}_x4.epub`;
}

/**
 * Uint8Array をテキストに変換する。
 * XML/HTML宣言の charset を優先し、見つからなければ UTF-8 にフォールバック。
 */
function decodeBytes(bytes: Uint8Array): string {
  const probe = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 512));
  const xmlEnc = probe.match(/<?xml[^>]*encoding=["']([^"']+)["']/i);
  const metaEnc = probe.match(/<meta[^>]+charset=["']?([\w-]+)["'?]/i);
  const charset = (xmlEnc?.[1] || metaEnc?.[1] || 'utf-8').toLowerCase();
  try {
    return new TextDecoder(charset, { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
}

/**
 * HTML/XHTML文字列に対して変換処理を行う。
 * DOMParserを使わず正規表現ベースで処理することでWorker内でも動作する。
 */
function processMarkup(source: string, options: Options) {
  let text = source;
  let rubyConversions = 0;
  let spanInsertions = 0;

  if (options.convertRuby) {
    const result = convertRubyToParentheses(text);
    text = result.text;
    rubyConversions = result.count;
  }

  if (options.addEmptySpan) {
    const result = addEmptySpanInsideP(text);
    text = result.text;
    spanInsertions = result.count;
  }

  return { text, rubyConversions, spanInsertions };
}

/**
 * <ruby>漢字<rt>かんじ</rt></ruby> → 漢字（かんじ）
 */
function convertRubyToParentheses(source: string): { text: string; count: number } {
  let count = 0;

  const text = source.replace(/<ruby([^>]*)>([\s\S]*?)<\/ruby>/gi, (_match, _attrs, inner) => {
    count++;
    const noRp = inner.replace(/<rp[^>]*>[\s\S]*?<\/rp>/gi, '');
    const parts: string[] = [];
    let cursor = 0;
    const rtRegex = /<rt[^>]*>([\s\S]*?)<\/rt>/gi;
    let rtMatch: RegExpExecArray | null;

    while ((rtMatch = rtRegex.exec(noRp)) !== null) {
      const before = noRp.slice(cursor, rtMatch.index);
      const baseText = before.replace(/<rb[^>]*>([\s\S]*?)<\/rb>/gi, '$1').replace(/<[^>]+>/g, '').trim();
      const rubyText = rtMatch[1].replace(/<[^>]+>/g, '').trim();
      parts.push(baseText ? `${baseText}（${rubyText}）` : `（${rubyText}）`);
      cursor = rtMatch.index + rtMatch[0].length;
    }

    const tail = noRp.slice(cursor).replace(/<[^>]+>/g, '').trim();
    if (tail) parts.push(tail);

    if (!parts.length) {
      count--;
      return inner.replace(/<[^>]+>/g, '').trim();
    }
    return parts.join('');
  });

  return { text, count };
}

/**
 * <p>...</p> の先頭に空の <span></span> を挿入する。
 *
 * 修正した2つのバグ:
 *
 * バグ①: 改行展開された属性を持つ <html> タグへの誤マッチ
 *   以前: `<p(?:\s[^>]*)?>` は <html\n class="vrtl"\n...> にマッチしていた。
 *   修正: `<p([ \t][^>]*)?>` に変更。改行を含む属性展開にマッチしない。
 *
 * バグ②: <p>直後の空白が <span> より前に出る
 *   以前: `($1)($2=空白)<span></span>` の順で置換していた。
 *   修正: 空白キャプチャを除外し `$1<span></span>` のみ返す。
 *          Python版の p_tag.insert(0, empty_span) と同じ振る舞いになる。
 */
function addEmptySpanInsideP(source: string): { text: string; count: number } {
  let count = 0;

  // バグ①修正: [ \t] のみ許可（改行は含めない）。バグ②修正: 空白キャプチャを削除。
  const text = source.replace(/(<p([ \t][^>]*)?>)/gi, (_match, openTag) => {
    count++;
    return `${openTag}<span></span>`;
  });

  // 二重挿入ガード: 先頭に既に空 span があれば除去
  const deduped = text.replace(/(<p(?:[ \t][^>]*)?>)(<span><\/span>){2,}/gi, '$1<span></span>');

  return { text: deduped, count };
}
