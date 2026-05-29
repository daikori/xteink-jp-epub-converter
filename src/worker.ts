import { unzipSync, zipSync, strToU8 } from 'fflate';

type Options = {
  convertRuby: boolean;
  addEmptySpan: boolean;
  convertVerticalChars: boolean;
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
  verticalCharConversions: number;
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
    const summary: Summary = { htmlFiles: 0, rubyConversions: 0, spanInsertions: 0, verticalCharConversions: 0, warnings: [], logs: [] };
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
        summary.verticalCharConversions += result.verticalCharConversions;
        summary.logs.push(`${name}: ruby=${result.rubyConversions}, span=${result.spanInsertions}, tate=${result.verticalCharConversions}`);
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
    if (options.convertVerticalChars && summary.verticalCharConversions === 0 && summary.htmlFiles > 0) {
      summary.logs.push('INFO: 縦書き変換対象の文字が見つかりませんでした');
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
  let verticalCharConversions = 0;

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

  if (options.convertVerticalChars) {
    const result = convertVerticalChars(text);
    text = result.text;
    verticalCharConversions = result.count;
  }

  return { text, rubyConversions, spanInsertions, verticalCharConversions };
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
 * 縦書き表示で横向きになりやすい文字を縦書き用Unicode文字に変換する。
 *
 * narou.rb (whiteleaf7/narou) の converterbase.rb における文字変換処理を参考に、
 * EPUBフォント環境で罫線・括弧・記号が横向きのまま表示される問題に対応する。
 *
 * 変換対象：
 *   - ダッシュ/罫線類：― ‥ … ー（長音連続）など
 *   - 括弧類：全角括弧を縦書き用Presentation Formsへ
 *   - その他記号：縦組み向けUnicode文字への置換
 *
 * テキストノード（タグ外のテキスト）のみを変換し、HTMLタグ属性・CDATA内は変更しない。
 */
function convertVerticalChars(source: string): { text: string; count: number } {
  let count = 0;

  // HTMLタグ・タグ属性を保護しながらテキストノード部分のみ変換する
  // タグを分割子として使い、タグでない部分（テキストノード）にのみ変換を適用する
  const text = source.replace(/(<[^>]*>)|([^<]+)/g, (_match, tag, textNode) => {
    // タグ部分はそのまま返す
    if (tag !== undefined) return tag;
    // テキストノードを変換
    const replaced = replaceVerticalCharsInText(textNode);
    count += replaced.count;
    return replaced.text;
  });

  return { text, count };
}

/**
 * テキスト文字列に対して縦書き向け文字置換を実施する。
 *
 * 変換ルール（narou.rb converterbase.rb 準拠）:
 * 1. 罫線類 ― (U+2015 HORIZONTAL BAR) → ︱ (U+FE31 VERTICAL EM DASH)
 *    ※ EPUBフォントで ― が横向き罫線として描画されるケースへの対応
 * 2. 二点リーダー ‥ (U+2025) → ︰ (U+FE30 VERTICAL TWO DOT LEADER)
 * 3. 三点リーダー … (U+2026) → ︙ (U+FE19 VERTICAL HORIZONTAL ELLIPSIS)
 * 4. 全角ダッシュ — (U+2014 EM DASH) も縦向きへ → ︱ (U+FE31)
 * 5. 括弧類を縦書き用Presentation Formsへ
 *    （ → ︵  ） → ︶
 *    ｛ → ︷  ｝ → ︸
 *    〔 → ︹  〕 → ︺
 *    【 → ︻  】 → ︼
 *    《 → ︽  》 → ︾
 *    〈 → ︿  〉 → ﹀
 *    「 → ﹁  」 → ﹂
 *    『 → ﹃  』 → ﹄
 */
function replaceVerticalCharsInText(text: string): { text: string; count: number } {
  let count = 0;

  // 変換テーブル: [変換前, 変換後] のペア
  // narou.rb が縦書き用に変換・推奨する文字セットに準拠
  const VERTICAL_CHAR_MAP: [RegExp, string][] = [
    // 罫線・ダッシュ類
    [/\u2015/g, '\uFE31'],  // ― HORIZONTAL BAR → ︱ VERTICAL EM DASH
    [/\u2014/g, '\uFE31'],  // — EM DASH → ︱ VERTICAL EM DASH
    [/\u2025/g, '\uFE30'],  // ‥ TWO DOT LEADER → ︰ VERTICAL TWO DOT LEADER
    [/\u2026/g, '\uFE19'],  // … HORIZONTAL ELLIPSIS → ︙ VERTICAL HORIZONTAL ELLIPSIS
    // 括弧類（全角 → 縦書き用Presentation Forms）
    [/\uFF08/g, '\uFE35'],  // （ FULLWIDTH LEFT PARENTHESIS → ︵
    [/\uFF09/g, '\uFE36'],  // ） FULLWIDTH RIGHT PARENTHESIS → ︶
    [/\uFF5B/g, '\uFE37'],  // ｛ FULLWIDTH LEFT CURLY BRACKET → ︷
    [/\uFF5D/g, '\uFE38'],  // ｝ FULLWIDTH RIGHT CURLY BRACKET → ︸
    [/\u3014/g, '\uFE39'],  // 〔 LEFT TORTOISE SHELL BRACKET → ︹
    [/\u3015/g, '\uFE3A'],  // 〕 RIGHT TORTOISE SHELL BRACKET → ︺
    [/\u3010/g, '\uFE3B'],  // 【 LEFT BLACK LENTICULAR BRACKET → ︻
    [/\u3011/g, '\uFE3C'],  // 】 RIGHT BLACK LENTICULAR BRACKET → ︼
    [/\u300A/g, '\uFE3D'],  // 《 LEFT DOUBLE ANGLE BRACKET → ︽
    [/\u300B/g, '\uFE3E'],  // 》 RIGHT DOUBLE ANGLE BRACKET → ︾
    [/\u3008/g, '\uFE3F'],  // 〈 LEFT ANGLE BRACKET → ︿
    [/\u3009/g, '\uFE40'],  // 〉 RIGHT ANGLE BRACKET → ﹀
    [/\u300C/g, '\uFE41'],  // 「 LEFT CORNER BRACKET → ﹁
    [/\u300D/g, '\uFE42'],  // 」 RIGHT CORNER BRACKET → ﹂
    [/\u300E/g, '\uFE43'],  // 『 LEFT WHITE CORNER BRACKET → ﹃
    [/\u300F/g, '\uFE44'],  // 』 RIGHT WHITE CORNER BRACKET → ﹄
  ];

  let result = text;
  for (const [pattern, replacement] of VERTICAL_CHAR_MAP) {
    const before = result;
    result = result.replace(pattern, replacement);
    if (result !== before) {
      // 変換された文字数をカウント（置換回数を加算）
      const matches = before.match(pattern);
      if (matches) count += matches.length;
    }
  }

  return { text: result, count };
}

/**
 * <p>...</p> の先頭に空の <span></span> を挿入する。
 */
function addEmptySpanInsideP(source: string): { text: string; count: number } {
  let count = 0;

  const text = source.replace(/(<p([ \t][^>]*)?>)/gi, (_match, openTag) => {
    count++;
    return `${openTag}<span></span>`;
  });

  // 二重挿入ガード: 先頭に既に空 span があれば除去
  const deduped = text.replace(/(<p(?:[ \t][^>]*)?>)(<span><\/span>){2,}/gi, '$1<span></span>');

  return { text: deduped, count };
}
