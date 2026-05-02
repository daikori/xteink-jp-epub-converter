import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

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
    const outputEntries: Record<string, Uint8Array | [Uint8Array, { level: number }]> = {};

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
        const source = strFromU8(bytes);
        const result = processMarkup(source, options);
        summary.rubyConversions += result.rubyConversions;
        summary.spanInsertions += result.spanInsertions;
        summary.logs.push(`${name}: ruby ${result.rubyConversions}, span ${result.spanInsertions}`);
        outputEntries[name] = [strToU8(result.text), { level: 6 }];
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        summary.warnings.push(`${name}: ${message}`);
        outputEntries[name] = [bytes, { level: 6 }];
      }
    }

    postProgress(90, 'EPUBを再構築中...');

    const orderedEntries: [string, Uint8Array, { level: number }][] = [];
    orderedEntries.push(['mimetype', mimetypeBytes, { level: 0 }]);
    for (const name of names) {
      if (name === 'mimetype') continue;
      const entry = outputEntries[name];
      if (!entry) continue;
      if (Array.isArray(entry)) orderedEntries.push([name, entry[0], entry[1]]);
      else orderedEntries.push([name, entry, { level: 6 }]);
    }

    const zipped = zipSync(
      Object.fromEntries(orderedEntries.map(([name, data, options]) => [name, [data, options]])),
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

function processMarkup(source: string, options: Options) {
  const parser = new DOMParser();
  let document = parser.parseFromString(source, 'application/xhtml+xml');
  if (document.querySelector('parsererror')) {
    document = parser.parseFromString(source, 'text/html');
  }

  let rubyConversions = 0;
  let spanInsertions = 0;

  if (options.convertRuby) rubyConversions = convertRubyToParentheses(document);
  if (options.addEmptySpan) spanInsertions = addEmptySpanInsideP(document);

  const serialized = serializeDocument(document, source);
  return { text: serialized, rubyConversions, spanInsertions };
}

function convertRubyToParentheses(document: Document) {
  const rubyTags = Array.from(document.getElementsByTagName('ruby'));
  let count = 0;

  for (const rubyTag of rubyTags) {
    const convertedParts: string[] = [];
    let currentText = '';

    for (const child of Array.from(rubyTag.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        currentText += child.textContent ?? '';
        continue;
      }

      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const element = child as Element;
      const tag = element.tagName.toLowerCase();

      if (tag === 'rb') {
        currentText += element.textContent ?? '';
      } else if (tag === 'rt') {
        const rubyText = element.textContent ?? '';
        convertedParts.push(currentText ? `${currentText}（${rubyText}）` : `（${rubyText}）`);
        currentText = '';
      } else if (tag === 'rp') {
      } else {
        currentText += element.textContent ?? '';
      }
    }

    if (currentText) convertedParts.push(currentText);
    rubyTag.replaceWith(document.createTextNode(convertedParts.join('')));
    count += 1;
  }

  return count;
}

function addEmptySpanInsideP(document: Document) {
  const pTags = Array.from(document.getElementsByTagName('p'));
  let count = 0;

  for (const pTag of pTags) {
    const firstElement = pTag.firstElementChild;
    if (firstElement && firstElement.tagName.toLowerCase() === 'span' && firstElement.childNodes.length === 0) {
      continue;
    }
    const span = document.createElement('span');
    pTag.insertBefore(span, pTag.firstChild);
    count += 1;
  }

  return count;
}

function serializeDocument(document: Document, original: string) {
  if (/^\s*<\?xml/i.test(original)) {
    return `<?xml version="1.0" encoding="utf-8"?>\n${new XMLSerializer().serializeToString(document)}`;
  }
  const doctype = document.doctype
    ? `<!DOCTYPE ${document.doctype.name}${document.doctype.publicId ? ` PUBLIC "${document.doctype.publicId}"` : ''}${document.doctype.systemId ? ` "${document.doctype.systemId}"` : ''}>\n`
    : '';
  return `${doctype}${new XMLSerializer().serializeToString(document)}`;
}
