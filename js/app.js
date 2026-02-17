(function () {
  const countEl = document.getElementById('count');
  const tableContainer = document.getElementById('table-container');
  const loadingEl = document.getElementById('loading');
  const filterTalent = document.getElementById('filter-talent');
  const excludeDigital = document.getElementById('exclude-digital');
  const excludePreorder = document.getElementById('exclude-preorder');
  const sortModeSelect = document.getElementById('sort-mode');
  const searchInput = document.getElementById('search-input');
  const filterToggle = document.getElementById('filter-toggle');
  const filterDropdown = document.getElementById('filter-dropdown');

  let allItems = [];
  let talentSearchTerms = {};
  let sortKey = 'date';
  let sortAsc = false;
  let urlReplaceTimeout = null;
  const URL_PARAM_DEBOUNCE_MS = 100;

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

  function rowMatchesSearch(row, q) {
    if (!q) return true;
    var title = row.title || '';
    var item = row.item || '';
    var talent = row.talent || '';
    return textContains(title, q) || textContains(item, q) || textContains(talent, q);
  }

  function applyFilters() {
    const talentVal = (filterTalent.value || '').trim();
    const hideDigital = excludeDigital.checked;
    const hidePreorder = excludePreorder.checked;
    const searchQ = (searchInput && searchInput.value || '').trim();

    return allItems.filter(function (row) {
      if (hideDigital && (row.isDigital || isDigitalVoiceContent(row))) return false;
      if (hidePreorder && row.isPreorder) return false;
      if (talentVal && !rowMatchesTalent(row, talentVal, talentSearchTerms[talentVal])) return false;
      if (searchQ && !rowMatchesSearch(row, searchQ)) return false;
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
      tableHtml += '<td class="cell-item">';
      (function () {
        var itemStr = r.item || '—';
        var slashIdx = itemStr.indexOf('/');
        if (slashIdx === -1) {
          tableHtml += '<span class="cell-item-after">' + escapeHtml(itemStr) + '</span>';
        } else {
          tableHtml += '<span class="cell-item-before">' + escapeHtml(itemStr.slice(0, slashIdx).trim()) + '</span><span class="cell-item-after">' + escapeHtml(itemStr.slice(slashIdx + 1).trim()) + '</span>';
        }
      })();
      tableHtml += '</td>';
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
      (function () {
        var itemStr = r.item || '—';
        var slashIdx = itemStr.indexOf('/');
        if (slashIdx === -1) {
          cardsHtml += '<div class="card-item"><span class="card-item-after">' + escapeHtml(itemStr) + '</span></div>';
        } else {
          cardsHtml += '<div class="card-item"><span class="card-item-before">' + escapeHtml(itemStr.slice(0, slashIdx).trim()) + '</span><span class="card-item-after">' + escapeHtml(itemStr.slice(slashIdx + 1).trim()) + '</span></div>';
        }
      })();
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

  function getParamsFromUrl() {
    var params = {};
    try {
      var search = window.location.search;
      if (!search) return params;
      var p = new URLSearchParams(search);
      if (p.has('q')) params.q = decodeURIComponent(p.get('q')).trim();
      if (p.has('talent')) params.talent = decodeURIComponent(p.get('talent')).trim();
      if (p.has('digital')) { var d = p.get('digital'); params.digital = d === '1' || d === 'true'; }
      if (p.has('preorder')) { var pr = p.get('preorder'); params.preorder = pr === '1' || pr === 'true'; }
    } catch (e) {}
    return params;
  }

  function loadParamsFromUrl() {
    var params = getParamsFromUrl();
    if (params.q != null && searchInput) searchInput.value = params.q;
    if (params.talent != null && filterTalent) {
      var opt = Array.prototype.find.call(filterTalent.options, function (o) { return o.value === params.talent; });
      if (opt) filterTalent.value = params.talent;
    }
    if (params.digital != null && excludeDigital) excludeDigital.checked = params.digital;
    if (params.preorder != null && excludePreorder) excludePreorder.checked = params.preorder;
  }

  function buildUrlFromState() {
    var q = (searchInput && searchInput.value || '').trim();
    var talent = (filterTalent && filterTalent.value || '').trim();
    var digital = excludeDigital && excludeDigital.checked;
    var preorder = excludePreorder && excludePreorder.checked;
    var p = new URLSearchParams();
    if (q) p.set('q', q);
    if (talent) p.set('talent', talent);
    p.set('digital', digital ? '1' : '0');
    p.set('preorder', preorder ? '1' : '0');
    var search = p.toString();
    return search ? window.location.pathname + '?' + search : window.location.pathname;
  }

  function replaceUrlFromStateDebounced() {
    if (urlReplaceTimeout) clearTimeout(urlReplaceTimeout);
    urlReplaceTimeout = setTimeout(function () {
      urlReplaceTimeout = null;
      var url = buildUrlFromState();
      if (url !== window.location.pathname + window.location.search) {
        window.history.replaceState(null, '', url);
      }
    }, URL_PARAM_DEBOUNCE_MS);
  }

  function onFilterChange() {
    renderTable(applyFilters());
    replaceUrlFromStateDebounced();
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
  if (searchInput) searchInput.addEventListener('input', onFilterChange);

  function closeFilterDropdown() {
    if (!filterDropdown || !filterToggle) return;
    filterDropdown.classList.remove('is-open');
    filterDropdown.setAttribute('hidden', '');
    filterToggle.setAttribute('aria-expanded', 'false');
    var countRow = document.getElementById('count-row');
    if (countRow) countRow.classList.remove('filter-dropdown-open');
    document.body.classList.remove('filter-dropdown-open');
  }

  function openFilterDropdown() {
    if (!filterDropdown || !filterToggle) return;
    filterDropdown.classList.add('is-open');
    filterDropdown.removeAttribute('hidden');
    filterToggle.setAttribute('aria-expanded', 'true');
    var countRow = document.getElementById('count-row');
    if (countRow) countRow.classList.add('filter-dropdown-open');
    document.body.classList.add('filter-dropdown-open');
  }

  function toggleFilterDropdown() {
    if (!filterDropdown || !filterToggle) return;
    var isOpen = filterDropdown.classList.contains('is-open');
    if (isOpen) closeFilterDropdown();
    else openFilterDropdown();
  }

  if (filterToggle && filterDropdown) {
    filterToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleFilterDropdown();
    });
    document.addEventListener('click', function (e) {
      if (!filterDropdown.classList.contains('is-open')) return;
      if (filterToggle.contains(e.target) || filterDropdown.contains(e.target)) return;
      closeFilterDropdown();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeFilterDropdown();
    });
  }

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

  (function initCountRowStuck() {
    var countRow = document.getElementById('count-row');
    if (!countRow) return;
    function updateStuck() {
      var top = countRow.getBoundingClientRect().top;
      if (top <= 0) countRow.classList.add('count-row-is-stuck');
      else countRow.classList.remove('count-row-is-stuck');
    }
    window.addEventListener('scroll', updateStuck, { passive: true });
    window.addEventListener('resize', updateStuck);
    updateStuck();
  })();

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
    loadParamsFromUrl();
    renderTable(applyFilters());
    var countRow = document.getElementById('count-row');
    if (countRow) countRow.classList.add('data-loaded');
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
