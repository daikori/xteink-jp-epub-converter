import { unzipSync, zipSync, strToU8 } from 'fflate';

type CoverMode = 'none' | 'generate';

type CoverOptions =
  | { mode: 'none' }
  | { mode: 'generate'; imageBuffer: ArrayBuffer; imageType: string };

type Options = {
  convertRuby: boolean;
  addEmptySpan: boolean;
  convertBrToEmptyP: boolean;
  cover: CoverOptions;
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
  brConversions: number;
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
    const summary: Summary = { htmlFiles: 0, rubyConversions: 0, spanInsertions: 0, brConversions: 0, warnings: [], logs: [] };
    const outputEntries: Record<string, [Uint8Array, { level: number }]> = {};

    const names = Object.keys(zipEntries);
    if (!names.includes('mimetype')) throw new Error('mimetype が見つかりません。EPUBではないかもしれません。');

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
        summary.brConversions += result.brConversions;
        summary.logs.push(`${name}: ruby=${result.rubyConversions}, span=${result.spanInsertions}, br=${result.brConversions}`);
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
    if (options.convertBrToEmptyP && summary.brConversions === 0 && summary.htmlFiles > 0) {
      summary.logs.push('INFO: pタグ外の<br>タグが見つかりませんでした');
    }

    // 表紙を適用
    if (options.cover.mode === 'generate' && options.cover.imageBuffer) {
      postProgress(85, '表紙を適用中...');
      try {
        applyCoverToEpub(outputEntries, options.cover.imageBuffer, options.cover.imageType, names);
        summary.logs.push('INFO: 表紙を自動生成して設定しました');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        summary.warnings.push(`表紙設定に失敗しました: ${msg}`);
      }
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
    // outputEntriesに新規追加されたエントリ（表紙画像など）を追加
    for (const [key, entry] of Object.entries(outputEntries)) {
      if (!names.includes(key) && key !== 'mimetype') {
        orderedEntries.push([key, entry[0], entry[1]]);
      }
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
 * EPUBに表紙画像を適用する。
 * 以下の優先順位でOPFを解析して既存表紙を置き換え、なければ新規追加する：
 *  1. <meta name="cover" content="{id}"> からIDを特定
 *  2. properties="cover-image" を持つ <item> を直接探索
 *  3. 見つからない場合は OEBPS/Images/cover.jpg として新規追加
 */
function applyCoverToEpub(
  outputEntries: Record<string, [Uint8Array, { level: number }]>,
  imageBuffer: ArrayBuffer,
  imageType: string,
  originalNames: string[]
): void {
  // container.xml からOPFパスを取得
  const containerKey = originalNames.find((n) => /META-INF\/container\.xml$/i.test(n));
  if (!containerKey) throw new Error('META-INF/container.xml が見つかりません');

  const containerXml = new TextDecoder().decode(outputEntries[containerKey][0]);
  const opfPathMatch = containerXml.match(/full-path=["']([^"']+\.opf)["']/i);
  if (!opfPathMatch) throw new Error('OPFパスが取得できませんでした');

  const opfPath = opfPathMatch[1];
  const opfKey = originalNames.find((n) => n === opfPath) ?? opfPath;
  if (!outputEntries[opfKey]) throw new Error(`OPFファイルが見つかりません: ${opfPath}`);

  let opfXml = new TextDecoder().decode(outputEntries[opfKey][0]);

  // OPFのベースディレクトリを取得（例: "OEBPS/content.opf" → "OEBPS/"）
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

  // 既存の表紙アイテムを探す
  let coverHref: string | null = null;

  // 方法1: <meta name="cover"> からIDを特定
  const metaCoverMatch = opfXml.match(/<meta[^>]+name=["']cover["'][^>]+content=["']([^"']+)["'][^>]*>/i)
    ?? opfXml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']cover["'][^>]*>/i);
  if (metaCoverMatch) {
    const coverId = metaCoverMatch[1];
    const itemMatch = opfXml.match(new RegExp(`<item[^>]+id=["']${coverId}["'][^>]+href=["']([^"']+)["']`, 'i'))
      ?? opfXml.match(new RegExp(`<item[^>]+href=["']([^"']+)["'][^>]+id=["']${coverId}["']`, 'i'));
    if (itemMatch) coverHref = itemMatch[1];
  }

  // 方法2: properties="cover-image" を持つ item を探す
  if (!coverHref) {
    const propMatch = opfXml.match(/<item[^>]+properties=["'][^"']*cover-image[^"']*["'][^>]+href=["']([^"']+)["']/i)
      ?? opfXml.match(/<item[^>]+href=["']([^"']+)["'][^>]+properties=["'][^"']*cover-image[^"']*["']/i);
    if (propMatch) coverHref = propMatch[1];
  }

  const ext = imageType === 'image/png' ? 'png' : 'jpg';
  const imageBytes = new Uint8Array(imageBuffer);

  if (coverHref) {
    // 既存の表紙を上書き
    const fullCoverPath = opfDir + coverHref;
    const existingKey = originalNames.find((n) => n === fullCoverPath) ?? fullCoverPath;
    outputEntries[existingKey] = [imageBytes, { level: 6 }];

    // OPFのmedia-typeも更新
    opfXml = opfXml.replace(
      new RegExp(`(<item[^>]+href=["']${coverHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]+media-type=["'])[^"\']+(["'])`, 'i'),
      `$1${imageType}$2`
    );
    opfXml = opfXml.replace(
      new RegExp(`(<item[^>]+media-type=["'])[^"\']+(["'][^>]+href=["']${coverHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'])`, 'i'),
      `$1${imageType}$2`
    );
  } else {
    // 新規追加: OEBPS/Images/cover.{ext}
    const newCoverRelPath = `Images/cover.${ext}`;
    const newCoverFullPath = `${opfDir}${newCoverRelPath}`;
    outputEntries[newCoverFullPath] = [imageBytes, { level: 6 }];

    // manifestに追加
    opfXml = opfXml.replace(
      /(<manifest[^>]*>)/i,
      `$1\n    <item id="cover-image" href="${newCoverRelPath}" media-type="${imageType}" properties="cover-image"/>`
    );
    // guideに追加（任意・なければスキップ）
    if (/<guide[^>]*>/i.test(opfXml)) {
      opfXml = opfXml.replace(
        /(<guide[^>]*>)/i,
        `$1\n    <reference type="cover" title="Cover" href="${newCoverRelPath}"/>`
      );
    }
  }

  outputEntries[opfKey] = [strToU8(opfXml), { level: 6 }];
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
 */
function processMarkup(source: string, options: Options) {
  let text = source;
  let rubyConversions = 0;
  let spanInsertions = 0;
  let brConversions = 0;

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

  if (options.convertBrToEmptyP) {
    const result = convertBrToEmptyP(text);
    text = result.text;
    brConversions = result.count;
  }

  return { text, rubyConversions, spanInsertions, brConversions };
}

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

function convertBrToEmptyP(source: string): { text: string; count: number } {
  let count = 0;
  let text = source;

  text = text.replace(
    /<p(?:\s[^>]*)?>(\s*<br\s*\/?>\s*)+<\/p\s*>/gi,
    () => { count++; return '<p> </p>'; }
  );

  let depth = 0;
  text = text.replace(
    /(<\/p\s*>)|(<p(?:\s[^>]*)?>)|(<br\s*\/?>)/gi,
    (match, closeP, openP, br) => {
      if (openP !== undefined) { depth++; return match; }
      if (closeP !== undefined) { if (depth > 0) depth--; return match; }
      if (br !== undefined && depth === 0) { count++; return '<p> </p>'; }
      return match;
    }
  );

  return { text, count };
}

function addEmptySpanInsideP(source: string): { text: string; count: number } {
  let count = 0;
  const brOnlyP = /^<p(?:\s[^>]*)?>(?=(?:\s|<br\s*\/?>| )(?:\s|<br\s*\/?>| )*<\/p)(?:\s|<br\s*\/?>| )+<\/p\s*>$/i;

  const text = source.replace(/(<p(?:[ \t][^>]*)?>)((?:[\s\S]*?))(<\/p\s*>)/gi, (match, openTag, inner, closeTag) => {
    if (brOnlyP.test(match)) return match;
    count++;
    return `${openTag}<span></span>${inner}${closeTag}`;
  });

  const deduped = text.replace(/(<p(?:[ \t][^>]*)?>)(<span><\/span>){2,}/gi, '$1<span></span>');
  return { text: deduped, count };
}
