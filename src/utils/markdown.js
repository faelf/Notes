import { Marked } from 'marked';
import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';

const markedInstance = new Marked({
  gfm: true,
  breaks: false,
});

const renderer = {
  code({ text, lang }) {
    const language = (lang || '').trim().split(/\s+/)[0];
    let highlighted;
    let displayLang = language || 'text';

    if (language && hljs.getLanguage(language)) {
      highlighted = hljs.highlight(text, { language }).value;
    } else {
      const auto = hljs.highlightAuto(text);
      highlighted = auto.value;
      if (!language && auto.language) {
        displayLang = auto.language;
      }
    }

    const encodedRaw = encodeURIComponent(text);
    return `<div class="code-block-wrapper"><div class="code-block-header"><span class="code-lang">${escapeHtml(
      displayLang
    )}</span><button type="button" class="code-copy-btn" data-copy-code="${encodedRaw}" title="Copy code">Copy</button></div><pre><code class="hljs language-${escapeHtml(
      displayLang
    )}">${highlighted}</code></pre></div>`;
  },

  link({ href, title, tokens }) {
    const text = this.parser.parseInline(tokens);
    const safeHref = href || '';
    if (safeHref.startsWith('wikilink:')) {
      const target = decodeURIComponent(safeHref.slice('wikilink:'.length));
      return `<a href="#" class="wikilink" data-wikilink="${escapeHtml(target)}" title="Open note: ${escapeHtml(
        target
      )}">${text}</a>`;
    }
    const isExternal = /^https?:\/\//i.test(safeHref);
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    const externalAttrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${escapeHtml(safeHref)}"${titleAttr}${externalAttrs}>${text}</a>`;
  },
};

markedInstance.use({ renderer });

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Extracts optional YAML frontmatter from the start of a Markdown document.
 */
export function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return { frontmatter: null, body: markdown };
  }
  const rawYaml = match[1];
  const entries = [];
  for (const line of rawYaml.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();
      entries.push({ key, value });
    }
  }
  return {
    frontmatter: entries.length > 0 ? entries : null,
    body: markdown.slice(match[0].length),
  };
}

/**
 * Converts Obsidian-style [[Target]] or [[Target|Alias]] links into standard Markdown links
 * outside fenced code blocks and inline code spans.
 */
function transformWikilinks(markdown) {
  // Split by fenced code blocks first so we don't rewrite code examples
  const segments = markdown.split(/(```[\s\S]*?```|`[^`\n]+`)/g);
  return segments
    .map((seg, idx) => {
      if (idx % 2 === 1) return seg;
      return seg.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, alias) => {
        const cleanTarget = target.trim();
        const label = (alias || cleanTarget).trim();
        return `[${label}](wikilink:${encodeURIComponent(cleanTarget)})`;
      });
    })
    .join('');
}

export function renderMarkdown(rawMarkdown) {
  const { frontmatter, body } = parseFrontmatter(rawMarkdown || '');
  const withWikilinks = transformWikilinks(body);
  const unsafeHtml = markedInstance.parse(withWikilinks);

  // Allow data-wikilink, data-copy-code, checkbox inputs, and highlight.js classes
  const cleanHtml = DOMPurify.sanitize(unsafeHtml, {
    ADD_ATTR: ['target', 'rel', 'data-wikilink', 'data-copy-code', 'type', 'checked', 'disabled'],
    ADD_TAGS: ['input', 'button'],
  });

  // Enable task-list checkboxes with sequential indices for interactive toggling
  let checkboxIdx = 0;
  const interactiveHtml = cleanHtml.replace(
    /<input([^>]*type="checkbox"[^>]*)>/gi,
    (_match, attrs) => {
      const idx = checkboxIdx++;
      const cleanedAttrs = attrs.replace(/\s*disabled(?:="[^"]*")?/gi, '');
      return `<input${cleanedAttrs} data-task-index="${idx}" class="task-checkbox">`;
    }
  );

  return {
    frontmatter,
    html: interactiveHtml,
  };
}

/**
 * Toggles the Nth GFM task list item (- [ ] / - [x]) in raw Markdown text.
 */
export function toggleMarkdownCheckbox(rawMarkdown, targetIndex) {
  const lines = rawMarkdown.split('\n');
  let inFence = false;
  let count = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = line.match(/^(\s*(?:[-*+]|\d+\.)\s+\[)([ xX])(\]\s.*)$/);
    if (match) {
      if (count === targetIndex) {
        const nextMark = match[2].toLowerCase() === 'x' ? ' ' : 'x';
        lines[i] = `${match[1]}${nextMark}${match[3]}`;
        return lines.join('\n');
      }
      count++;
    }
  }
  return rawMarkdown;
}
