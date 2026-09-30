// Baut aus docs-guide/*.md je eine HTML-Seite nach public/.
// Aufruf: npm run build
//
// Unterstützt die MkDocs-Material-Syntax, die der Guide nutzt:
//   !!! typ "Titel"   Hinweisbox
//   ??? typ "Titel"   aufklappbare Box
//   === "Reiter"      Reiter-Gruppe
//   ```mermaid        Diagramm

import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import hljs from 'highlight.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(ROOT, '../docs-guide');
const OUT = path.resolve(ROOT, 'public');
const SITE_TITLE = 'KI-Agenten selbst bauen';

const NAV = [
  { title: 'Start', pages: ['index'] },
  { title: 'Session 1 · Verstehen', pages: ['01-bausteine', '02-harness', '03-pi-aufsetzen', '04-mcp-grundlagen', '05-api-zu-mcp', '06-mcp-was-zaehlt'] },
  { title: 'Session 2 · Bauen', pages: ['07-selbst-bauen', '08-ablauf', '09-abschluss'] }
];
const ORDER = NAV.flatMap(g => g.pages);

// ---------- Hilfen ----------

const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- Shell-Hervorhebung ----------
// highlight.js färbt Shell-Befehle kaum ein. Hier eine eigene, kleine Variante:
// Befehl, Unterbefehl, Flags, Pakete, URLs mit Query-Parametern, Kommentare.

const SHELL_LANGS = new Set(['bash', 'sh', 'shell', 'console']);
const SUBCOMMANDS = {
  npm: ['install', 'init', 'pkg', 'set', 'run'],
  claude: ['mcp', 'add', 'list', 'remove'],
  pi: ['mcp', 'add', 'list', 'remove'],
  git: ['clone', 'pull', 'push', 'commit']
};
const span = (cls, s) => `<span class="sh-${cls}">${escapeHtml(s)}</span>`;

function shellUrl(url) {
  const q = url.indexOf('?');
  if (q < 0) return span('url', url);
  const params = url.slice(q + 1).split('&').map(pair => {
    const eq = pair.indexOf('=');
    return eq < 0 ? span('key', pair) : span('key', pair.slice(0, eq)) + span('op', '=') + span('val', pair.slice(eq + 1));
  });
  return span('url', url.slice(0, q)) + span('op', '?') + params.join(span('op', '&'));
}

function shellCommentStart(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return i;
  }
  return -1;
}

