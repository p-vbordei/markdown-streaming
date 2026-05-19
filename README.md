# markdown-streaming

Render Markdown to HTML **incrementally** as tokens arrive from an LLM. Designed for chat UIs: at every chunk boundary, you get valid HTML you can drop straight into the DOM — partial inline pairs (`**unfini`) are auto-closed, half-written code fences render visibly.

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

Set `closeUnfinished: false` if you'd rather leave partial pairs unrendered (e.g. for batch rendering of complete documents).

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
