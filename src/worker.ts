import { unzipSync, zipSync, strToU8 } from 'fflate';

type CoverMode = 'none' | 'generate';

type Options = {
  convertRuby: boolean;
  addEmptySpan: boolean;
  convertBrToEmptyP: boolean;
  cover: {
    mode: CoverMode;
    imageBuffer?: ArrayBuffer;
    imageType?: string;
  };
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

    // --- 表紙処理 ---
    if (options.cover.mode === 'generate' && options.cover.imageBuffer) {
      postProgress(85, '表紙を挿入中...');
      try {
        applyCoverToEpub(outputEntries, zipEntries, names, options.cover.imageBuffer, options.cover.imageType ?? 'image/jpeg');
        summary.logs.push('INFO: 表紙画像を挿入しました');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        summary.warnings.push(`表紙挿入失敗: ${msg}`);
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
    // 新規追加エントリを末尾に付加
    for (const [entryName, entry] of Object.entries(outputEntries)) {
      if (!names.includes(entryName) && entryName !== 'mimetype') {
        orderedEntries.push([entryName, entry[0], entry[1]]);
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

// ---------------------------------------------------------------------------
// 表紙挿入
// ---------------------------------------------------------------------------

/**
 * OPFを解析し、既存の表紙画像エントリを新しい画像で上書きする。
 * 既存の表紙が見つからない場合は、OPF の manifest に新規エントリを追加する。
 *
 * 対応パターン:
 *   1. <meta name="cover" content="{id}"> でIDを特定 → そのIDの href を上書き
 *   2. <item properties="cover-image"> を直接探す
 *   3. 上記なし → OEBPS/Images/cover.jpg として追加し manifest / guide に登録
 */
function applyCoverToEpub(
  outputEntries: Record<string, [Uint8Array, { level: number }]>,
  originalEntries: Record<string, Uint8Array>,
  allNames: string[],
  imageBuffer: ArrayBuffer,
  imageType: string
): void {
  const imageBytes = new Uint8Array(imageBuffer);
  const ext = imageType === 'image/jpeg' ? 'jpg' : 'png';

  const containerName = allNames.find((n) => n.toLowerCase() === 'meta-inf/container.xml');
  if (!containerName) throw new Error('META-INF/container.xml が見つかりません');

  const containerXml = new TextDecoder('utf-8', { fatal: false }).decode(originalEntries[containerName]);
  const rootfileMatch = containerXml.match(/full-path=["']([^"']+)["']/);
  if (!rootfileMatch) throw new Error('rootfile の full-path が見つかりません');

  const opfPath = rootfileMatch[1];
  const opfEntry = originalEntries[opfPath] ?? outputEntries[opfPath]?.[0];
  if (!opfEntry) throw new Error(`OPFファイルが見つかりません: ${opfPath}`);

  let opfXml = new TextDecoder('utf-8', { fatal: false }).decode(opfEntry);
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

  // パターン1: <meta name="cover">
  let coverItemPath: string | null = null;
  const metaCoverMatch = opfXml.match(/<meta[^>]+name=["']cover["'][^>]+content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]+name=["']cover["'][^>]*>/i);
  if (metaCoverMatch) {
    const coverId = (metaCoverMatch[1] ?? metaCoverMatch[2]).trim();
    const itemMatch = opfXml.match(new RegExp(`<item[^>]+id=["']${escapeRegex(coverId)}["'][^>]+href=["']([^"']+)["']`, 'i'))
      ?? opfXml.match(new RegExp(`<item[^>]+href=["']([^"']+)["'][^>]+id=["']${escapeRegex(coverId)}["']`, 'i'));
    if (itemMatch) coverItemPath = resolveOpfPath(opfDir, itemMatch[1]);
  }

  // パターン2: properties="cover-image"
  if (!coverItemPath) {
    const propMatch = opfXml.match(/<item[^>]+properties=["'][^"']*cover-image[^"']*["'][^>]+href=["']([^"']+)["']|<item[^>]+href=["']([^"']+)["'][^>]+properties=["'][^"']*cover-image[^"']*["']/i);
    if (propMatch) coverItemPath = resolveOpfPath(opfDir, (propMatch[1] ?? propMatch[2]).trim());
  }

  if (coverItemPath) {
    outputEntries[coverItemPath] = [imageBytes, { level: 6 }];
    const hrefInOpf = coverItemPath.startsWith(opfDir) ? coverItemPath.slice(opfDir.length) : coverItemPath;
    opfXml = opfXml.replace(
      new RegExp(`(<item[^>]+href=["']${escapeRegex(hrefInOpf)}["'][^>]+media-type=["'])[^"']+(["'])`, 'i'),
      `$1${imageType}$2`
    ).replace(
      new RegExp(`(<item[^>]+media-type=["'])[^"']+(["'][^>]+href=["']${escapeRegex(hrefInOpf)}["'])`, 'i'),
      `$1${imageType}$2`
    );
  } else {
    // パターン3: 新規追加
    const newCoverPath = `${opfDir}Images/cover.${ext}`;
    outputEntries[newCoverPath] = [imageBytes, { level: 6 }];
    const newItemTag = `<item id="cover-image" href="Images/cover.${ext}" media-type="${imageType}" properties="cover-image"/>`;
    opfXml = opfXml.replace(/(\s*)(<\/manifest>)/i, `$1  ${newItemTag}$1$2`);
    if (!/<guide/i.test(opfXml)) {
      const guideTag = `<guide>\n  <reference type="cover" title="Cover" href="Images/cover.${ext}"/>\n</guide>`;
      opfXml = opfXml.replace(/(<\/spine>)/i, `$1\n${guideTag}`);
    }
  }

  outputEntries[opfPath] = [strToU8(opfXml), { level: 6 }];
}

function resolveOpfPath(opfDir: string, href: string): string {
  if (href.startsWith('/')) return href.slice(1);
  return opfDir + href;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    if (!parts.length) { count--; return inner.replace(/<[^>]+>/g, '').trim(); }
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