function highlightShell(src) {
  return src.split('\n').map(line => {
    const ci = shellCommentStart(line);
    const code = ci < 0 ? line : line.slice(0, ci);
    const comment = ci < 0 ? '' : line.slice(ci);
    let out = '';
    let expectCmd = true;   // nächstes Wort ist ein Befehl
    let cmd = null;         // aktueller Befehl, solange Unterbefehle folgen können
    for (const [tok] of code.matchAll(/\s+|'[^']*'|"[^"]*"|&&|\|\||[|;]|\S+/g)) {
      if (/^\s+$/.test(tok)) { out += tok; continue; }
      if (/^(&&|\|\||[|;]|--)$/.test(tok)) { out += span('op', tok); expectCmd = true; cmd = null; continue; }
      if (tok === '\\') { out += span('op', tok); continue; }
      if (/^['"]/.test(tok)) {
        const q = tok[0], inner = tok.slice(1, -1);
        out += /^https?:\/\//.test(inner)
          ? span('str', q) + shellUrl(inner) + span('str', q)
          : span('str', tok);
        cmd = null; continue;
      }
      if (/^https?:\/\//.test(tok)) { out += shellUrl(tok); cmd = null; continue; }
      if (/^--?[A-Za-z]/.test(tok)) {
        const eq = tok.indexOf('=');
        out += eq < 0 ? span('flag', tok) : span('flag', tok.slice(0, eq)) + span('op', '=') + span('val', tok.slice(eq + 1));
        cmd = null; continue;
      }
      if (/^\w+=/.test(tok)) {
        const eq = tok.indexOf('=');
        out += span('key', tok.slice(0, eq)) + span('op', '=') + span('val', tok.slice(eq + 1));
        continue;
      }
      if (tok.startsWith('@')) { out += span('pkg', tok); cmd = null; continue; } // npx-Paket: danach folgt ggf. wieder ein Befehl
      if (expectCmd) {
        out += span('cmd', tok);
        expectCmd = tok === 'npx' || tok === 'export';
        cmd = SUBCOMMANDS[tok] ? tok : null;
        continue;
      }
      if (cmd && SUBCOMMANDS[cmd].includes(tok)) { out += span('sub', tok); continue; }
      cmd = null;
      out += escapeHtml(tok);
    }
    return out + (comment ? span('comment', comment) : '');
  }).join('\n');
}

// Wie Python-Markdown (MkDocs): ASCII, Kleinbuchstaben, Leerzeichen → Bindestrich
function slugify(text) {
  return text
    .normalize('NFKD').replace(/[^\x00-\x7F]/g, '')
    .replace(/[^\w\s-]/g, '').trim().toLowerCase()
    .replace(/[-\s]+/g, '-');
}

const stripTags = html => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// ---------- Markdown-Renderer ----------

function createMarked() {
  const usedIds = new Map();
  const marked = new Marked({ gfm: true });

  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens);
        const plain = stripTags(inner);
        if (depth === 1) {
          const m = plain.match(/^(\d+)\s*·\s*(.*)$/);
          if (m) {
            return `<h1><span class="h1-num">${m[1]}</span>${escapeHtml(m[2])}</h1>\n`;
          }
          return `<h1>${inner}</h1>\n`;
        }
        let id = slugify(plain) || 'abschnitt';
        const n = usedIds.get(id) ?? 0;
        usedIds.set(id, n + 1);
        if (n) id = `${id}_${n}`;
        const anchor = depth <= 3 ? `<a class="heading-anchor" href="#${id}" aria-label="Link zu diesem Abschnitt">#</a>` : '';
        return `<h${depth} id="${id}" data-title="${escapeHtml(plain)}">${inner}${anchor}</h${depth}>\n`;
      },

      code({ text, lang }) {
        const language = (lang || '').trim().split(/\s+/)[0];
        if (language === 'mermaid') {
          return `<div class="diagram"><pre class="mermaid">${escapeHtml(text)}</pre></div>\n`;
        }
        let body;
        if (SHELL_LANGS.has(language)) {
          body = highlightShell(text);
        } else if (language && hljs.getLanguage(language)) {
          body = hljs.highlight(text, { language, ignoreIllegals: true }).value;
        } else {
          body = escapeHtml(text);
        }
        const label = language && language !== 'text' ? `<span class="code-lang">${escapeHtml(language)}</span>` : '';
        return `<div class="code-block">${label}<pre><code class="hljs${language ? ` language-${escapeHtml(language)}` : ''}">${body}</code></pre></div>\n`;
      },

      link({ href, title, tokens }) {
        const text = this.parser.parseInline(tokens);
        if (/(^|\/)docs-dev\//.test(href)) {
          return `<span class="dev-ref" title="Entwickler-Doku im Projektordner: ${escapeHtml(href.replace(/^\.\.\//, ''))}">${text}</span>`;
        }
        let target = href;
        if (!/^[a-z]+:/i.test(href) && !href.startsWith('#')) {
          target = href.replace(/\.md(?=$|#)/, '.html');
        }
        const external = /^https?:/i.test(href);
        const attrs = external ? ' target="_blank" rel="noopener"' : '';
        return `<a href="${escapeHtml(target)}"${title ? ` title="${escapeHtml(title)}"` : ''}${attrs}>${text}</a>`;
      }
    }
  });

  return marked;
}

// ---------- MkDocs-Blöcke ----------

const BLOCK_RE = /^(!!!|\?\?\?\+?)\s+([\w-]+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*$/;
const TAB_RE = /^===\s+"((?:[^"\\]|\\.)*)"\s*$/;

