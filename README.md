# Xteink JP EPUB Converter

Xteink X4向けにEPUBをブラウザ内だけで整形する静的Webアプリです。

## 特徴

- EPUBファイルはブラウザ内だけで処理されます
- rubyタグを「漢字（かんじ）」形式へ変換します
- 各`p`タグの先頭に空の`span`を追加できます
- 変換後のEPUBをそのままダウンロードできます

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

## Cloudflare Pages

- Framework preset: Vite
- Build command: `npm run build`
- Build output directory: `dist`

## 注意

- 大きなEPUBではブラウザメモリ使用量が増えることがあります
- 壊れたXHTMLはスキップして継続します
- 完全にローカル処理ですが、利用者には自己責任での確認を案内してください
