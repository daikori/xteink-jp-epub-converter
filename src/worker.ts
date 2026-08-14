import { zipSync, strToU8 } from 'fflate';
import { unzipSync } from 'fflate';

type CoverMode = 'none' | 'generate';

type CoverOptions =
  | { mode: 'none' }
  | { mode: 'generate'; imageBuffer: ArrayBuffer; imageType: string };

type IndentMode = 'legacy' | 'newFirmware';
type BrMode = 'legacy' | 'newFirmware';

type Options = {
  convertRuby: boolean;
  applyIndent: boolean;
  indentMode: IndentMode;
  applyBr: boolean;
  brMode: BrMode;
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

type BuildAozoraRequest = {
  type: 'build_aozora';
  payload: {
    xhtmlBytes: ArrayBuffer;
    title: string;
    author: string;
    options: Options;
  };
};

type Summary = {
  htmlFiles: number;
  rubyConversions: number;
  indentConversions: number;
  brConversions: number;
  warnings: string[];
  logs: string[];
};

const ctx: Worker = self as unknown as Worker;

ctx.onmessage = (event: MessageEvent<ProcessRequest | BuildAozoraRequest>) => {
  if (event.data.type === 'build_aozora') {
    try {
      const { xhtmlBytes, title, author, options } = event.data.payload;
      const summary: Summary = {
        htmlFiles: 1,
        rubyConversions: 0,
        indentConversions: 0,
        brConversions: 0,
        warnings: [],
        logs: [],
      };

      postProgress(10, '文字コードを判定・デコード中...');
      const rawXhtml = decodeBytes(new Uint8Array(xhtmlBytes));

      postProgress(20, 'Xteink向け変換処理中...');
      const processed = processMarkup(rawXhtml, options);
      summary.rubyConversions = processed.rubyConversions;
      summary.indentConversions = processed.indentConversions;
      summary.brConversions = processed.brConversions;
      summary.logs.push(
        `content.xhtml: ruby=${processed.rubyConversions}, indent=${processed.indentConversions}, br=${processed.brConversions}`,
      );

      postProgress(40, 'XHTML を正規化中...');
      const safeTitle  = escapeXml(title  || '無題');
      const safeAuthor = escapeXml(author || '');
      const bookId     = `aozora-${Date.now()}`;
      const hasImage   = options.cover.mode === 'generate';

      const bodyContent = extractBodyContent(processed.text);

      const contentXhtml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE html>',
        '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"',
        '      xml:lang="ja" lang="ja">',
        '<head>',
        '  <meta charset="UTF-8"/>',
        `  <title>${safeTitle}</title>`,
        '  <link rel="stylesheet" type="text/css" href="style.css"/>',
        '</head>',
        '<body>',
        bodyContent,
        '</body>',
        '</html>',
      ].join('\n');

      const navXhtml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE html>',
        '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"',
        '      xml:lang="ja" lang="ja">',
        '<head>',
        '  <meta charset="UTF-8"/>',
        `  <title>${safeTitle}</title>`,
        '</head>',
        '<body>',
        '  <nav epub:type="toc" id="toc">',
        `    <h1>${safeTitle}</h1>`,
        '    <ol>',
        `      <li><a href="content.xhtml">${safeTitle}</a></li>`,
        '    </ol>',
        '  </nav>',
        '</body>',
        '</html>',
      ].join('\n');

      const verticalCss = [
        '@charset "UTF-8";',
        '',
        'html {',
        '  writing-mode: vertical-rl;',
        '  -webkit-writing-mode: vertical-rl;',
        '  -epub-writing-mode: vertical-rl;',
        '}',
        '',
        'body {',
        '  writing-mode: vertical-rl;',
        '  -webkit-writing-mode: vertical-rl;',
        '  -epub-writing-mode: vertical-rl;',
        '  font-family: "ヒラギノ明朝 ProN", "Hiragino Mincho ProN", "游明朝", "YuMincho", serif;',
        '  font-size: 1em;',
        '  line-height: 1.8;',
        '}',
        '',
        'p {',
        '  margin: 0;',
        '  text-indent: 1em;',
        '}',
        '',
        'h1, h2, h3, h4, h5, h6 {',
        '  font-weight: bold;',
        '}',
      ].join('\n');

      postProgress(60, 'EPUB 3 メタデータを生成中...');

      const coverManifestItem = hasImage
        ? '\n    <item id="cover-image" href="Images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>'
        : '';
      const coverMetaMeta = hasImage
        ? '\n    <meta name="cover" content="cover-image"/>'
        : '';

      const contentOpf = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<package xmlns="http://www.idpf.org/2007/opf"',
        '         xmlns:dc="http://purl.org/dc/elements/1.1/"',
        '         unique-identifier="bookid" version="3.0"',
        '         xml:lang="ja"',
        '         prefix="rendition: http://www.idpf.org/vocab/rendition/#">',
        '  <metadata>',
        `    <dc:title>${safeTitle}</dc:title>`,
        `    <dc:creator>${safeAuthor}</dc:creator>`,
        '    <dc:language>ja</dc:language>',
        `    <dc:identifier id="bookid">${bookId}</dc:identifier>`,
        '    <dc:source>青空文庫</dc:source>',
        '    <meta property="rendition:layout">reflowable</meta>',
        coverMetaMeta,
        '  </metadata>',
        '  <manifest>',
        '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
        '    <item id="content" href="content.xhtml" media-type="application/xhtml+xml"/>',
        '    <item id="css" href="style.css" media-type="text/css"/>',
        coverManifestItem,
        '  </manifest>',
        '  <spine page-progression-direction="rtl">',
        '    <itemref idref="content"/>',
        '  </spine>',
        '</package>',
      ].join('\n');

      const containerXml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">',
        '  <rootfiles>',
        '    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>',
        '  </rootfiles>',
        '</container>',
      ].join('\n');

      postProgress(80, 'EPUB を組み立て中...');

      const files: Record<string, [Uint8Array, { level: number }]> = {
        'mimetype':                 [strToU8('application/epub+zip'), { level: 0 }],
        'META-INF/container.xml':  [strToU8(containerXml),           { level: 6 }],
        'OEBPS/content.opf':       [strToU8(contentOpf),             { level: 6 }],
        'OEBPS/nav.xhtml':         [strToU8(navXhtml),               { level: 6 }],
        'OEBPS/style.css':         [strToU8(verticalCss),            { level: 6 }],
        'OEBPS/content.xhtml':     [strToU8(contentXhtml),           { level: 6 }],
      };

      if (hasImage && options.cover.mode === 'generate' && options.cover.imageBuffer) {
        postProgress(88, '表紙画像を組み込み中...');
        files['OEBPS/Images/cover.jpg'] = [
          new Uint8Array(options.cover.imageBuffer),
          { level: 0 },
        ];
        summary.logs.push('INFO: 表紙を自動生成して設定しました');
      }

      postProgress(94, 'ZIP 圧縮中...');
      const zipped = zipSync(files, { level: 6 });

      const safeFileName = title.replace(/[\\/:*?"<>|]/g, '_') || 'aozora';
      const blob = new Blob([zipped], { type: 'application/epub+zip' });
      ctx.postMessage({
        type: 'done',
        payload: { blob, fileName: `${safeFileName}_x4.epub`, summary },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.postMessage({ type: 'error', payload: { message } });
    }
    return;
  }

  if (event.data.type !== 'process') return;

  try {
    const { fileName, fileBuffer, options } = event.data.payload;
    postProgress(5, 'EPUBを展開中...');

    const zipEntries = unzipSync(new Uint8Array(fileBuffer));
    const summary: Summary = {
      htmlFiles: 0,
      rubyConversions: 0,
      indentConversions: 0,
      brConversions: 0,
      warnings: [],
      logs: [],
    };
    const outputEntries: Record<string, [Uint8Array, { level: number }]> = {};

    const names = Object.keys(zipEntries);
    if (!names.includes('mimetype'))
      throw new Error('mimetype が見つかりません。EPUBではないかもしれません。');

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
      postProgress(
        8 + (processed / Math.max(htmlNames.length, 1)) * 74,
        `${name} を処理中...`,
      );
      try {
        const source = decodeBytes(bytes);
        const result = processMarkup(source, options);
        summary.rubyConversions += result.rubyConversions;
        summary.indentConversions += result.indentConversions;
        summary.brConversions   += result.brConversions;
        summary.logs.push(
          `${name}: ruby=${result.rubyConversions}, indent=${result.indentConversions}, br=${result.brConversions}`,
        );
        outputEntries[name] = [strToU8(result.text), { level: 6 }];
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        summary.warnings.push(`${name}: ${message}`);
        outputEntries[name] = [bytes, { level: 6 }];
      }
    }

    if (options.convertRuby && summary.rubyConversions === 0 && summary.htmlFiles > 0)
      summary.logs.push('INFO: ルビタグが見つかりませんでした（元のEPUBにルビがない可能性があります）');
    if (options.applyIndent && summary.indentConversions === 0 && summary.htmlFiles > 0)
      summary.logs.push(
        options.indentMode === 'legacy'
          ? 'INFO: <p>タグが見つかりませんでした'
          : 'INFO: <p>タグが見つからず、セクション結合を行いませんでした',
      );
    if (options.applyBr && summary.brConversions === 0 && summary.htmlFiles > 0)
      summary.logs.push(
        options.brMode === 'legacy'
          ? 'INFO: pタグ外の<br>タグが見つかりませんでした'
          : 'INFO: pタグ外の<br>タグが見つからず、<p>　<br /></p>への変換は発生しませんでした',
      );

    if (options.cover.mode === 'generate' && options.cover.imageBuffer) {
      postProgress(85, '表紙を適用中...');
      try {
        applyCoverToEpub(
          outputEntries,
          options.cover.imageBuffer,
          options.cover.imageType,
          names,
        );
        summary.logs.push('INFO: 表紙を自動生成して設定しました');
      } catch (e) {
        summary.warnings.push(
          `表紙設定に失敗: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    postProgress(90, 'EPUBを再構築中...');

    const orderedEntries: [string, Uint8Array, { level: number }][] = [
      ['mimetype', mimetypeBytes, { level: 0 }],
    ];
    for (const name of names) {
      if (name === 'mimetype') continue;
      const entry = outputEntries[name];
      if (entry) orderedEntries.push([name, entry[0], entry[1]]);
    }
    for (const [key, entry] of Object.entries(outputEntries)) {
      if (!names.includes(key) && key !== 'mimetype')
        orderedEntries.push([key, entry[0], entry[1]]);
    }

    const zipped = zipSync(
      Object.fromEntries(
        orderedEntries.map(([name, data, opts]) => [name, [data, opts]]),
      ),
      { level: 6 },
    );
    const outputName = buildOutputName(fileName);
    const blob = new Blob([zipped], { type: 'application/epub+zip' });
    ctx.postMessage({ type: 'done', payload: { blob, fileName: outputName, summary } });
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

function extractBodyContent(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch ? bodyMatch[1].trim() : html.trim();
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function applyCoverToEpub(
  outputEntries: Record<string, [Uint8Array, { level: number }]>,
  imageBuffer: ArrayBuffer,
  imageType: string,
  originalNames: string[],
): void {
  const containerKey = originalNames.find((n) =>
    /META-INF\/container\.xml$/i.test(n),
  );
  if (!containerKey) throw new Error('META-INF/container.xml が見つかりません');
  const containerXml = new TextDecoder().decode(outputEntries[containerKey][0]);
  const opfPathMatch = containerXml.match(/full-path=["']([^"']+\.opf)["']/i);
  if (!opfPathMatch) throw new Error('OPFパスが取得できませんでした');
  const opfPath = opfPathMatch[1];
  const opfKey = originalNames.find((n) => n === opfPath) ?? opfPath;
  if (!outputEntries[opfKey]) throw new Error(`OPFファイルが見つかりません: ${opfPath}`);
  let opfXml = new TextDecoder().decode(outputEntries[opfKey][0]);
  const opfDir = opfPath.includes('/')
    ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1)
    : '';

  let coverHref: string | null = null;
  const metaCoverMatch =
    opfXml.match(/<meta[^>]+name=["']cover["'][^>]+content=["']([^"']+)["'][^>]*>/i) ??
    opfXml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']cover["'][^>]*>/i);
  if (metaCoverMatch) {
    const coverId = metaCoverMatch[1];
    const itemMatch =
      opfXml.match(new RegExp(`<item[^>]+id=["']${coverId}["'][^>]+href=["']([^"']+)["']`, 'i')) ??
      opfXml.match(new RegExp(`<item[^>]+href=["']([^"']+)["'][^>]+id=["']${coverId}["']`, 'i'));
    if (itemMatch) coverHref = itemMatch[1];
  }
  if (!coverHref) {
    const propMatch =
      opfXml.match(/<item[^>]+properties=["'][^"']*cover-image[^"']*["'][^>]+href=["']([^"']+)["']/i) ??
      opfXml.match(/<item[^>]+href=["']([^"']+)["'][^>]+properties=["'][^"']*cover-image[^"']*["']/i);
    if (propMatch) coverHref = propMatch[1];
  }

  const ext = imageType === 'image/png' ? 'png' : 'jpg';
  const imageBytes = new Uint8Array(imageBuffer);

  if (coverHref) {
    const fullCoverPath = opfDir + coverHref;
    const existingKey = originalNames.find((n) => n === fullCoverPath) ?? fullCoverPath;
    outputEntries[existingKey] = [imageBytes, { level: 0 }];
    opfXml = opfXml.replace(
      new RegExp(
        `(<item[^>]+href=["']${coverHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]+media-type=["'])[^"']+(["'])`,
        'i',
      ),
      `$1${imageType}$2`,
    );
  } else {
    const newCoverRelPath = `Images/cover.${ext}`;
    outputEntries[`${opfDir}${newCoverRelPath}`] = [imageBytes, { level: 0 }];
    opfXml = opfXml.replace(
      /(<manifest[^>]*>)/i,
      `$1\n    <item id="cover-image" href="${newCoverRelPath}" media-type="${imageType}" properties="cover-image"/>`,
    );
    if (!/<guide[^>]*>/i.test(opfXml)) {
      opfXml = opfXml.replace(
        /(<\/package>)/i,
        `  <guide>\n    <reference type="cover" title="Cover" href="${newCoverRelPath}"/>\n  </guide>\n$1`,
      );
    } else {
      opfXml = opfXml.replace(
        /(<guide[^>]*>)/i,
        `$1\n    <reference type="cover" title="Cover" href="${newCoverRelPath}"/>`,
      );
    }
  }
  outputEntries[opfKey] = [strToU8(opfXml), { level: 6 }];
}

function decodeBytes(bytes: Uint8Array): string {
  const probe = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 512));
  const xmlEnc  = probe.match(/<?xml[^>]*encoding=["']([^"']+)["']/i);
  const metaEnc = probe.match(/<meta[^>]+charset=["']?([\w-]+)["'?]/i);
  const charset = (xmlEnc?.[1] || metaEnc?.[1] || 'utf-8').toLowerCase();
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
}

function processMarkup(source: string, options: Options) {
  let text = source;
  let rubyConversions = 0;
  let indentConversions = 0;
  let brConversions = 0;

  if (options.convertRuby) {
    const r = convertRubyToParentheses(text);
    text = r.text;
    rubyConversions = r.count;
  }

  if (options.applyBr) {
    if (options.brMode === 'legacy') {
      const r = convertBrToEmptyP(text);
      text = r.text;
      brConversions = r.count;
    } else {
      const r = convertBrToDoubleTag(text);
      text = r.text;
      brConversions = r.count;
    }
  }

  if (options.applyIndent) {
    if (options.indentMode === 'legacy') {
      const r = addEmptySpanInsideP(text);
      text = r.text;
      indentConversions = r.count;
    } else {
      const r = wrapSectionAsSingleP(text);
      text = r.text;
      indentConversions = r.count;
    }
  }

  return { text, rubyConversions, indentConversions, brConversions };
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
      const baseText = before
        .replace(/<rb[^>]*>([\s\S]*?)<\/rb>/gi, '$1')
        .replace(/<[^>]+>/g, '')
        .trim();
      const rubyText = rtMatch[1].replace(/<[^>]+>/g, '').trim();
      parts.push(baseText ? `${baseText}\uff08${rubyText}\uff09` : `\uff08${rubyText}\uff09`);
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
    /<p(?:\s[^>]*)?>(\s*<br\s*\/?\s*>\s*)+<\/p\s*>/gi,
    () => { count++; return '<p> </p>'; },
  );
  let depth = 0;
  text = text.replace(
    /(<\/p\s*>)|(<p(?:\s[^>]*)?>)|(<br\s*\/?>)/gi,
    (match, closeP, openP, br) => {
      if (openP  !== undefined) { depth++; return match; }
      if (closeP !== undefined) { if (depth > 0) depth--; return match; }
      if (br    !== undefined && depth === 0) { count++; return '<p> </p>'; }
      return match;
    },
  );
  return { text, count };
}

function convertBrToDoubleTag(source: string): { text: string; count: number } {
  let count = 0;
  let text = source;

  text = text.replace(
    /<p(?:\s[^>]*)?>(\s*<br\s*\/?\s*>\s*)+<\/p\s*>/gi,
    () => {
      count++;
      return '<p>\u3000<br /></p>';
    }
  );

  let depth = 0;
  text = text.replace(
    /(<\/p\s*>)|(<p(?:\s[^>]*)?>)|(<br\s*\/?>)/gi,
    (match, closeP, openP, br) => {
      if (openP !== undefined) { depth++; return match; }
      if (closeP !== undefined) { if (depth > 0) depth--; return match; }
      if (br !== undefined && depth === 0) {
        count++;
        return '<p>\u3000<br /></p>';
      }
      return match;
    }
  );

  return { text, count };
}

function addEmptySpanInsideP(source: string): { text: string; count: number } {
  let count = 0;
  const brOnlyP =
    /^<p(?:\s[^>]*)?>(?=(?:\s|<br\s*\/?>|\u00a0)(?:\s|<br\s*\/?>|\u00a0)*<\/p)(?:\s|<br\s*\/?>|\u00a0)+<\/p\s*>$/i;
  const text = source.replace(
    /(<p(?:[ \t][^>]*)?>)([\s\S]*?)(<\/p\s*>)/gi,
    (match, openTag, inner, closeTag) => {
      if (brOnlyP.test(match)) return match;
      count++;
      return `${openTag}<span></span>${inner}${closeTag}`;
    },
  );
  const deduped = text.replace(
    /(<p(?:[ \t][^>]*)?>)(<span><\/span>){2,}/gi,
    '$1<span></span>',
  );
  return { text: deduped, count };
}

function wrapSectionAsSingleP(source: string): { text: string; count: number } {
  const pBlockRegex = /<p(?:[ \t][^>]*)?>([\s\S]*?)<\/p\s*>/gi;
  let count = 0;
  let result = '';
  let cursor = 0;
  let buffer: string[] = [];
  let match: RegExpExecArray | null;

  const flush = () => {
    if (buffer.length === 0) return;
    result += `<p>${buffer.join('<br />')}<br /></p>`;
    buffer = [];
    count++;
  };

  while ((match = pBlockRegex.exec(source)) !== null) {
    const gap = source.slice(cursor, match.index);
    if (gap.trim() !== '') {
      flush();
      result += gap;
    }
    buffer.push(match[1]);
    cursor = match.index + match[0].length;
  }

  flush();
  result += source.slice(cursor);

  return { text: result, count };
}