const unescapeTitle = t => t.replace(/\\"/g, '"');

// Sammelt die eingerückten Zeilen eines Blocks (4 Leerzeichen) ab Zeile i
function collectIndented(lines, i) {
  const body = [];
  while (i < lines.length && (lines[i].startsWith('    ') || lines[i].trim() === '')) {
    body.push(lines[i].startsWith('    ') ? lines[i].slice(4) : '');
    i++;
  }
  while (body.length && body[body.length - 1] === '') body.pop();
  return { body: body.join('\n'), next: i };
}

function renderMarkdown(md, marked) {
  const lines = md.split('\n');
  const out = [];
  const blocks = [];
  const placeholder = html => {
    blocks.push(html);
    return `\n<!--BLOCK${blocks.length - 1}-->\n`;
  };
  let inFence = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*```/.test(line)) inFence = !inFence;
    if (inFence) { out.push(line); i++; continue; }

    const b = line.match(BLOCK_RE);
    if (b) {
      const [, marker, type, rawTitle] = b;
      const title = rawTitle !== undefined ? unescapeTitle(rawTitle) : type.charAt(0).toUpperCase() + type.slice(1);
      const { body, next } = collectIndented(lines, i + 1);
      const inner = renderMarkdown(body, marked);
      const titleHtml = marked.parseInline(title);
      if (marker === '!!!') {
        out.push(placeholder(`<div class="admonition ${type}"><p class="admonition-title">${titleHtml}</p>\n${inner}</div>`));
      } else {
        const open = marker === '???+' ? ' open' : '';
        out.push(placeholder(`<details class="admonition ${type}"${open}><summary>${titleHtml}</summary><div class="details-body">\n${inner}</div></details>`));
      }
      i = next;
      continue;
    }

    if (TAB_RE.test(line)) {
      const tabs = [];
      while (i < lines.length) {
        const t = lines[i].match(TAB_RE);
        if (!t) {
          if (lines[i].trim() === '') { i++; continue; }
          break;
        }
        const { body, next } = collectIndented(lines, i + 1);
        tabs.push({ label: unescapeTitle(t[1]), html: renderMarkdown(body, marked) });
        i = next;
      }
      const gid = `tabs-${blocks.length}`;
      const buttons = tabs.map((t, k) =>
        `<button type="button" class="tab-btn" role="tab" id="${gid}-t${k}" aria-controls="${gid}-p${k}" aria-selected="${k === 0}" tabindex="${k === 0 ? 0 : -1}">${marked.parseInline(t.label)}</button>`).join('');
      const panels = tabs.map((t, k) =>
        `<div class="tab-panel" role="tabpanel" id="${gid}-p${k}" aria-labelledby="${gid}-t${k}"${k === 0 ? '' : ' hidden'}>\n${t.html}</div>`).join('\n');
      out.push(placeholder(`<div class="tabs"><div class="tab-list" role="tablist">${buttons}</div>\n${panels}</div>`));
      continue;
    }

    out.push(line);
    i++;
  }

  let html = marked.parse(out.join('\n'));
  html = html.replace(/<!--BLOCK(\d+)-->/g, (_, n) => blocks[Number(n)]);
  return postProcess(html);
}

function postProcess(html) {
  return html
    // Tabellen scrollbar einfassen
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, '</table></div>')
    // Bild allein im Absatz → figure
    .replace(/<p>(<img [^>]+>)<\/p>/g, (_, img) => {
      const alt = (img.match(/alt="([^"]*)"/) || [])[1] || '';
      return `<figure>${img.replace('<img ', '<img loading="lazy" ')}${alt ? `<figcaption>${alt}</figcaption>` : ''}</figure>`;
    })
    // Checklisten
    .replace(/<li><input (checked="" )?disabled="" type="checkbox">/g,
      (_, checked) => `<li class="task-list-item"><input type="checkbox" ${checked ? 'checked ' : ''}aria-label="erledigt">`)
    .replace(/<ul>\n<li class="task-list-item">/g, '<ul class="task-list">\n<li class="task-list-item">');
}

// ---------- Seitenrahmen ----------

function pageInfo(name, md) {
  const h1 = (md.match(/^#\s+(.+)$/m) || [])[1] || name;
  const m = h1.match(/^(\d+)\s*·\s*(.*)$/);
  return {
    name,
    num: m ? m[1] : '',
    title: m ? m[2] : h1,
    navTitle: name === 'index' ? 'Übersicht' : (m ? m[2] : h1),
    file: `${name}.html`
  };
}

function descriptionOf(html) {
  const p = html.match(/<p>([\s\S]*?)<\/p>/);
  return p ? stripTags(p[1]).replace(/\s+/g, ' ').trim().slice(0, 180) : SITE_TITLE;
}

// Erster Absatz direkt unter h1 wird zur Einleitung
function markLead(html) {
  return html.replace(/(<\/h1>\n)<p>([\s\S]*?)<\/p>/, '$1<p class="lead">$2</p>\n<hr class="lead-rule">');
}

const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dcc07a"/><stop offset="1" stop-color="#b0643a"/></linearGradient></defs><rect width="32" height="32" rx="7" fill="url(#g)"/><text x="16" y="22" text-anchor="middle" font-family="Georgia,serif" font-size="17" font-weight="700" fill="#2a1b12">K</text></svg>'
)}`;

function renderNav(pages, current) {
  return NAV.map(group => `
      <div class="nav-group">
        <p class="nav-group-title">${escapeHtml(group.title)}</p>
        <ul class="nav-list">
          ${group.pages.map(name => {
            const p = pages.get(name);
            const cur = name === current ? ' aria-current="page"' : '';
            const num = p.num ? `<span class="nav-num">${p.num}</span>` : '<span class="nav-num">◆</span>';
            return `<li><a class="nav-link" href="${p.file}"${cur}>${num}<span>${escapeHtml(p.navTitle)}</span></a></li>`;
          }).join('\n          ')}
        </ul>${group.meta ? `\n        <p class="nav-meta">${escapeHtml(group.meta)}</p>` : ''}
      </div>`).join('');
}

function renderPager(pages, name) {
  const idx = ORDER.indexOf(name);
  const prev = idx > 0 ? pages.get(ORDER[idx - 1]) : null;
  const next = idx < ORDER.length - 1 ? pages.get(ORDER[idx + 1]) : null;
  const label = p => `${p.num ? `${p.num} · ` : ''}${escapeHtml(p.navTitle)}`;
  return `
        <nav class="pager" aria-label="Seiten blättern">
          ${prev ? `<a class="pager-card prev" href="${prev.file}"><span class="pager-label">← Zurück</span><span class="pager-title">${label(prev)}</span></a>` : ''}
          ${next ? `<a class="pager-card next" href="${next.file}"><span class="pager-label">Weiter →</span><span class="pager-title">${label(next)}</span></a>` : ''}
        </nav>
        <p class="pager-hint">Blättern mit <kbd>←</kbd> <kbd>→</kbd></p>`;
}

function renderPage(pages, name, body) {
  const p = pages.get(name);
  const docTitle = name === 'index' ? SITE_TITLE : `${p.num ? `${p.num} · ` : ''}${p.title} · ${SITE_TITLE}`;
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(docTitle)}</title>
  <meta name="description" content="${escapeHtml(descriptionOf(body))}">
  <meta name="theme-color" content="#2a1b12">
  <link rel="icon" href="${FAVICON}">
  <link rel="stylesheet" href="assets/css/style.css">
  <script src="assets/js/main.js" defer></script>
</head>
<body data-page="${name}" data-mermaid="assets/vendor/mermaid.min.js">
  <header class="topbar">
    <button class="icon-btn nav-toggle" type="button" aria-label="Navigation öffnen" aria-expanded="false" aria-controls="sidebar">
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/></svg>
    </button>
    <a class="brand" href="index.html">
      <span class="brand-mark">K</span>
      <span><span class="brand-title">${SITE_TITLE}</span><span class="brand-sub">Harness · MCP · E-Ink</span></span>
    </a>
    <span class="topbar-spacer"></span>
    <span class="progress" aria-hidden="true"></span>
  </header>
  <div class="scrim" aria-hidden="true"></div>
  <div class="layout">
    <aside class="sidebar" id="sidebar">
      <nav aria-label="Seiten">${renderNav(pages, name)}
      </nav>
    </aside>
    <main class="content">
      <article class="article">
${body}
      </article>
      <div class="article">${renderPager(pages, name)}
        <footer class="footer">TRMNL-MCP · Lernprojekt zu Harness, MCP und Agenten</footer>
      </div>
    </main>
    <aside class="toc" aria-label="Auf dieser Seite"><p class="toc-title">Auf dieser Seite</p></aside>
  </div>
</body>
</html>
`;
}

// ---------- Build ----------

async function build() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(path.join(OUT, 'assets/vendor'), { recursive: true });

  const sources = new Map();
  const pages = new Map();
  for (const name of ORDER) {
    const md = await readFile(path.join(SRC, `${name}.md`), 'utf8');
    sources.set(name, md);
    pages.set(name, pageInfo(name, md));
  }

  for (const name of ORDER) {
    const body = markLead(renderMarkdown(sources.get(name), createMarked()));
    await writeFile(path.join(OUT, `${name}.html`), renderPage(pages, name, body));
  }

  await cp(path.join(ROOT, 'assets'), path.join(OUT, 'assets'), { recursive: true });
  if (existsSync(path.join(SRC, 'img'))) await cp(path.join(SRC, 'img'), path.join(OUT, 'img'), { recursive: true });
  await cp(path.join(ROOT, 'node_modules/mermaid/dist/mermaid.min.js'), path.join(OUT, 'assets/vendor/mermaid.min.js'));

  console.log(`${ORDER.length} Seiten gebaut → ${path.relative(process.cwd(), OUT) || OUT}`);
}

build().catch(err => { console.error(err); process.exit(1); });
