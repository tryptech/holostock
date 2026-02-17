(function () {
  const countEl = document.getElementById('count');
  const tableContainer = document.getElementById('table-container');
  const loadingEl = document.getElementById('loading');
  const filterTalent = document.getElementById('filter-talent');
  const excludeDigital = document.getElementById('exclude-digital');
  const excludePreorder = document.getElementById('exclude-preorder');
  const sortModeSelect = document.getElementById('sort-mode');

  let allItems = [];
  let talentSearchTerms = {};
  let sortKey = 'date';
  let sortAsc = false;

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function parsePrice(priceStr) {
    if (!priceStr || typeof priceStr !== 'string') return 0;
    const n = parseFloat(priceStr.replace(/[^0-9.]/g, ''));
    return isNaN(n) ? 0 : n;
  }

  function parseDate(dateStr) {
    if (!dateStr) return 0;
    const t = new Date(dateStr).getTime();
    return isNaN(t) ? 0 : t;
  }

  function textContains(text, term) {
    if (!text || !term) return false;
    var hasCjk = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u4e00-\u9faf]/.test(term);
    if (hasCjk) return text.indexOf(term) !== -1;
    return text.toLowerCase().indexOf(term.toLowerCase()) !== -1;
  }

  function rowMatchesTalent(row, talentVal, terms) {
    if ((row.talent || '').toLowerCase() === talentVal.toLowerCase()) return true;
    if (!terms || terms.length === 0) return false;
    var item = row.item || '';
    var title = row.title || '';
    for (var i = 0; i < terms.length; i++) {
      if (textContains(item, terms[i]) || textContains(title, terms[i])) return true;
    }
    return false;
  }

  function isDigitalVoiceContent(row) {
    var title = (row.title || '') + ' ';
    var item = row.item || '';
    var text = title + item;
    return /\bvoice\b|ボイス/i.test(text);
  }

  function applyFilters() {
    const talentVal = (filterTalent.value || '').trim();
    const hideDigital = excludeDigital.checked;
    const hidePreorder = excludePreorder.checked;

    return allItems.filter(function (row) {
      if (hideDigital && (row.isDigital || isDigitalVoiceContent(row))) return false;
      if (hidePreorder && row.isPreorder) return false;
      if (talentVal && !rowMatchesTalent(row, talentVal, talentSearchTerms[talentVal])) return false;
      return true;
    });
  }

  function sortRows(rows) {
    const key = sortKey;
    const asc = sortAsc;
    return rows.slice().sort(function (a, b) {
      let va = key === 'date' ? (a.dateRaw || a.date || '') : a[key];
      let vb = key === 'date' ? (b.dateRaw || b.date || '') : b[key];
      if (key === 'price') {
        va = parsePrice(va);
        vb = parsePrice(vb);
        return asc ? va - vb : vb - va;
      }
      if (key === 'date') {
        va = parseDate(va);
        vb = parseDate(vb);
        return asc ? va - vb : vb - va;
      }
      if (key === 'stock') {
        va = a.stock != null ? a.stock : Infinity;
        vb = b.stock != null ? b.stock : Infinity;
        return asc ? va - vb : vb - va;
      }
      va = String(va || '');
      vb = String(vb || '');
      const c = va.localeCompare(vb, undefined, { sensitivity: 'base' });
      return asc ? c : -c;
    });
  }

  function renderTable(rows) {
    countEl.textContent = rows.length + ' item(s)';
    if (sortModeSelect) sortModeSelect.value = sortKey + '_' + (sortAsc ? 'asc' : 'desc');

    const sorted = sortRows(rows);
    let tableHtml =
      '<table class="items-table"><thead><tr>' +
      '<th data-sort="title">Title <span class="sort-indicator">' + (sortKey === 'title' ? (sortAsc ? '↑' : '↓') : '') + '</span></th>' +
      '<th data-sort="item">Item <span class="sort-indicator">' + (sortKey === 'item' ? (sortAsc ? '↑' : '↓') : '') + '</span></th>' +
      '<th class="no-sort">Image</th>' +
      '<th data-sort="price">Price <span class="sort-indicator">' + (sortKey === 'price' ? (sortAsc ? '↑' : '↓') : '') + '</span></th>' +
      '<th data-sort="stock">Stock <span class="sort-indicator">' + (sortKey === 'stock' ? (sortAsc ? '↑' : '↓') : '') + '</span></th>' +
      '<th class="cell-date" data-sort="date">Date <span class="sort-indicator">' + (sortKey === 'date' ? (sortAsc ? '↑' : '↓') : '') + '</span></th>' +
      '<th class="no-sort">Link</th></tr></thead><tbody>';

    let cardsHtml = '<div class="item-cards">';

    sorted.forEach(function (r) {
      var stockStr = r.stockDisplay != null ? r.stockDisplay : (r.stock != null ? String(r.stock) : '—');
      tableHtml += '<tr>';
      tableHtml += '<td>' + escapeHtml(r.title || '—') + '</td>';
      tableHtml += '<td>' + escapeHtml(r.item || '—') + '</td>';
      tableHtml += '<td class="cell-image">';
      if (r.imageUrl) tableHtml += '<img src="' + escapeHtml(r.imageUrl) + '" alt="" class="item-thumb" loading="lazy" decoding="async">';
      else tableHtml += '—';
      tableHtml += '</td>';
      tableHtml += '<td>' + escapeHtml(r.price || '—') + '</td>';
      tableHtml += '<td>' + escapeHtml(stockStr) + '</td>';
      tableHtml += '<td class="cell-date">' + escapeHtml(r.date || '—') + '</td>';
      tableHtml += '<td>';
      if (r.productUrl) tableHtml += '<a href="' + escapeHtml(r.productUrl) + '" target="_blank" rel="noopener">View</a>';
      else tableHtml += '—';
      tableHtml += '</td></tr>';

      cardsHtml += '<article class="item-card">';
      cardsHtml += '<div class="card-thumb">';
      if (r.imageUrl) cardsHtml += '<img src="' + escapeHtml(r.imageUrl) + '" alt="" class="item-thumb" loading="lazy" decoding="async">';
      else cardsHtml += '<span class="card-no-img">—</span>';
      cardsHtml += '</div>';
      cardsHtml += '<div class="card-main">';
      cardsHtml += '<div class="card-title">' + escapeHtml(r.title || '—') + '</div>';
      cardsHtml += '<div class="card-item">' + escapeHtml(r.item || '—') + '</div>';
      cardsHtml += '</div>';
      if (r.productUrl) {
        cardsHtml += '<a href="' + escapeHtml(r.productUrl) + '" class="card-link" target="_blank" rel="noopener">';
        cardsHtml += '<span class="card-price">' + escapeHtml(r.price || '—') + '</span>';
        cardsHtml += '<span class="card-stock">' + escapeHtml(stockStr) + '</span>';
        cardsHtml += '</a>';
      } else {
        cardsHtml += '<div class="card-right">';
        cardsHtml += '<span class="card-price">' + escapeHtml(r.price || '—') + '</span>';
        cardsHtml += '<span class="card-stock">' + escapeHtml(stockStr) + '</span>';
        cardsHtml += '</div>';
      }
      cardsHtml += '</article>';
    });

    tableHtml += '</tbody></table>';
    cardsHtml += '</div>';

    tableContainer.innerHTML = '<div class="table-wrap">' + tableHtml + '</div><div class="cards-wrap">' + cardsHtml + '</div>';

    tableContainer.querySelectorAll('th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        const k = th.getAttribute('data-sort');
        if (sortKey === k) sortAsc = !sortAsc;
        else { sortKey = k; sortAsc = true; }
        renderTable(applyFilters());
      });
    });

    tableContainer.addEventListener('click', function (e) {
      var thumb = e.target && e.target.classList && e.target.classList.contains('item-thumb');
      if (!thumb || !e.target.src) return;
      e.preventDefault();
      openImagePreview(e.target.src);
    });
  }

  var modalScrollY = 0;

  function getScrollbarWidth() {
    return window.innerWidth - document.documentElement.clientWidth;
  }

  function openImagePreview(src) {
    var overlay = document.getElementById('image-preview');
    var img = document.getElementById('image-preview-img');
    if (!overlay || !img) return;
    modalScrollY = window.scrollY;
    var scrollbarWidth = getScrollbarWidth();
    document.documentElement.style.minHeight = document.documentElement.scrollHeight + 'px';
    document.body.style.position = 'fixed';
    document.body.style.top = -modalScrollY + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    if (scrollbarWidth) document.body.style.paddingRight = scrollbarWidth + 'px';
    img.src = src;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function closeImagePreview() {
    var overlay = document.getElementById('image-preview');
    var img = document.getElementById('image-preview-img');
    if (!overlay || !img) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    setTimeout(function () {
      img.removeAttribute('src');
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      document.body.style.paddingRight = '';
      document.documentElement.style.minHeight = '';
      window.scrollTo(0, modalScrollY);
    }, 250);
  }

  (function setupImagePreview() {
    var overlay = document.getElementById('image-preview');
    var closeBtn = overlay && overlay.querySelector('.preview-close');
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeImagePreview();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && overlay.classList.contains('is-open')) closeImagePreview();
      });
    }
    if (closeBtn) closeBtn.addEventListener('click', closeImagePreview);
  })();

  function titleCase(s) {
    return (s || '').trim().split(/\s+/).map(function (w) {
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).join(' ');
  }

  function populateFilters() {
    const byLower = new Map();
    allItems.forEach(function (r) {
      var t = (r.talent || '').trim();
      if (t) {
        var k = t.toLowerCase();
        if (!byLower.has(k)) byLower.set(k, titleCase(t));
      }
      var item = r.item || '';
      var title = r.title || '';
      for (var talentName in talentSearchTerms) {
        var terms = talentSearchTerms[talentName];
        for (var i = 0; i < terms.length; i++) {
          if (textContains(item, terms[i]) || textContains(title, terms[i])) {
            var key = talentName.toLowerCase();
            if (!byLower.has(key)) byLower.set(key, titleCase(talentName));
            break;
          }
        }
      }
    });
    const talents = Array.from(byLower.values()).sort(function (a, b) { return a.localeCompare(b, undefined, { sensitivity: 'base' }); });

    filterTalent.innerHTML = '<option value="">All</option>' + talents.map(function (t) { return '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + '</option>'; }).join('');
  }

  const EXCLUDE_DIGITAL_KEY = 'holostock-exclude-digital';
  const EXCLUDE_PREORDER_KEY = 'holostock-exclude-preorder';

  function loadExcludeFromStorage() {
    try {
      var d = localStorage.getItem(EXCLUDE_DIGITAL_KEY);
      if (d === 'true' || d === 'false') excludeDigital.checked = d === 'true';
    } catch (e) {}
    try {
      var p = localStorage.getItem(EXCLUDE_PREORDER_KEY);
      if (p === 'true' || p === 'false') excludePreorder.checked = p === 'true';
    } catch (e) {}
  }

  function saveExcludeToStorage() {
    try {
      localStorage.setItem(EXCLUDE_DIGITAL_KEY, String(excludeDigital.checked));
      localStorage.setItem(EXCLUDE_PREORDER_KEY, String(excludePreorder.checked));
    } catch (e) {}
  }

  function onFilterChange() {
    renderTable(applyFilters());
  }

  filterTalent.addEventListener('change', onFilterChange);
  excludeDigital.addEventListener('change', function () {
    saveExcludeToStorage();
    onFilterChange();
  });
  excludePreorder.addEventListener('change', function () {
    saveExcludeToStorage();
    onFilterChange();
  });

  if (sortModeSelect) {
    sortModeSelect.addEventListener('change', function () {
      var v = sortModeSelect.value;
      if (!v) return;
      var parts = v.split('_');
      if (parts.length === 2) {
        sortKey = parts[0];
        sortAsc = parts[1] === 'asc';
        renderTable(applyFilters());
      }
    });
  }

  (function initThemeToggle() {
    var themeToggle = document.getElementById('theme-toggle');
    var iconEl = themeToggle && themeToggle.querySelector('.theme-icon');
    if (!themeToggle || !iconEl) return;

    var icons = {
      light: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
      dark: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
      auto: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 7a5 5 0 0 0 0 10V7z" fill="currentColor" stroke="none"/></svg>'
    };

    function setThemeIcon(theme) {
      theme = theme || 'auto';
      iconEl.innerHTML = icons[theme] || icons.auto;
      themeToggle.setAttribute('aria-label', 'Theme: ' + (theme === 'auto' ? 'System' : theme.charAt(0).toUpperCase() + theme.slice(1)));
    }

    var theme = document.documentElement.dataset.theme || 'auto';
    setThemeIcon(theme);

    themeToggle.addEventListener('click', function () {
      var next = (theme === 'light' ? 'dark' : theme === 'dark' ? 'auto' : 'light');
      theme = next;
      try { localStorage.setItem('holoshop-theme', next); } catch (e) {}
      document.documentElement.dataset.theme = next;
      setThemeIcon(next);
    });
  })();

  function applyTalentMap(items, map) {
    if (!map || typeof map !== 'object') return;
    items.forEach(function (row) {
      const t = row.talent;
      if (t && map[t] != null) row.talent = map[t];
    });
  }

  function buildSearchTermsFromMap(jpToEn) {
    if (!jpToEn || typeof jpToEn !== 'object') return {};
    var enToJp = {};
    for (var jp in jpToEn) { var en = jpToEn[jp]; if (!enToJp[en]) enToJp[en] = []; enToJp[en].push(jp); }
    var terms = {};
    for (var en in enToJp) terms[en] = [en].concat(enToJp[en]);
    return terms;
  }

  Promise.all([
    fetch('data/items.json').then(function (res) {
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      return res.json();
    }),
    fetch('data/talent-jp-to-en.json').then(function (res) { return res.ok ? res.json() : null; }).catch(function () { return null; }),
    fetch('data/talent-search-terms.json').then(function (res) { return res.ok ? res.json() : null; }).catch(function () { return null; })
  ]).then(function (results) {
    loadingEl.remove();
    const data = results[0];
    allItems = data.items || [];
    applyTalentMap(allItems, results[1]);
    talentSearchTerms = results[2] && Object.keys(results[2]).length ? results[2] : buildSearchTermsFromMap(results[1]);
    var seen = {};
    allItems.forEach(function (r) {
      var t = (r.talent || '').trim();
      if (t && !talentSearchTerms[t]) talentSearchTerms[t] = [t];
    });
    populateFilters();
    loadExcludeFromStorage();
    renderTable(applyFilters());
    var lastEl = document.getElementById('last-updated');
    if (lastEl && data.builtAt) {
      try {
        var d = new Date(data.builtAt);
        if (!isNaN(d.getTime())) {
          lastEl.textContent = 'Last updated: ' + d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
        }
      } catch (e) {}
    }
  }).catch(function (err) {
    loadingEl.remove();
    tableContainer.innerHTML = '<div class="error">Failed to load data: ' + escapeHtml(String(err)) + '</div>';
  });
})();
