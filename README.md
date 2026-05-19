# markdown-streaming

[![ci](https://github.com/p-vbordei/markdown-streaming/actions/workflows/ci.yml/badge.svg)](https://github.com/p-vbordei/markdown-streaming/actions/workflows/ci.yml)

[![npm](https://img.shields.io/npm/v/markdown-streaming.svg)](https://www.npmjs.com/package/markdown-streaming)
[![downloads](https://img.shields.io/npm/dm/markdown-streaming.svg)](https://www.npmjs.com/package/markdown-streaming)
[![bundle](https://img.shields.io/bundlejs/size/markdown-streaming)](https://bundlejs.com/?q=markdown-streaming)

> Render Markdown to HTML incrementally as tokens arrive from an LLM. Designed for chat UIs: at every chunk boundary, you get valid HTML you can drop straight into the DOM — partial inline pairs (`**unfini`) are auto-closed, half-written code fences render visibly.

```ts
import { MarkdownStreamer, render } from "markdown-streaming";

const s = new MarkdownStreamer();

for await (const chunk of llmTextStream) {
  ui.innerHTML = s.feed(chunk);
}

// One-shot
render("# Hello\n\nThe world is **strange**.");
// "<h1>Hello</h1>\n<p>The world is <strong>strange</strong>.</p>"
```

## Install

```sh
npm install markdown-streaming
```

Works with Node 20+, browsers, Bun, Deno. ESM + CJS.

## Why

Standard Markdown renderers (`marked`, `markdown-it`) assume the input is **complete**. When you're streaming tokens from an LLM, that's never true mid-response — the buffer at any moment has unclosed `**bold` markers, half-written code fences, partial inline code.

Naive solutions:

- Re-render the entire buffer on every token: works but produces flicker (unclosed `**` shows as literal asterisks until the close arrives).
- Only render when complete: defeats the point of streaming.

`markdown-streaming` closes partial inline pairs at the buffer boundary so the rendered HTML is always **structurally valid**. The result: smooth incremental rendering with no flicker.

## Recipes

### React chat UI

```tsx
import { useEffect, useRef, useState } from "react";
import { MarkdownStreamer } from "markdown-streaming";
import { streamText } from "@p-vbordei/llm-stream-parser";

function ChatMessage({ prompt }: { prompt: string }) {
  const [html, setHtml] = useState("");
  const ref = useRef(new MarkdownStreamer());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/llm", { method: "POST", body: prompt });
      for await (const chunk of streamText(res.body!)) {
        if (cancelled) return;
        setHtml(ref.current.feed(chunk));
      }
    })();
    return () => { cancelled = true; };
  }, [prompt]);

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
```

### Vanilla DOM

```ts
import { MarkdownStreamer } from "markdown-streaming";

const s = new MarkdownStreamer();
const el = document.querySelector("#chat")!;

ws.onmessage = (e) => {
  el.innerHTML = s.feed(e.data);
};
```

### One-shot for full documents

```ts
import { render } from "markdown-streaming";

const html = render(await fs.readFile("README.md", "utf8"));
res.send(`<!doctype html><body>${html}</body>`);
```

### Disable partial-closing for finished documents

```ts
import { render } from "markdown-streaming";

// When you know input is complete
render(content, { closeUnfinished: false });
```

### Combine with llm-stream-parser

```ts
import { streamText } from "@p-vbordei/llm-stream-parser";
import { MarkdownStreamer } from "markdown-streaming";

const md = new MarkdownStreamer();
for await (const chunk of streamText(res.body!)) {
  outputEl.innerHTML = md.feed(chunk);
}
```

## What it renders

| Element | Syntax |
|---|---|
| Headings | `#`...`######` |
| Paragraphs | blank-line separated |
| Unordered lists | `-` / `*` / `+` |
| Ordered lists | `1.` |
| Blockquotes | `>` |
| Fenced code | ` ``` ` with optional language |
| Bold | `**...**` / `__...__` |
| Italic | `*...*` / `_..._` |
| Strikethrough | `~~...~~` |
| Inline code | `` `...` `` |
| Links | `[text](url)` |

`javascript:` / `data:` / `vbscript:` / `file:` link schemes are neutralized to `#`. All plain-text content is HTML-escaped.

## Streaming guarantees

At every call to `feed()`, the returned HTML is **structurally valid**:

- Open `**` without close → renders `<strong>...</strong>` until close arrives
- Open `` ` `` without close → renders as `<code>...</code>`
- Inside a `` ``` `` fence with no terminator yet → renders as `<pre><code>...</code></pre>` showing the in-progress code
- Lists / paragraphs are closed cleanly at block boundaries

Set `closeUnfinished: false` if you'd rather leave partial pairs unrendered.

## API

```ts
render(markdown: string, opts?: RenderOptions): string

class MarkdownStreamer {
  feed(chunk: string, opts?: RenderOptions): string;
  current(opts?: RenderOptions): string;  // re-render without feeding
  reset(): void;
  text: string;  // accumulated raw markdown
}

type RenderOptions = { closeUnfinished?: boolean };  // default true
```

## What it does NOT do

This is deliberately a minimal renderer focused on the LLM-chat use case.

- No tables, no footnotes, no task lists, no HTML pass-through, no nested lists, no setext headings, no reference-style links.
- For full CommonMark / GFM compliance, use `marked` or `markdown-it`. They're great but bigger and not streaming-aware.

## License

Apache-2.0 © Vlad Bordei
