(function () {
  const countEl = document.getElementById('count');
  const tableContainer = document.getElementById('table-container');
  const loadingEl = document.getElementById('loading');
  const filterTalent = document.getElementById('filter-talent');
  const excludeDigital = document.getElementById('exclude-digital');
  const excludePreorder = document.getElementById('exclude-preorder');
  const excludeMadeToOrder = document.getElementById('exclude-made-to-order');
  const sortModeSelect = document.getElementById('sort-mode');
  const searchInput = document.getElementById('search-input');
  const filterToggle = document.getElementById('filter-toggle');
  const filterDropdown = document.getElementById('filter-dropdown');

  let allItems = [];
  let talentSearchTerms = {};
  let sortKey = 'date';
  let sortAsc = false;
  let urlReplaceTimeout = null;
  let searchInputTimeout = null;
  const URL_PARAM_DEBOUNCE_MS = 100;
  const SEARCH_DEBOUNCE_MS = 180;
  const mediaTable = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(min-width: 1025px)') : null;
  let useTableView = mediaTable ? mediaTable.matches : true;

  function escapeHtml(s) {
    if (s == null) return '';
    var str = String(s);
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function itemCellHtml(r, prefix) {
    var itemStr = r.item || '—';
    var slashIdx = itemStr.indexOf('/');
    var beforeClass = prefix + '-item-before';
    var afterClass = prefix + '-item-after';
    var linkClass = prefix === 'cell' ? prefix + '-item-link' : prefix + '-link';
    var inner = slashIdx === -1
      ? '<span class="' + afterClass + '">' + escapeHtml(itemStr) + '</span>'
      : '<span class="' + beforeClass + '">' + escapeHtml(itemStr.slice(0, slashIdx).trim()) + '</span><span class="' + afterClass + '">' + escapeHtml(itemStr.slice(slashIdx + 1).trim()) + '</span>';
    if (r.productUrl) return '<a href="' + escapeHtml(r.productUrl) + '" class="' + linkClass + '" target="_blank" rel="noopener">' + inner + '</a>';
    return inner;
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
    return /\bvoice\b|ボイス/i.test(text) || /\baudiobook\b|オーディオブック/i.test(text);
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
    const hideMadeToOrder = excludeMadeToOrder && excludeMadeToOrder.checked;
    const searchQ = (searchInput && searchInput.value || '').trim();

    return allItems.filter(function (row) {
      if (hideDigital && (row.isDigital || isDigitalVoiceContent(row))) return false;
      if (hidePreorder && row.isPreorder) return false;
      if (hideMadeToOrder && (row.isMadeToOrder || /受注販売/.test(row.title || ''))) return false;
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
    var html = '';

    if (useTableView) {
      var thead =
        '<table class="items-table"><thead><tr>' +
        '<th class="cell-title" data-sort="title">Collection <span class="sort-indicator">' + (sortKey === 'title' ? (sortAsc ? '↑' : '↓') : '') + '</span></th>' +
        '<th data-sort="item">Item <span class="sort-indicator">' + (sortKey === 'item' ? (sortAsc ? '↑' : '↓') : '') + '</span></th>' +
        '<th class="no-sort">Image</th>' +
        '<th data-sort="price">Price <span class="sort-indicator">' + (sortKey === 'price' ? (sortAsc ? '↑' : '↓') : '') + '</span></th>' +
        '<th data-sort="stock">Stock <span class="sort-indicator">' + (sortKey === 'stock' ? (sortAsc ? '↑' : '↓') : '') + '</span></th>' +
        '<th class="cell-date" data-sort="date">Date <span class="sort-indicator">' + (sortKey === 'date' ? (sortAsc ? '↑' : '↓') : '') + '</span></th></tr></thead><tbody>';
      var tableRows = [];
      sorted.forEach(function (r) {
        var stockStr = r.stockDisplay != null ? r.stockDisplay : (r.stock != null ? String(r.stock) : '—');
        var row = '<tr>';
        row += '<td class="cell-title">' + escapeHtml(r.title || '—') + '</td>';
        row += '<td class="cell-item">' + itemCellHtml(r, 'cell') + '</td>';
        row += '<td class="cell-image">';
        if (r.imageUrl) row += '<img src="' + escapeHtml(r.imageUrl) + '" alt="" class="item-thumb" loading="lazy" decoding="async">';
        else row += '—';
        row += '</td>';
        row += '<td>' + escapeHtml(r.price || '—') + '</td>';
        row += '<td>' + escapeHtml(stockStr) + '</td>';
        row += '<td class="cell-date">' + escapeHtml(r.date || '—') + '</td></tr>';
        tableRows.push(row);
      });
      html = '<div class="table-wrap">' + thead + tableRows.join('') + '</tbody></table></div>';
    } else {
      var cardParts = [];
      sorted.forEach(function (r) {
        var stockStr = r.stockDisplay != null ? r.stockDisplay : (r.stock != null ? String(r.stock) : '—');
        var card = '<article class="item-card">';
        card += '<div class="card-thumb">';
        if (r.imageUrl) card += '<img src="' + escapeHtml(r.imageUrl) + '" alt="" class="item-thumb" loading="lazy" decoding="async">';
        else card += '<span class="card-no-img">—</span>';
        card += '</div>';
        card += '<div class="card-main">';
        card += '<div class="card-title">' + escapeHtml(r.title || '—') + '</div>';
        card += '<div class="card-item">' + itemCellHtml(r, 'card') + '</div>';
        card += '</div>';
        card += '<div class="card-right">';
        card += '<span class="card-price">' + escapeHtml(r.price || '—') + '</span>';
        card += '<span class="card-stock">' + escapeHtml(stockStr) + '</span>';
        card += '</div>';
        card += '</article>';
        cardParts.push(card);
      });
      html = '<div class="cards-wrap"><div class="item-cards">' + cardParts.join('') + '</div></div>';
    }

    tableContainer.innerHTML = html;
  }

  var modalScrollY = 0;

  function openImagePreview(src) {
    var overlay = document.getElementById('image-preview');
    var img = document.getElementById('image-preview-img');
    if (!overlay || !img) return;
    modalScrollY = window.scrollY;
    var scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    var doc = document.documentElement;
    doc.style.setProperty('--modal-scroll-y', -modalScrollY + 'px');
    doc.style.setProperty('--scrollbar-width', scrollbarWidth + 'px');
    doc.style.setProperty('--modal-doc-height', doc.scrollHeight + 'px');
    document.body.classList.add('image-preview-open');
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
      document.body.classList.remove('image-preview-open');
      var doc = document.documentElement;
      doc.style.removeProperty('--modal-scroll-y');
      doc.style.removeProperty('--scrollbar-width');
      doc.style.removeProperty('--modal-doc-height');
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
  const EXCLUDE_MADE_TO_ORDER_KEY = 'holostock-exclude-made-to-order';

  function loadExcludeFromStorage() {
    try {
      var d = localStorage.getItem(EXCLUDE_DIGITAL_KEY);
      if (d === 'true' || d === 'false') excludeDigital.checked = d === 'true';
    } catch (e) {}
    try {
      var p = localStorage.getItem(EXCLUDE_PREORDER_KEY);
      if (p === 'true' || p === 'false') excludePreorder.checked = p === 'true';
    } catch (e) {}
    try {
      if (excludeMadeToOrder) {
        var m = localStorage.getItem(EXCLUDE_MADE_TO_ORDER_KEY);
        if (m === 'true' || m === 'false') excludeMadeToOrder.checked = m === 'true';
      }
    } catch (e) {}
  }

  function saveExcludeToStorage() {
    try {
      localStorage.setItem(EXCLUDE_DIGITAL_KEY, String(excludeDigital.checked));
      localStorage.setItem(EXCLUDE_PREORDER_KEY, String(excludePreorder.checked));
      if (excludeMadeToOrder) localStorage.setItem(EXCLUDE_MADE_TO_ORDER_KEY, String(excludeMadeToOrder.checked));
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
      if (p.has('madeToOrder')) { var m = p.get('madeToOrder'); params.madeToOrder = m === '1' || m === 'true'; }
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
    if (params.madeToOrder != null && excludeMadeToOrder) excludeMadeToOrder.checked = params.madeToOrder;
  }

  function buildUrlFromState() {
    var q = (searchInput && searchInput.value || '').trim();
    var talent = (filterTalent && filterTalent.value || '').trim();
    var digital = excludeDigital && excludeDigital.checked;
    var preorder = excludePreorder && excludePreorder.checked;
    var madeToOrder = excludeMadeToOrder && excludeMadeToOrder.checked;
    var p = new URLSearchParams();
    if (q) p.set('q', q);
    if (talent) p.set('talent', talent);
    p.set('digital', digital ? '1' : '0');
    p.set('preorder', preorder ? '1' : '0');
    p.set('madeToOrder', madeToOrder ? '1' : '0');
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
  if (excludeMadeToOrder) {
    excludeMadeToOrder.addEventListener('change', function () {
      saveExcludeToStorage();
      onFilterChange();
    });
  }
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      if (searchInputTimeout) clearTimeout(searchInputTimeout);
      searchInputTimeout = setTimeout(function () {
        searchInputTimeout = null;
        onFilterChange();
      }, SEARCH_DEBOUNCE_MS);
    });
  }

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
  }

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var overlay = document.getElementById('image-preview');
    if (overlay && overlay.classList.contains('is-open')) closeImagePreview();
    else if (filterDropdown && filterDropdown.classList.contains('is-open')) closeFilterDropdown();
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

  if (tableContainer) {
    tableContainer.addEventListener('click', function (e) {
      var sortTh = e.target && e.target.closest && e.target.closest('th[data-sort]');
      if (sortTh) {
        var k = sortTh.getAttribute('data-sort');
        if (sortKey === k) sortAsc = !sortAsc;
        else { sortKey = k; sortAsc = true; }
        renderTable(applyFilters());
        return;
      }
      if (e.target && e.target.classList && e.target.classList.contains('item-thumb') && e.target.src) {
        e.preventDefault();
        openImagePreview(e.target.src);
      }
    });
  }

  if (mediaTable) {
    mediaTable.addEventListener('change', function () {
      useTableView = mediaTable.matches;
      renderTable(applyFilters());
    });
  }

  (function initCountRowStuck() {
    var countRow = document.getElementById('count-row');
    if (!countRow) return;
    var scrollDownPeak = 0;
    var SCROLL_UP_THRESHOLD = 40;
    var STUCK_THROTTLE_MS = 100;
    var stuckRaf = null;
    var stuckLastRun = 0;
    function updateStuck() {
      var top = countRow.getBoundingClientRect().top;
      var scrollY = window.scrollY || document.documentElement.scrollTop;
      var isStuck = top <= 0;
      if (isStuck) {
        if (!countRow.classList.contains('count-row-is-stuck')) countRow.classList.add('count-row-is-stuck');
        if (!document.body.classList.contains('sticky-search-engaged')) document.body.classList.add('sticky-search-engaged');
        scrollDownPeak = Math.max(scrollDownPeak, scrollY);
        if (scrollY <= scrollDownPeak - SCROLL_UP_THRESHOLD) {
          if (!document.body.classList.contains('scroll-to-top-visible')) document.body.classList.add('scroll-to-top-visible');
        } else {
          if (document.body.classList.contains('scroll-to-top-visible')) document.body.classList.remove('scroll-to-top-visible');
        }
      } else {
        if (countRow.classList.contains('count-row-is-stuck')) countRow.classList.remove('count-row-is-stuck');
        if (document.body.classList.contains('sticky-search-engaged')) document.body.classList.remove('sticky-search-engaged');
        if (document.body.classList.contains('scroll-to-top-visible')) document.body.classList.remove('scroll-to-top-visible');
        scrollDownPeak = 0;
      }
    }
    function throttledStuck() {
      var now = Date.now();
      if (stuckRaf) return;
      if (now - stuckLastRun >= STUCK_THROTTLE_MS) {
        stuckLastRun = now;
        updateStuck();
      } else {
        stuckRaf = requestAnimationFrame(function () {
          stuckRaf = null;
          stuckLastRun = Date.now();
          updateStuck();
        });
      }
    }
    window.addEventListener('scroll', throttledStuck, { passive: true });
    window.addEventListener('resize', throttledStuck);
    updateStuck();
  })();

  (function initScrollToTop() {
    var btn = document.getElementById('scroll-to-top');
    if (!btn) return;
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
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
