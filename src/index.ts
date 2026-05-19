const HTML_ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESC[c]!);
}

function safeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^(?:javascript|data|vbscript|file):/i.test(trimmed)) return "#";
  return escapeHtml(trimmed);
}

export interface RenderOptions {
  /**
   * When true (default), partial inline pairs at the buffer's end are closed
   * temporarily so the rendered HTML is always valid mid-stream.
   */
  closeUnfinished?: boolean;
}

/** Render inline markdown to HTML. Operates on a single line of text. */
function renderInline(input: string, opts: RenderOptions): string {
  const closeUnfinished = opts.closeUnfinished !== false;

  // Tokenize into code spans (`...`) vs text. Within code, no further
  // markdown is applied; HTML is escaped strictly.
  type Segment = { kind: "code" | "text"; value: string; closed?: boolean };
  const segments: Segment[] = [];
  let i = 0;
  while (i < input.length) {
    if (input[i] === "`") {
      const close = input.indexOf("`", i + 1);
      if (close < 0) {
        // Unclosed code span at end of buffer.
        segments.push({ kind: "code", value: input.slice(i + 1), closed: false });
        i = input.length;
      } else {
        segments.push({ kind: "code", value: input.slice(i + 1, close), closed: true });
        i = close + 1;
      }
    } else {
      let next = input.indexOf("`", i);
      if (next < 0) next = input.length;
      segments.push({ kind: "text", value: input.slice(i, next) });
      i = next;
    }
  }

  const parts = segments.map((seg) => {
    if (seg.kind === "code") {
      if (seg.closed) return `<code>${escapeHtml(seg.value)}</code>`;
      return closeUnfinished ? `<code>${escapeHtml(seg.value)}</code>` : `\`${escapeHtml(seg.value)}`;
    }
    let text = escapeHtml(seg.value);

    // Links — match before * processing so [text](url) with * inside survives.
    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) => {
      return `<a href="${safeUrl(href)}">${label}</a>`;
    });

    // Strong (**...**)
    text = text.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");

    // Emphasis (*...*) and (_..._)
    text = text.replace(/(?<![*\w])\*([^*\n]+)\*(?!\w)/g, "<em>$1</em>");
    text = text.replace(/(?<![_\w])_([^_\n]+)_(?!\w)/g, "<em>$1</em>");

    // Strikethrough
    text = text.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");

    if (closeUnfinished) {
      // Close trailing unbalanced ** or *.
      const trailingStrong = countMarkers(text, "**");
      if (trailingStrong % 2 === 1) {
        text = replaceLastMarker(text, "**", "<strong>") + "</strong>";
      }
      const trailingEm = countMarkers(text.replace(/\*\*/g, ""), "*");
      if (trailingEm % 2 === 1) {
        text = replaceLastMarker(text, "*", "<em>") + "</em>";
      }
    }
    return text;
  });

  return parts.join("");
}

function countMarkers(s: string, marker: string): number {
  let count = 0;
  let idx = -1;
  while ((idx = s.indexOf(marker, idx + 1)) >= 0) count++;
  return count;
}

function replaceLastMarker(s: string, marker: string, replacement: string): string {
  const idx = s.lastIndexOf(marker);
  if (idx < 0) return s;
  return s.slice(0, idx) + replacement + s.slice(idx + marker.length);
}

/**
 * Render Markdown to HTML, safe to call mid-stream.
 *
 * Supported block elements: headings, fenced code blocks, blockquotes,
 * unordered/ordered lists, paragraphs.
 *
 * Supported inline: bold, italic, strikethrough, inline code, links.
 *
 * Partial code fences render their content visibly as a `<pre><code>` block
 * so the user sees progress while the model is still typing.
 */
export function render(markdown: string, opts: RenderOptions = {}): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let paragraph: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let inFence = false;
  let fenceBuffer: string[] = [];
  let fenceLang = "";

  const flushPara = () => {
    if (!paragraph.length) return;
    out.push(`<p>${renderInline(paragraph.join(" "), opts)}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!listType) return;
    out.push(`</${listType}>`);
    listType = null;
  };

  for (const line of lines) {
    if (inFence) {
      if (/^\s*```/.test(line)) {
        const cls = fenceLang ? ` class="language-${escapeHtml(fenceLang)}"` : "";
        out.push(`<pre><code${cls}>${escapeHtml(fenceBuffer.join("\n"))}</code></pre>`);
        fenceBuffer = [];
        fenceLang = "";
        inFence = false;
      } else {
        fenceBuffer.push(line);
      }
      continue;
    }

    const fenceOpen = line.match(/^\s*```(\w*)\s*$/);
    if (fenceOpen) {
      flushPara();
      flushList();
      inFence = true;
      fenceLang = fenceOpen[1] ?? "";
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushPara();
      flushList();
      const level = heading[1]!.length;
      out.push(`<h${level}>${renderInline(heading[2]!, opts)}</h${level}>`);
      continue;
    }

    const ulItem = line.match(/^\s*[-*+]\s+(.+)$/);
    const olItem = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ulItem || olItem) {
      flushPara();
      const newType: "ul" | "ol" = ulItem ? "ul" : "ol";
      if (listType !== newType) {
        flushList();
        out.push(`<${newType}>`);
        listType = newType;
      }
      const content = (ulItem ?? olItem)![1]!;
      out.push(`<li>${renderInline(content, opts)}</li>`);
      continue;
    } else {
      flushList();
    }

    const bq = line.match(/^>\s?(.*)$/);
    if (bq) {
      flushPara();
      out.push(`<blockquote>${renderInline(bq[1]!, opts)}</blockquote>`);
      continue;
    }

    if (!line.trim()) {
      flushPara();
      continue;
    }

    paragraph.push(line.trim());
  }

  flushPara();
  flushList();

  if (inFence) {
    const cls = fenceLang ? ` class="language-${escapeHtml(fenceLang)}"` : "";
    out.push(`<pre><code${cls}>${escapeHtml(fenceBuffer.join("\n"))}</code></pre>`);
  }

  return out.join("\n");
}

/**
 * Stateful streamer. Feed chunks as they arrive; each call returns the full
 * HTML rendered from everything received so far — always valid HTML.
 */
export class MarkdownStreamer {
  private buffer = "";

  feed(chunk: string, opts?: RenderOptions): string {
    this.buffer += chunk;
    return render(this.buffer, opts);
  }

  /** Render current state without feeding more. */
  current(opts?: RenderOptions): string {
    return render(this.buffer, opts);
  }

  reset(): void {
    this.buffer = "";
  }

  /** The accumulated raw markdown so far. */
  get text(): string {
    return this.buffer;
  }
}
