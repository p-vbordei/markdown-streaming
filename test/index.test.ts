import { describe, it, expect } from "vitest";
import { render, MarkdownStreamer } from "../src/index.js";

describe("render: blocks", () => {
  it("paragraph", () => {
    expect(render("hello world")).toBe("<p>hello world</p>");
  });

  it("two paragraphs separated by blank line", () => {
    expect(render("one\n\ntwo")).toBe("<p>one</p>\n<p>two</p>");
  });

  it("headings", () => {
    expect(render("# H1\n## H2\n### H3")).toContain("<h1>H1</h1>");
    expect(render("## H2")).toBe("<h2>H2</h2>");
    expect(render("###### H6")).toBe("<h6>H6</h6>");
  });

  it("unordered list", () => {
    const out = render("- a\n- b\n- c");
    expect(out).toBe("<ul>\n<li>a</li>\n<li>b</li>\n<li>c</li>\n</ul>");
  });

  it("ordered list", () => {
    const out = render("1. a\n2. b");
    expect(out).toBe("<ol>\n<li>a</li>\n<li>b</li>\n</ol>");
  });

  it("blockquote", () => {
    expect(render("> hello")).toBe("<blockquote>hello</blockquote>");
  });

  it("fenced code block", () => {
    const out = render("```js\nconst x = 1;\n```");
    expect(out).toBe('<pre><code class="language-js">const x = 1;</code></pre>');
  });

  it("fenced code without language", () => {
    const out = render("```\nsome code\n```");
    expect(out).toBe("<pre><code>some code</code></pre>");
  });
});

describe("render: inline", () => {
  it("bold", () => {
    expect(render("hello **world**")).toBe("<p>hello <strong>world</strong></p>");
  });
  it("italic with *", () => {
    expect(render("hello *world*")).toBe("<p>hello <em>world</em></p>");
  });
  it("italic with _", () => {
    expect(render("hello _world_")).toBe("<p>hello <em>world</em></p>");
  });
  it("bold inside text", () => {
    expect(render("a **b** c")).toBe("<p>a <strong>b</strong> c</p>");
  });
  it("inline code", () => {
    expect(render("call `foo()` now")).toBe("<p>call <code>foo()</code> now</p>");
  });
  it("link", () => {
    expect(render("[click](https://x.com)")).toBe('<p><a href="https://x.com">click</a></p>');
  });
  it("link with malicious javascript: → neutralized", () => {
    expect(render("[x](javascript:alert(1))")).toContain('href="#"');
  });
  it("strikethrough", () => {
    expect(render("~~gone~~")).toBe("<p><del>gone</del></p>");
  });
});

describe("render: security", () => {
  it("escapes HTML in plain text", () => {
    expect(render("hello <script>alert(1)</script>")).toBe("<p>hello &lt;script&gt;alert(1)&lt;/script&gt;</p>");
  });
  it("escapes inside code blocks", () => {
    expect(render("```\n<b>raw</b>\n```")).toContain("&lt;b&gt;raw&lt;/b&gt;");
  });
  it("escapes inside inline code", () => {
    expect(render("`<script>`")).toBe("<p><code>&lt;script&gt;</code></p>");
  });
});

describe("partial inline: closeUnfinished", () => {
  it("renders unclosed bold as closed", () => {
    const out = render("hello **wor");
    expect(out).toContain("<strong>");
    expect(out).toContain("</strong>");
  });
  it("renders unclosed italic", () => {
    const out = render("hello *wor");
    expect(out).toContain("<em>");
    expect(out).toContain("</em>");
  });
  it("renders unclosed inline code", () => {
    const out = render("call `foo");
    expect(out).toContain("<code>foo</code>");
  });
  it("closeUnfinished: false leaves them raw", () => {
    const out = render("hello **wor", { closeUnfinished: false });
    expect(out).not.toContain("<strong>");
  });
});

describe("partial fenced code", () => {
  it("renders mid-fence content as visible code", () => {
    const out = render("```js\nconst x = 1");
    expect(out).toContain('<pre><code class="language-js">');
    expect(out).toContain("const x = 1");
    expect(out).toContain("</code></pre>");
  });
});

describe("MarkdownStreamer", () => {
  it("accumulates and renders progressively", () => {
    const s = new MarkdownStreamer();
    let html = s.feed("# Hello");
    expect(html).toBe("<h1>Hello</h1>");
    html = s.feed("\n\nThe world is **stra");
    expect(html).toContain("<strong>");
    expect(html).toContain("</strong>");
    html = s.feed("nge** indeed.");
    expect(html).toContain("<strong>strange</strong>");
  });

  it("reset() clears the buffer", () => {
    const s = new MarkdownStreamer();
    s.feed("**bold**");
    s.reset();
    expect(s.text).toBe("");
    expect(s.current()).toBe("");
  });
});
