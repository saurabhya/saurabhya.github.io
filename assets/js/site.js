(function () {
  var root = document.documentElement;
  var btn = document.querySelector('.theme-toggle');
  if (!btn) return;

  function currentTheme() {
    var saved = null;
    try { saved = localStorage.getItem('theme'); } catch (e) {}
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    try { localStorage.setItem('theme', t); } catch (e) {}
  }

  btn.addEventListener('click', function () {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });
})();

/* === Misc page: filter + lightbox ======================================= */
(function () {
  var filters = document.querySelectorAll('.filter');
  var items = document.querySelectorAll('.gallery__item');
  if (filters.length && items.length) {
    filters.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var f = btn.getAttribute('data-filter');
        filters.forEach(function (b) { b.classList.toggle('is-active', b === btn); });
        items.forEach(function (it) {
          var match = (f === 'all') || (it.getAttribute('data-cat') === f);
          it.classList.toggle('is-hidden', !match);
        });
      });
    });
  }

  var dlg = document.querySelector('.lightbox');
  if (!dlg) return;
  var dlgImg = dlg.querySelector('.lightbox__img');
  var dlgCap = dlg.querySelector('.lightbox__caption');
  var dlgClose = dlg.querySelector('.lightbox__close');

  function open(href, caption, alt) {
    dlgImg.src = href;
    dlgImg.alt = alt || '';
    dlgCap.textContent = caption || '';
    if (typeof dlg.showModal === 'function') {
      dlg.showModal();
    } else {
      window.open(href, '_blank', 'noopener');
    }
  }
  function close() { if (dlg.open) dlg.close(); dlgImg.src = ''; }

  document.querySelectorAll('.gallery__link').forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      var img = a.querySelector('img');
      open(a.getAttribute('href'), a.getAttribute('data-caption'), img && img.alt);
    });
  });
  dlgClose.addEventListener('click', close);
  dlg.addEventListener('click', function (e) {
    var r = dlgImg.getBoundingClientRect();
    var inside = e.clientX >= r.left && e.clientX <= r.right
              && e.clientY >= r.top  && e.clientY <= r.bottom;
    if (!inside) close();
  });
})();
