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


/* === Last-visit map ====================================================== */
(function () {
  var panel = document.querySelector('[data-visit-map]');
  if (!panel) return;
  var logEl = panel.querySelector('[data-visit-log]');
  var mapEl = panel.querySelector('[data-visit-leaflet]');
  if (!logEl || !mapEl) return;

  var LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  var LEAFLET_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

  var TILES_LIGHT = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
  var TILES_DARK  = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  var ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

  var booted = false;

  function loadCss(href) {
    return new Promise(function (resolve, reject) {
      var l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = href;
      l.onload = resolve; l.onerror = reject;
      document.head.appendChild(l);
    });
  }
  function loadJs(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function typewriter(lines) {
    logEl.innerHTML = '';
    var i = 0;
    function step() {
      if (i >= lines.length) return;
      var span = document.createElement('span');
      span.className = 'visit__line';
      span.textContent = lines[i];
      logEl.appendChild(span);
      logEl.appendChild(document.createTextNode('\n'));
      i++;
      setTimeout(step, 180);
    }
    step();
  }

  function isDark() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  var STORE_KEY = 'visits.v1';
  var MAX_VISITS = 200;

  function loadVisits() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveVisits(arr) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(arr)); } catch (e) {}
  }
  function visitKey(v) {
    // dedupe by rounded coords (~11km cell) so repeated pageloads from the
    // same area don't pile up.
    return (Math.round(v.latitude * 10) / 10) + ',' + (Math.round(v.longitude * 10) / 10);
  }
  function recordVisit(geo) {
    var visits = loadVisits();
    var key = visitKey(geo);
    var existing = visits.filter(function (v) { return visitKey(v) === key; })[0];
    if (existing) {
      existing.count = (existing.count || 1) + 1;
      existing.lastSeen = Date.now();
    } else {
      visits.push({
        latitude: geo.latitude,
        longitude: geo.longitude,
        city: geo.city || '',
        region: geo.region || '',
        country: geo.country || '',
        count: 1,
        firstSeen: Date.now(),
        lastSeen: Date.now()
      });
    }
    if (visits.length > MAX_VISITS) visits = visits.slice(-MAX_VISITS);
    saveVisits(visits);
    return visits;
  }

  function fetchGeo() {
    return fetch('https://ipwho.is/?fields=success,ip,city,region,country,latitude,longitude')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || d.success === false) throw new Error('geo lookup failed');
        return d;
      })
      .catch(function () {
        return fetch('https://get.geojs.io/v1/ip/geo.json')
          .then(function (r) { return r.json(); })
          .then(function (d) {
            return {
              ip: d.ip,
              city: d.city,
              region: d.region,
              country: d.country,
              latitude: parseFloat(d.latitude),
              longitude: parseFloat(d.longitude)
            };
          });
      });
  }

  function renderMap(geo) {
    var L = window.L;
    var lat = (geo && typeof geo.latitude === 'number') ? geo.latitude : NaN;
    var lon = (geo && typeof geo.longitude === 'number') ? geo.longitude : NaN;
    var hasCurrent = !isNaN(lat) && !isNaN(lon);

    var visits = hasCurrent ? recordVisit(geo) : loadVisits();

    var map = L.map(mapEl, {
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: false,
      dragging: true,
      worldCopyJump: true
    }).setView([20, 0], 2);

    var url = isDark() ? TILES_DARK : TILES_LIGHT;
    var tile = L.tileLayer(url, {
      maxZoom: 11,
      subdomains: 'abcd',
      attribution: ATTRIB,
      detectRetina: true
    }).addTo(map);

    var accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2f7d3a';
    var muted = getComputedStyle(document.documentElement).getPropertyValue('--fg-muted').trim() || '#888';
    var pts = [];
    visits.forEach(function (v) {
      if (typeof v.latitude !== 'number' || typeof v.longitude !== 'number') return;
      var isCurrent = hasCurrent && visitKey(v) === visitKey(geo);
      if (isCurrent) {
        L.circleMarker([v.latitude, v.longitude], {
          radius: 7,
          color: accent,
          weight: 2,
          fillColor: accent,
          fillOpacity: 0.7
        }).addTo(map);
        L.circle([v.latitude, v.longitude], {
          radius: 30000, color: accent, weight: 1,
          opacity: 0.5, fillColor: accent, fillOpacity: 0.1
        }).addTo(map);
      } else {
        // past visits: hollow muted ring, no fill — clearly secondary
        L.circleMarker([v.latitude, v.longitude], {
          radius: 4,
          color: muted,
          weight: 1.5,
          opacity: 0.85,
          fillColor: muted,
          fillOpacity: 0.15,
          dashArray: '2,2'
        }).addTo(map);
      }
      pts.push([v.latitude, v.longitude]);
    });

    if (pts.length === 1) {
      map.setView(pts[0], 5);
    } else if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 6 });
    }

    var observer = new MutationObserver(function () {
      tile.setUrl(isDark() ? TILES_DARK : TILES_LIGHT);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    var ipMasked = (geo && geo.ip || '').replace(/\.\d+$/, '.***').replace(/:[^:]+$/, ':****');
    var lines = [];
    if (hasCurrent) {
      var loc = [geo.city, geo.region, geo.country].filter(Boolean).join(', ') || 'unknown';
      lines.push('$ whois ' + (ipMasked || 'visitor'));
      lines.push('> city:    ' + (geo.city || '—'));
      lines.push('> region:  ' + (geo.region || '—'));
      lines.push('> country: ' + (geo.country || '—'));
      lines.push('> coords:  ' + lat.toFixed(2) + ', ' + lon.toFixed(2));
      lines.push('> pin dropped @ ' + loc);
    } else {
      lines.push('$ traceroute --visits');
      lines.push('> current geo lookup failed — showing history only.');
    }
    typewriter(lines);
  }

  function boot() {
    if (booted) return;
    booted = true;
    Promise.all([loadCss(LEAFLET_CSS), loadJs(LEAFLET_JS)])
      .then(function () {
        return fetchGeo().then(renderMap, function () {
          if (loadVisits().length > 0) {
            renderMap(null);
          } else {
            logEl.textContent = '$ traceroute --visits\n> connection timed out.\n> (your network blocked the geolocation call — totally fair.)\n';
            mapEl.style.display = 'none';
          }
        });
      })
      .catch(function () {
        logEl.textContent = '$ traceroute --visits\n> map assets failed to load.\n';
        mapEl.style.display = 'none';
      });
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { boot(); io.disconnect(); }
      });
    }, { rootMargin: '200px' });
    io.observe(panel);
  } else {
    boot();
  }
})();
