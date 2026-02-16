(function () {
  const countEl = document.getElementById('count');
  const tableContainer = document.getElementById('table-container');
  const loadingEl = document.getElementById('loading');
  const filterTalent = document.getElementById('filter-talent');
  const excludeDigital = document.getElementById('exclude-digital');
  const excludePreorder = document.getElementById('exclude-preorder');

  let allItems = [];
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

  function applyFilters() {
    const talentVal = (filterTalent.value || '').trim();
    const hideDigital = excludeDigital.checked;
    const hidePreorder = excludePreorder.checked;

    return allItems.filter(function (row) {
      if (hideDigital && row.isDigital) return false;
      if (hidePreorder && row.isPreorder) return false;
      if (talentVal && (row.talent || '').toLowerCase() !== talentVal.toLowerCase()) return false;
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
      va = String(va || '');
      vb = String(vb || '');
      const c = va.localeCompare(vb, undefined, { sensitivity: 'base' });
      return asc ? c : -c;
    });
  }

  function renderTable(rows) {
    countEl.textContent = rows.length + ' item(s)';

    const sorted = sortRows(rows);
    let html =
      '<table><thead><tr>' +
      '<th data-sort="title">Title <span class="sort-indicator">' + (sortKey === 'title' ? (sortAsc ? '↑' : '↓') : '') + '</span></th>' +
      '<th data-sort="item">Item <span class="sort-indicator">' + (sortKey === 'item' ? (sortAsc ? '↑' : '↓') : '') + '</span></th>' +
      '<th data-sort="price">Price <span class="sort-indicator">' + (sortKey === 'price' ? (sortAsc ? '↑' : '↓') : '') + '</span></th>' +
      '<th data-sort="date">Date <span class="sort-indicator">' + (sortKey === 'date' ? (sortAsc ? '↑' : '↓') : '') + '</span></th>' +
      '<th>Product</th></tr></thead><tbody>';

    sorted.forEach(function (r) {
      html += '<tr>';
      html += '<td>' + escapeHtml(r.title || '—') + '</td>';
      html += '<td>' + escapeHtml(r.item || '—') + '</td>';
      html += '<td>' + escapeHtml(r.price || '—') + '</td>';
      html += '<td>' + escapeHtml(r.date || '—') + '</td>';
      html += '<td>';
      if (r.productUrl) html += '<a href="' + escapeHtml(r.productUrl) + '" target="_blank" rel="noopener">View</a>';
      else html += '—';
      html += '</td></tr>';
    });
    html += '</tbody></table>';

    tableContainer.innerHTML = html;

    tableContainer.querySelectorAll('th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        const k = th.getAttribute('data-sort');
        if (sortKey === k) sortAsc = !sortAsc;
        else { sortKey = k; sortAsc = true; }
        renderTable(applyFilters());
      });
    });
  }

  function titleCase(s) {
    return (s || '').trim().split(/\s+/).map(function (w) {
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).join(' ');
  }

  function populateFilters() {
    const byLower = new Map();
    allItems.forEach(function (r) {
      const t = (r.talent || '').trim();
      if (!t) return;
      const k = t.toLowerCase();
      if (!byLower.has(k)) byLower.set(k, titleCase(t));
    });
    const talents = Array.from(byLower.values()).sort(function (a, b) { return a.localeCompare(b, undefined, { sensitivity: 'base' }); });

    filterTalent.innerHTML = '<option value="">All</option>' + talents.map(function (t) { return '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + '</option>'; }).join('');
  }

  function onFilterChange() {
    renderTable(applyFilters());
  }

  filterTalent.addEventListener('change', onFilterChange);
  excludeDigital.addEventListener('change', onFilterChange);
  excludePreorder.addEventListener('change', onFilterChange);

  function applyTalentMap(items, map) {
    if (!map || typeof map !== 'object') return;
    items.forEach(function (row) {
      const t = row.talent;
      if (t && map[t] != null) row.talent = map[t];
    });
  }

  Promise.all([
    fetch('data/items.json').then(function (res) {
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      return res.json();
    }),
    fetch('data/talent-jp-to-en.json').then(function (res) { return res.ok ? res.json() : null; }).catch(function () { return null; })
  ]).then(function (results) {
    loadingEl.remove();
    const data = results[0];
    allItems = data.items || [];
    applyTalentMap(allItems, results[1]);
    populateFilters();
    renderTable(allItems);
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
