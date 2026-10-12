// Tiny markup -> HTML renderer for chapters.js content (see the header there).
// Math is rendered with KaTeX when it is loaded (window.katex); otherwise the
// TeX source is shown in a <code> element so content is never lost.

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function tex(src, display) {
  if (window.katex) {
    try {
      return window.katex.renderToString(src, { displayMode: display, throwOnError: false, output: 'htmlAndMathml' });
    } catch { /* fall through */ }
  }
  return display ? `<pre class="tex-fallback">${esc(src)}</pre>` : `<code class="tex-fallback">${esc(src)}</code>`;
}

/** Inline markup: $math$, `code`, {{key|words}}, **bold**, *italic*. */
export function inline(text) {
  // Pull math and code out first so their contents are not touched by emphasis rules.
  const slots = [];
  const keep = (html) => `\u0000${slots.push(html) - 1}\u0000`;
  let s = text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => keep(tex(m, true)))
    .replace(/\$([^$]+?)\$/g, (_, m) => keep(tex(m, false)))
    .replace(/`([^`]+)`/g, (_, m) => keep(`<code>${esc(m)}</code>`))
    // {{key|words}}: colour-keyed words, linked to marks on the footage (annotations.js)
    .replace(/\{\{(\w+)\|([^}]+)\}\}/g, (_, k, t) => keep(`<span class="key" data-key="${k}" tabindex="0">${esc(t)}</span>`));
  s = esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[+i]);
}

/** Block markup: paragraphs, $$display$$, lists, callouts, tables, ![caption](figure). */
export function render(body) {
  const blocks = body.trim().split(/\n\s*\n/);
  return blocks.map(renderBlock).join('\n');
}

function renderBlock(block) {
  const lines = block.split('\n').map((l) => l.trimEnd());
  const t = block.trim();

  if (t.startsWith('$$') && t.endsWith('$$') && t.length > 4) {
    return `<div class="math-display">${tex(t.slice(2, -2), true)}</div>`;
  }
  const fig = t.match(/^!\[([\s\S]*)\]\(([^)\s]+)\)$/);
  if (fig) {
    const cap = inline(fig[1].replace(/\s*\n\s*/g, ' '));
    return `<figure class="nb-figure"><img src="${esc(fig[2])}" alt="" loading="lazy"><figcaption>${cap}</figcaption></figure>`;
  }
  if (lines.every((l) => l.trim().startsWith('|'))) return renderTable(lines);
  if (lines.every((l) => /^\s*- /.test(l) || /^\s{2,}\S/.test(l))) return renderList(lines, 'ul', /^\s*- /);
  if (lines.every((l) => /^\s*\d+\. /.test(l) || /^\s{2,}\S/.test(l))) return renderList(lines, 'ol', /^\s*\d+\. /);
  if (lines.every((l) => l.startsWith('> '))) {
    return `<aside class="callout">${inline(lines.map((l) => l.slice(2)).join(' '))}</aside>`;
  }
  // Mixed block (e.g. a list item followed by display math): render line groups.
  if (lines.some((l) => /^\s*(- |\d+\. )/.test(l))) {
    const ordered = lines.some((l) => /^\s*\d+\. /.test(l));
    return renderList(lines, ordered ? 'ol' : 'ul', ordered ? /^\s*\d+\. / : /^\s*- /);
  }
  return `<p>${inline(lines.join(' '))}</p>`;
}

function renderList(lines, tag, marker) {
  const items = [];
  for (const l of lines) {
    if (marker.test(l)) items.push(l.replace(marker, ''));
    else if (items.length) items[items.length - 1] += '\n' + l.trim();
    else items.push(l.trim());
  }
  const li = items.map((it) => `<li>${inline(it.replace(/\n/g, ' '))}</li>`).join('');
  return `<${tag}>${li}</${tag}>`;
}

function renderTable(lines) {
  const rows = lines.map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  const [head, ...body] = rows;
  const th = head.map((c) => `<th scope="col">${inline(c)}</th>`).join('');
  const tb = body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`;
}
