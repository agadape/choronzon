// Loads a page's scripts with a cache-busting stamp (browsers kept old copies even with Cache-Control: no-store).
// It replaces the inline loaders, so the public site's Content-Security-Policy can forbid inline scripts:
//   <script src="boot.js" data-scripts="a.js b.js" data-modules="c.js"></script>
// Classic scripts load in order before the page goes on; modules load after them.
(function () {
  "use strict";
  const me = document.currentScript, v = Date.now();
  const list = (s) => (s || "").split(/\s+/).filter((f) => /^[\w./-]+\.js$/.test(f) && !f.includes(".."));
  for (const f of list(me.dataset.scripts)) document.write(`<script src="${f}?v=${v}"><\/script>`);
  for (const f of list(me.dataset.modules)) document.write(`<script type="module" src="${f}?v=${v}"><\/script>`);
})();
