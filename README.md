# Xteink JP EPUB Converter

Xteink X4向けにEPUBをブラウザ内だけで整形する静的Webアプリです。
サーバーへのアップロードは一切なく、すべての処理がブラウザ内（Web Worker）で完結します。

## Webアプリ

https://xteink-jp-epub-converter.pages.dev/

## 特徴

- **完全ローカル処理** — EPUBファイルはブラウザ内のみで処理され、外部送信はされません
- **rubyタグ変換** — `<ruby>` を「漢字（かんじ）」形式のテキストへ変換します
- **空spanの挿入** — 各 `<p>` タグの先頭に空の `<span>` を追加します（Xteink X4向けインデント対応）
- **br → emptyP変換** — `<p>` 外の `<br>` タグを `<p> </p>` に変換します
- **表紙画像の置き換え** — 任意の画像でEPUBの表紙を差し替え・新規設定できます
- **Web Worker処理** — UIをブロックせずに変換処理をバックグラウンド実行します
- **進捗表示** — ファイル処理の進捗をリアルタイムで確認できます
- **変換後のEPUBをそのままダウンロード** — 出力ファイル名に `_x4` サフィックスが付きます

## 変換オプション

| オプション | 説明 |
|---|---|
| rubyタグ変換 | `<ruby>` を括弧付きテキストに変換 |
| 空span挿入 | `<p>` 先頭に `<span></span>` を追加 |
| br→emptyP変換 | `<p>` 外の `<br>` を `<p> </p>` に変換 |
| 表紙画像設定 | 既存表紙の置き換えまたは新規追加 |

## 技術スタック

- **Vite** + **TypeScript**
- **fflate** — ZIP/EPUB の展開・再圧縮
- **Web Worker** — バックグラウンド処理
- **Cloudflare Pages** — ホスティング

## 開発

```bash
npm install
npm run dev
```

## ビルド

```bash
npm run build
```

ビルド成果物は `dist/` に出力されます。

## Cloudflare Pages デプロイ設定

| 項目 | 値 |
|---|---|
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |

## 注意

- 大きなEPUBではブラウザのメモリ使用量が増えることがあります
- 壊れたXHTMLはスキップして処理を継続します
- 完全にローカル処理ですが、利用は自己責任でお願いします
