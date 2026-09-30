/* TRMNL-Guide – Interaktion. Kein Framework, keine externen Abhängigkeiten
   außer Mermaid, das nur auf Seiten mit Diagrammen nachgeladen wird. */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* privat/gesperrt */ } }
  };

  document.documentElement.classList.add('js');

  /* ---------- Navigation (mobil) ---------- */

  function initNav() {
    const toggle = $('.nav-toggle');
    const scrim = $('.scrim');
    if (!toggle) return;
    const setOpen = open => {
      document.body.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', () => setOpen(!document.body.classList.contains('nav-open')));
    scrim?.addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
  }

  /* ---------- Reiter ---------- */

  function initTabs() {
    $$('.tabs').forEach(group => {
      const buttons = $$('.tab-btn', group);
      const panels = $$('.tab-panel', group);
      const select = index => {
        buttons.forEach((b, i) => {
          b.setAttribute('aria-selected', String(i === index));
          b.tabIndex = i === index ? 0 : -1;
        });
        panels.forEach((p, i) => { p.hidden = i !== index; });
        // Mermaid in bisher verborgenen Panels erst jetzt zeichnen
        renderMermaid(panels[index]);
      };
      buttons.forEach((btn, i) => {
        btn.addEventListener('click', () => select(i));
        btn.addEventListener('keydown', e => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          e.preventDefault();
          e.stopPropagation();
          const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
          select(next);
          buttons[next].focus();
        });
      });
    });
  }

  /* ---------- Code kopieren ---------- */

  function initCopy() {
    $$('.code-block').forEach(block => {
      const code = $('code', block);
      if (!code) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn';
      btn.textContent = 'Kopieren';
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(code.innerText.replace(/\n$/, ''));
          btn.textContent = 'Kopiert';
        } catch {
          btn.textContent = 'Nicht möglich';
        }
        btn.classList.add('is-done');
        setTimeout(() => { btn.textContent = 'Kopieren'; btn.classList.remove('is-done'); }, 1600);
      });
      block.appendChild(btn);
    });
  }

  /* ---------- Inhaltsverzeichnis + aktiver Abschnitt ---------- */

  function initToc() {
    const toc = $('.toc');
    const headings = $$('.article h2[id]');
    if (!toc || headings.length < 2) { toc?.remove(); return; }

    const list = document.createElement('ol');
    const links = headings.map(h => {
      const a = document.createElement('a');
      a.href = `#${h.id}`;
      a.textContent = h.dataset.title || h.textContent.replace(/#$/, '').trim();
      const li = document.createElement('li');
      li.appendChild(a);
      list.appendChild(li);
      return a;
    });
    toc.appendChild(list);

    const setActive = id => links.forEach(a => a.classList.toggle('is-active', a.hash === `#${id}`));
    let ticking = false;
    const update = () => {
      // aktiv ist die letzte Überschrift, die oben schon durchgelaufen ist
      let current = headings[0];
      for (const h of headings) {
        if (h.getBoundingClientRect().top <= 120) current = h; else break;
      }
      setActive(current.id);
      ticking = false;
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  /* ---------- Lesefortschritt ---------- */

  function initProgress() {
    const bar = $('.progress');
    if (!bar) return;
    let ticking = false;
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = `${max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0}%`;
      ticking = false;
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  /* ---------- Blättern mit Pfeiltasten (für die Präsentation) ---------- */

  function initKeyboardPaging() {
    const prev = $('.pager-card.prev');
    const next = $('.pager-card.next');
    document.addEventListener('keydown', e => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select', 'button'].includes(tag) || e.target.isContentEditable) return;
      if (e.key === 'ArrowLeft' && prev) window.location.href = prev.href;
      if (e.key === 'ArrowRight' && next) window.location.href = next.href;
    });
  }

  /* ---------- Checklisten merken (pro Browser) ---------- */

  function initTaskLists() {
    const page = document.body.dataset.page || location.pathname;
    $$('.task-list-item input[type="checkbox"]').forEach((box, i) => {
      const key = `trmnl-guide:${page}:task:${i}`;
      const item = box.closest('.task-list-item');
      box.disabled = false;
      box.checked = store.get(key) === '1';
      item.classList.toggle('is-done', box.checked);
      box.addEventListener('change', () => {
        store.set(key, box.checked ? '1' : '0');
        item.classList.toggle('is-done', box.checked);
      });
    });
  }

  /* ---------- Sanftes Einblenden ---------- */

  function initReveal() {
    const items = $$('.article > .table-wrap, .article > .admonition, .article > .tabs, .article > .diagram, .article > figure, .article > .code-block');
    if (reducedMotion || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target;
        el.classList.add('is-visible');
        observer.unobserve(el);
        // danach Klassen entfernen, sonst überstimmen sie Hover-Effekte wie den Zoom
        setTimeout(() => el.classList.remove('reveal', 'is-visible'), 600);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach(el => {
      // Was beim Laden schon sichtbar ist, nicht erst ausblenden
      if (el.getBoundingClientRect().top < window.innerHeight) return;
      el.classList.add('reveal');
      observer.observe(el);
    });
  }

  /* ---------- Mermaid (nur bei Bedarf laden) ---------- */

  let mermaidReady = null;

  function loadMermaid() {
    if (mermaidReady) return mermaidReady;
    const src = document.body.dataset.mermaid;
    mermaidReady = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => {
        window.mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          themeVariables: {
            background: '#fbf7f0',
            primaryColor: '#f1e4cc',
            primaryBorderColor: '#8c6a3f',
            primaryTextColor: '#2e3135',
            secondaryColor: '#f6ecdc',
            tertiaryColor: '#fbf7f0',
            lineColor: '#b0643a',
            textColor: '#2e3135',
            clusterBkg: '#f6eddd',
            clusterBorder: '#d9c6a4',
            edgeLabelBackground: '#fbf7f0',
            actorBkg: '#3a2619',
            actorTextColor: '#f4ecdf',
            actorBorder: '#2a1b12',
            actorLineColor: '#b59f7e',
            signalColor: '#6b4b2a',
            signalTextColor: '#2e3135',
            noteBkgColor: '#f6eed9',
            noteBorderColor: '#b8923e'
          }
        });
        resolve(window.mermaid);
      };
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return mermaidReady;
  }

  function renderMermaid(root = document) {
    const nodes = $$('pre.mermaid:not([data-processed])', root)
      .filter(n => n.offsetParent !== null); // nur sichtbare, verborgene Reiter später
    if (!nodes.length) return;
    loadMermaid().then(m => m.run({ nodes })).catch(() => {
      nodes.forEach(n => { n.style.color = 'inherit'; }); // Quelltext zeigen statt nichts
    });
  }

  /* ---------- Drucken: alle Klappboxen öffnen ---------- */

  function initPrint() {
    window.addEventListener('beforeprint', () => $$('details').forEach(d => { d.dataset.wasOpen = d.open; d.open = true; }));
    window.addEventListener('afterprint', () => $$('details').forEach(d => { d.open = d.dataset.wasOpen === 'true'; }));
  }

  /* ---------- Start ---------- */

  document.addEventListener('DOMContentLoaded', () => {
    initNav();
    initTabs();
    initCopy();
    initToc();
    initProgress();
    initKeyboardPaging();
    initTaskLists();
    initReveal();
    initPrint();
    renderMermaid();
    // Diagramme in Klappboxen erst beim Aufklappen zeichnen
    $$('details').forEach(d => d.addEventListener('toggle', () => { if (d.open) renderMermaid(d); }));
  });
})();
