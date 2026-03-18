/* ═══════════════════════════════════════════════════════════════
   GoldenGate Dashboard v2.0 — app.js
   Refactored: modular, secure, accessible
   ═══════════════════════════════════════════════════════════════ */

// ─── CONFIGURATION ───
const SUPA_URL = 'https://doltqbvslzwovweshgvf.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvbHRxYnZzbHp3b3Z3ZXNoZ3ZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzcwNzgsImV4cCI6MjA4ODgxMzA3OH0.QR4TTYXHCU3qZY4tNQmampTeKB8Tddsm1Hl4xMvmdKg';
const ADMIN_EMAILS = ['marek.dubak@icloud.com'];

// ─── STATE ───
let _supa = null;
let USER_ROLE = null;
let AUTH_TOKEN = null;
let _appReady = false;
let _rendered = {};
let _srObserver = null;

// Data stores
let DATA = {};
let MESICE = [];
let REPORT_RAW = [];
let VYPLA_RAW = [];
let ZALOHY = [];
let FP_DB_RAW = [];
let RPT_RAW_CACHE = null;
let MARA_SPLATKY = [];
let MARA_VYPLATY = [];
let mChart = null;

// ─── UTILITY: Safe text escaping (XSS prevention) ───
function esc(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

// ─── UTILITY: Format currency ───
function fmt(v) { return Math.round(v).toLocaleString('cs-CZ') + ' Kč'; }
function fmtShort(v) { return (v / 1000).toFixed(0) + 'k'; }

// ─── UTILITY: Toast notifications ───
function toast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => { el.classList.add('toast-out'); setTimeout(() => el.remove(), 300); }, 4000);
}

// ─── UTILITY: Export table to CSV ───
function exportTableCSV(tableId) {
  const table = document.getElementById(tableId);
  if (!table) { toast('Tabulka nenalezena', 'error'); return; }
  const rows = table.querySelectorAll('tr');
  let csv = '';
  rows.forEach(row => {
    const cells = row.querySelectorAll('th, td');
    const line = Array.from(cells).map(c => '"' + c.textContent.trim().replace(/"/g, '""') + '"').join(';');
    csv += line + '\n';
  });
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${tableId}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
  toast('CSV exportováno', 'success');
}

function exportCSV() {
  const activeView = document.querySelector('.view.active');
  if (!activeView) return;
  const table = activeView.querySelector('table');
  if (table && table.id) exportTableCSV(table.id);
  else toast('Žádná tabulka k exportu', 'error');
}

// ═══════════════════════════════════════════════
// LOADING SCREEN
// ═══════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  const ld = document.getElementById('gg-loading');
  if (ld) {
    setTimeout(() => ld.classList.add('hide'), 1200);
    setTimeout(() => { if (ld.parentNode) ld.remove(); }, 1800);
  }
});

// ═══════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════
function toggleTheme() {
  const dark = document.body.classList.toggle('dark-mode');
  const badge = document.querySelector('.umd-icon-theme');
  const tl = document.getElementById('umd-theme-label');
  if (badge) badge.innerHTML = dark
    ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  if (tl) tl.textContent = dark ? 'Světlý režim' : 'Tmavý režim';
  localStorage.setItem('gg-theme', dark ? 'dark' : 'light');
}

// Apply saved theme
if (localStorage.getItem('gg-theme') === 'dark') {
  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('dark-mode');
    const badge = document.querySelector('.umd-icon-theme');
    const tl = document.getElementById('umd-theme-label');
    if (badge) badge.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
    if (tl) tl.textContent = 'Světlý režim';
  });
}

// ═══════════════════════════════════════════════
// SCROLL & HEADER
// ═══════════════════════════════════════════════
window.addEventListener('scroll', () => {
  const h = document.getElementById('app-header');
  if (h) h.classList.toggle('scrolled', window.scrollY > 15);
}, { passive: true });

// ═══════════════════════════════════════════════
// MOBILE MENU
// ═══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('mobile-menu-btn');
  const nav = document.getElementById('main-nav');
  if (btn && nav) {
    btn.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      btn.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open);
    });
    // Close on tab click
    nav.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        nav.classList.remove('open');
        btn.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      });
    });
  }
});

// ═══════════════════════════════════════════════
// SCROLL REVEAL (using MutationObserver instead of interval)
// ═══════════════════════════════════════════════
function setupScrollReveal() {
  const selectors = [
    '.sec', '.kpi-row', '.kpi-row-4', '.kpi-row-3', '.kpi-row-2',
    '.chart-grid', '.chart-grid-21', '.chart-grid-1', '.chart-grid-3',
    '.pobocky-row', '.spark-strip', '.z-grid', '.zalohy-filter', '.month-bar',
    '.report-kpi-strip', '.card', '.fp-wrap', '.report-wrap',
    '#report-filter-bar', '[id$="-filter-bar"]', '#vp-listek-wrap',
  ];

  if (_srObserver) _srObserver.disconnect();

  _srObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in-view');
        _srObserver.unobserve(e.target);
      }
    });
  }, { threshold: 0.06, rootMargin: '0px 0px -40px 0px' });

  const activeView = document.querySelector('.view.active');
  if (!activeView) return;

  activeView.querySelectorAll(selectors.join(',')).forEach(el => {
    if (!el.classList.contains('scroll-reveal')) {
      el.classList.add('scroll-reveal');
      el.classList.remove('in-view');
    } else {
      el.classList.remove('in-view');
    }
    _srObserver.observe(el);
  });

  requestAnimationFrame(() => {
    activeView.querySelectorAll('.scroll-reveal:not(.in-view)').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight - 30 && rect.bottom > 0) {
        el.classList.add('in-view');
        _srObserver.unobserve(el);
      }
    });
  });
}

// ═══════════════════════════════════════════════
// TAB NAVIGATION + URL HASH ROUTING
// ═══════════════════════════════════════════════
function show(id) {
  const oldView = document.querySelector('.view.active');
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
  });
  const view = document.getElementById('view-' + id);
  const tab = document.getElementById('tab-' + id);
  if (tab) { tab.classList.add('active'); tab.setAttribute('aria-selected', 'true'); }

  // Update URL hash without scrolling
  if (history.replaceState) history.replaceState(null, null, '#/' + id);

  if (oldView && oldView !== view) {
    oldView.classList.add('wow-exit');
    setTimeout(() => {
      oldView.classList.remove('active', 'wow-exit', 'wow-enter');
      if (view) {
        view.classList.add('active', 'wow-enter');
        view.querySelectorAll('.scroll-reveal').forEach(el => el.classList.remove('in-view'));
        setTimeout(setupScrollReveal, 80);
      }
    }, 250);
  } else if (view && !view.classList.contains('active')) {
    view.classList.add('active', 'wow-enter');
    setTimeout(setupScrollReveal, 80);
  }

  // Lazy init tabs
  if (id === 'cf' && _appReady) { setTimeout(renderCF, 350); return; }
  if (id === 'report' && _appReady) { setTimeout(() => { renderReport(); setTimeout(setupScrollReveal, 200); }, 350); return; }
  if (_appReady && init[id] && !_rendered[id]) {
    setTimeout(() => { init[id](); _rendered[id] = true; setTimeout(setupScrollReveal, 200); }, 350);
  }
}

// Handle hash on load
window.addEventListener('DOMContentLoaded', () => {
  const hash = window.location.hash.replace('#/', '');
  if (hash && document.getElementById('view-' + hash)) {
    // Will be called after auth
    window._initialTab = hash;
  }
});

// Handle back/forward
window.addEventListener('hashchange', () => {
  const hash = window.location.hash.replace('#/', '');
  if (hash && document.getElementById('view-' + hash)) show(hash);
});

// ═══════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
  const tabs = ['prehled', 'mesic', 'zalohy', 'vyplaty', 'finplan', 'report', 'cf', 'mara'];
  if (e.key >= '1' && e.key <= '8' && e.altKey) {
    e.preventDefault();
    show(tabs[parseInt(e.key) - 1]);
  }
  if (e.key === 'd' && e.altKey) { e.preventDefault(); toggleTheme(); }
});

// ═══════════════════════════════════════════════
// SUPABASE AUTH
// ═══════════════════════════════════════════════
async function getAuthToken() {
  if (!_supa) return SUPA_KEY;
  const { data } = await _supa.auth.getSession();
  return data?.session?.access_token || SUPA_KEY;
}

async function supaFetch(table, params = '') {
  const token = await getAuthToken();
  const sep = params ? '&' : '';
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?select=*${sep}${params}`, {
    headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + token, 'Range': '0-9999' }
  });
  if (!res.ok) throw new Error(`Chyba ${res.status} při načítání ${table}`);
  return res.json();
}

async function fetchAllFP() {
  const token = await getAuthToken();
  let all = [], offset = 0;
  while (true) {
    const res = await fetch(
      `${SUPA_URL}/rest/v1/financni_plan_db?order=id.asc&limit=1000&offset=${offset}`,
      { headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + token } }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const page = await res.json();
    if (!Array.isArray(page) || page.length === 0) break;
    all = all.concat(page);
    if (page.length < 1000) break;
    offset += 1000;
  }
  return all;
}

// ─── LOGIN ───
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const pass = document.getElementById('login-pass').value;
      const errEl = document.getElementById('login-err');

      if (!email || !pass) {
        errEl.textContent = 'Vyplňte e-mail a heslo';
        errEl.classList.add('show');
        return;
      }

      try {
        if (!_supa) _supa = supabase.createClient(SUPA_URL, SUPA_KEY);
        const { data, error } = await _supa.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;

        USER_ROLE = ADMIN_EMAILS.includes(email) ? 'admin' : 'reader';
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        document.getElementById('umd-email').textContent = email;
        document.getElementById('umd-role').textContent = USER_ROLE === 'admin' ? 'ADMIN' : 'READER';

        toast('Přihlášení úspěšné', 'success');
        await loadAllData();

        // Navigate to initial tab from URL hash
        if (window._initialTab) { show(window._initialTab); delete window._initialTab; }
        else { setupScrollReveal(); }
      } catch (err) {
        errEl.textContent = err.message || 'Chyba přihlášení';
        errEl.classList.add('show');
        setTimeout(() => errEl.classList.remove('show'), 4000);
      }
    });
  }
});

// ─── Auto-login check ───
document.addEventListener('DOMContentLoaded', async () => {
  try {
    _supa = supabase.createClient(SUPA_URL, SUPA_KEY);
    const { data } = await _supa.auth.getSession();
    if (data?.session?.user) {
      const email = data.session.user.email;
      USER_ROLE = ADMIN_EMAILS.includes(email) ? 'admin' : 'reader';
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('app').style.display = 'block';
      document.getElementById('umd-email').textContent = email;
      document.getElementById('umd-role').textContent = USER_ROLE === 'admin' ? 'ADMIN' : 'READER';
      await loadAllData();
      if (window._initialTab) { show(window._initialTab); delete window._initialTab; }
      else { setupScrollReveal(); }
    }
  } catch (e) { console.warn('Auto-login check failed:', e); }
});

async function doLogout() {
  if (_supa) await _supa.auth.signOut();
  USER_ROLE = null;
  _appReady = false;
  _rendered = {};
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  toast('Odhlášení úspěšné', 'info');
}

// ═══════════════════════════════════════════════
// CHART HELPERS
// ═══════════════════════════════════════════════
function getChartDefaults() {
  const style = getComputedStyle(document.body);
  Chart.defaults.color = style.getPropertyValue('--muted').trim() || '#5A5550';
  Chart.defaults.font.family = "'Syne', sans-serif";
}

function gc() {
  return getComputedStyle(document.body).getPropertyValue('--stripe').trim() || 'rgba(0,0,0,0.03)';
}

function getTT() {
  return {
    backgroundColor: getComputedStyle(document.body).getPropertyValue('--bg3').trim() || '#161616',
    borderColor: 'rgba(201,168,76,0.2)', borderWidth: 1, padding: 10
  };
}

function makeMain(id, labels, trzby, vydaje, zisk) {
  return new Chart(document.getElementById(id), {
    data: { labels, datasets: [
      { type: 'bar', label: 'Tržby', data: trzby, backgroundColor: 'rgba(201,168,76,0.18)', borderColor: 'rgba(201,168,76,0.6)', borderWidth: 1, borderRadius: 5, order: 3 },
      { type: 'bar', label: 'Výdaje', data: vydaje, backgroundColor: 'rgba(217,107,90,0.15)', borderColor: 'rgba(217,107,90,0.5)', borderWidth: 1, borderRadius: 5, order: 2 },
      { type: 'line', label: 'Zisk', data: zisk, borderColor: '#5DB87A', backgroundColor: 'rgba(93,184,122,0.08)', borderWidth: 2, pointBackgroundColor: '#5DB87A', pointRadius: 4, fill: true, tension: 0.4, order: 1 }
    ] },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { ...getTT(), callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` } } },
      scales: { x: { grid: { color: gc() }, ticks: { font: { size: 10 } } }, y: { grid: { color: gc() }, ticks: { font: { size: 10 }, callback: v => fmtShort(v) } } }
    }
  });
}

function makeLine(id, labels, datasets) {
  return new Chart(document.getElementById(id), {
    type: 'line', data: { labels, datasets },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { ...getTT(), callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` } } },
      scales: { x: { grid: { color: gc() }, ticks: { font: { size: 10 } } }, y: { grid: { color: gc() }, ticks: { font: { size: 10 }, callback: v => fmtShort(v) } } }
    }
  });
}

function makePie(id, labels, values, colors) {
  return new Chart(document.getElementById(id), {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: getComputedStyle(document.body).getPropertyValue('--bg2').trim(), borderWidth: 3, hoverOffset: 5 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '70%',
      plugins: { legend: { position: 'bottom', labels: { padding: 14, font: { size: 10 }, usePointStyle: true } },
        tooltip: { ...getTT(), callbacks: { label: c => ` ${c.label}: ${fmt(c.raw)}` } } }
    }
  });
}

// ═══════════════════════════════════════════════
// TAB INIT FUNCTIONS
// ═══════════════════════════════════════════════
const init = {
  zalohy() { zApply(); },
  vyplaty() {
    document.getElementById('vp-month').value = '';
    document.getElementById('vp-rok').value = '';
    document.getElementById('vp-name').value = '';
    vpApply();
  },
  mara() { renderMara(); },
  finplan() { renderFinplan(); },
  cf() { renderCF(); }
};

// ═══════════════════════════════════════════════
// LOAD ALL DATA
// ═══════════════════════════════════════════════
async function loadAllData() {
  document.getElementById('app').style.opacity = '0.5';

  try {
    const [reportRaw, vyplatyRaw, zalohyRaw, fpDbRaw] = await Promise.all([
      supaFetch('report_mesic', 'order=rok.asc,mesic.asc'),
      supaFetch('vyplaty', 'order=rok.asc,mesic.asc'),
      supaFetch('zalohy', 'order=datum.asc'),
      fetchAllFP()
    ]);

    // ── Process report data ──
    REPORT_RAW = Array.isArray(reportRaw) ? reportRaw : [];
    const MESIC_ORDER = ['Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec', 'Leden', 'Únor'];
    const MESIC_SHORT = { 'Srpen': 'Srp 25', 'Září': 'Zář 25', 'Říjen': 'Říj 25', 'Listopad': 'Lis 25', 'Prosinec': 'Pro 25', 'Leden': 'Led 26', 'Únor': 'Úno 26' };
    MESICE = MESIC_ORDER.map(m => MESIC_SHORT[m]);

    const pobMap = { 'Záběhlice': 'zabeh', 'Vršovice': 'vrsov', 'Veleslavín': 'veles' };
    DATA = {
      firma: { trzby: [], vydaje: [], zisk: [] },
      zabeh: { trzby: [], mzdy: [], holicske: [], vydaje_bez_mezd: [], vydaje_celkem: [], vydaje: [], zisk: [] },
      vrsov: { trzby: [], mzdy: [], holicske: [], vydaje_bez_mezd: [], vydaje_celkem: [], vydaje: [], zisk: [] },
      veles: { trzby: [], mzdy: [], holicske: [], vydaje_bez_mezd: [], vydaje_celkem: [], vydaje: [], zisk: [] },
    };

    // Alias: velesv -> veles for compatibility
    DATA.velesv = DATA.veles;

    for (const mes of MESIC_ORDER) {
      const rok = (mes === 'Leden' || mes === 'Únor') ? 2026 : 2025;
      let fT = 0, fV = 0, fZ = 0;
      for (const [pob, key] of Object.entries(pobMap)) {
        const r = reportRaw.find(x => x.mesic === mes && x.rok === rok && x.pobocka === pob);
        DATA[key].trzby.push(r ? r.trzby : 0);
        DATA[key].mzdy.push(r ? r.mzdy : 0);
        DATA[key].holicske.push(r ? r.holicske_potreby : 0);
        DATA[key].vydaje_bez_mezd.push(r ? r.vydaje_bez_mezd : 0);
        DATA[key].vydaje_celkem.push(r ? r.vydaje_celkem : 0);
        DATA[key].vydaje.push(r ? Math.abs(r.vydaje_celkem) : 0);
        DATA[key].zisk.push(r ? r.zisk : 0);
        fT += r ? r.trzby : 0;
        fV += r ? Math.abs(r.vydaje_celkem) : 0;
        fZ += r ? r.zisk : 0;
      }
      DATA.firma.trzby.push(fT);
      DATA.firma.vydaje.push(fV);
      DATA.firma.zisk.push(fZ);
    }

    // ── Process výplaty ──
    const mesicOrder2 = (() => {
      const M = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
      const out = [];
      for (let rok = 2024; rok <= 2028; rok++) for (const m of M) out.push(m + '_' + rok);
      return out;
    })();
    const dostupne = new Set(vyplatyRaw.map(r => r.mesic + '_' + r.rok));
    VYPLA_RAW = mesicOrder2.filter(k => dostupne.has(k)).map(key => {
      const [mes, rokStr] = key.split('_');
      const rok = parseInt(rokStr);
      const barberi = vyplatyRaw.filter(r => r.mesic === mes && r.rok === rok).map(r => ({
        jmeno: r.jmeno, pobocka: r.pobocka, trzba: r.trzba, dizka: r.dizka,
        trzba_po_dizka: r.trzba, pct_rozdil: 0, abs_rozdil: 0,
        provize_minus: r.provize_minus, mzdy_po_provizi: r.mzdy_po_provizi,
        procento: r.procento, mzdy_po_pct: r.mzdy_po_pct,
        pridani_provizi: r.pridani_provizi, mzdy_po_aff: r.mzdy_po_aff,
        zalohy: r.zalohy, vdsluzby: r.vdsluzby, cssz_vzp: r.cssz_vzp,
        mzdy_po_zalohach: r.mzdy_po_zalohach, boss: r.boss
      }));
      return { mesic: mes, rok, key, barberi };
    });
    vpInitBarberSelect(vyplatyRaw);
    zInitBarberSelect(zalohyRaw);

    // ── Process zálohy ──
    const zalohyMap = {};
    for (const z of zalohyRaw) {
      if (!zalohyMap[z.jmeno]) zalohyMap[z.jmeno] = {};
      const key = z.mesic + '_' + z.rok;
      if (!zalohyMap[z.jmeno][key]) zalohyMap[z.jmeno][key] = [];
      let datStr = z.datum || '';
      if (datStr) { const parts = datStr.split('-'); datStr = parts[2] + '.' + parts[1] + '.' + parts[0]; }
      zalohyMap[z.jmeno][key].push({ d: datStr, c: z.castka, p: z.typ || 'Záloha', pozn: z.poznamka || '' });
    }
    ZALOHY = Object.entries(zalohyMap).map(([name, mesice]) => {
      const obj = { name, mesice };
      obj.unor = mesice['Únor_2026'] || [];
      obj.brezen = mesice['Březen_2026'] || [];
      return obj;
    }).sort((a, b) => {
      const sa = Object.values(a.mesice).flat().reduce((s, x) => s + (x.c || 0), 0);
      const sb = Object.values(b.mesice).flat().reduce((s, x) => s + (x.c || 0), 0);
      return sb - sa;
    });

    // ── Mára ──
    const maraRaw = await supaFetch('mara_splatky', 'order=rok.asc,id.asc');
    MARA_SPLATKY = maraRaw.map(r => ({ rok: r.rok, obdobi: r.obdobi, castka: r.castka, zaplaceno: r.zaplaceno, zbyvajici_dluh: r.zbyvajici_dluh }));
    const maraVypRaw = await supaFetch('mara_vyplaty', 'order=datum.asc,id.asc');
    MARA_VYPLATY = maraVypRaw.map(r => ({ castka: r.castka, datum: r.datum }));

    // ── Finanční plán ──
    FP_DB_RAW = Array.isArray(fpDbRaw) ? fpDbRaw : [];

    // ── Render initial views ──
    document.getElementById('app').style.opacity = '1';
    _appReady = true;
    getChartDefaults();

    renderPrehled();
    reportInitSelects(null);
    cfInitSelects(null);
    renderReport();
    renderMara();
    _rendered.mara = true;
    renderFinplan();
    _rendered.finplan = true;

    toast('Data úspěšně načtena', 'success');
  } catch (err) {
    console.error('loadAllData error:', err);
    document.getElementById('app').style.opacity = '1';
    toast('Chyba při načítání dat: ' + err.message, 'error');
  }
}

// ═══════════════════════════════════════════════
// RENDER: PŘEHLED (Tab 1)
// ═══════════════════════════════════════════════
function renderPrehled() {
  const d = DATA.firma;
  const lastIdx = d.trzby.length - 1;
  const trzby = d.trzby.reduce((a, b) => a + b, 0);
  const vydaje = d.vydaje.reduce((a, b) => a + b, 0);
  const zisk = d.zisk.reduce((a, b) => a + b, 0);
  const marze = trzby > 0 ? ((zisk / trzby) * 100).toFixed(1) : '0.0';

  document.getElementById('kpi-main').innerHTML = `
    <div class="kpi" style="--kpi-accent:var(--gold)"><div class="kpi-label">Celkové tržby</div><div class="kpi-val">${esc(fmt(trzby))}</div><div class="kpi-footer"><span class="kpi-sub">${MESICE[0]} – ${MESICE[lastIdx]}</span></div></div>
    <div class="kpi" style="--kpi-accent:var(--pos)"><div class="kpi-label">Celkový zisk</div><div class="kpi-val" style="color:var(--gold2)">${esc(fmt(zisk))}</div><div class="kpi-footer"><span class="badge ${zisk >= 0 ? 'up' : 'down'}">${zisk >= 0 ? '▲' : '▼'} ${marze}%</span><span class="kpi-sub">marže</span></div></div>
    <div class="kpi" style="--kpi-accent:var(--neg)"><div class="kpi-label">Celkové výdaje</div><div class="kpi-val">${esc(fmt(vydaje))}</div><div class="kpi-footer"><span class="kpi-sub">${MESICE.length} měsíců</span></div></div>
    <div class="kpi" style="--kpi-accent:var(--blue)"><div class="kpi-label">Průměr. měs. zisk</div><div class="kpi-val sm">${esc(fmt(zisk / MESICE.length))}</div><div class="kpi-footer"><span class="kpi-sub">Kč / měsíc</span></div></div>`;

  // Main chart
  makeMain('chart-main', MESICE, d.trzby, d.vydaje, d.zisk);

  // Pie chart
  const zabT = DATA.zabeh.trzby.reduce((a, b) => a + b, 0);
  const vrsT = DATA.vrsov.trzby.reduce((a, b) => a + b, 0);
  const velT = DATA.veles.trzby.reduce((a, b) => a + b, 0);
  makePie('chart-pie', ['Záběhlice', 'Vršovice', 'Veleslavín'], [zabT, vrsT, velT],
    ['rgba(201,168,76,0.7)', 'rgba(93,184,122,0.7)', 'rgba(217,107,90,0.7)']);

  // Sparklines
  const sparks = [
    { name: 'Záběhlice', color: 'var(--zabeh)', d: DATA.zabeh },
    { name: 'Vršovice', color: 'var(--vrsov)', d: DATA.vrsov },
    { name: 'Veleslavín', color: 'var(--velesv)', d: DATA.veles },
  ];
  document.getElementById('spark-strip').innerHTML = sparks.map((s, si) => {
    const total = s.d.trzby.reduce((a, b) => a + b, 0);
    const canvasId = 'spark-' + si;
    return `<div class="spark-card"><div class="spark-label" style="color:${s.color}">${esc(s.name)}</div>
      <div class="spark-meta"><div class="spark-val">${esc(fmt(total))}</div></div>
      <div class="spark-wrap"><canvas id="${canvasId}" aria-label="Sparkline ${esc(s.name)}"></canvas></div></div>`;
  }).join('');

  // Render sparkline charts
  sparks.forEach((s, si) => {
    makeLine('spark-' + si, MESICE, [{
      data: s.d.trzby, borderColor: s.color, backgroundColor: 'transparent',
      borderWidth: 2, pointRadius: 0, tension: 0.4, fill: false
    }]);
  });

  // Main table
  renderMainTable();

  // Month pills for tab 2
  const pills = document.getElementById('month-pills');
  if (pills) {
    pills.innerHTML = MESICE.map((m, i) =>
      `<button class="mpill${i === lastIdx ? ' active' : ''}" onclick="selectMonth(${i})" role="radio" aria-checked="${i === lastIdx}" aria-label="${esc(m)}">${esc(m)}</button>`
    ).join('');
  }
  selectMonth(lastIdx);
}

function renderMainTable() {
  const allM = MESICE;
  const dz = DATA.zabeh, dv = DATA.vrsov, dve = DATA.veles;
  const sections = [
    { label: 'ZÁBĚHLICE', d: dz, color: 'var(--zabeh)', dot: '#B8940E' },
    { label: 'VRŠOVICE', d: dv, color: 'var(--vrsov)', dot: '#2E8B4F' },
    { label: 'VELESLAVÍN', d: dve, color: 'var(--velesv)', dot: '#C0392B' },
    { label: 'CELKEM FIRMA', d: DATA.firma, color: 'var(--text)', isTotal: true, dot: '#1A1814' },
  ];
  const rows = [
    { key: 'trzby', label: 'Tržby', fmtFn: v => v.toLocaleString('cs-CZ'), cls: 'val-g' },
    { key: 'mzdy', label: 'Mzdy', fmtFn: v => '-' + v.toLocaleString('cs-CZ'), cls: 'val-n', skip: ['firma'] },
    { key: 'vydaje_bez_mezd', label: 'Výdaje bez mezd', fmtFn: v => '-' + v.toLocaleString('cs-CZ'), cls: 'val-n', skip: ['firma'] },
    { key: 'vydaje', label: 'Výdaje celkem', fmtFn: v => '-' + v.toLocaleString('cs-CZ'), cls: 'val-n' },
    { key: 'zisk', label: 'Zisk', fmtFn: v => v.toLocaleString('cs-CZ'), cls: 'tr-zisk' },
  ];

  let tblHTML = `<thead><tr><th>Ukazatel</th>${allM.map(mm => `<th>${esc(mm)}</th>`).join('')}</tr></thead><tbody>`;
  sections.forEach(sec => {
    const secKey = sec.label.includes('ZÁBĚHLICE') ? 'zabeh' : sec.label.includes('VRŠOVICE') ? 'vrsov' : sec.label.includes('VELESLAVÍN') ? 'velesv' : 'firma';
    tblHTML += `<tr class="tr-head"><td colspan="${allM.length + 1}"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${sec.dot};margin-right:8px;vertical-align:middle"></span><span style="color:${sec.color}">${esc(sec.label)}</span></td></tr>`;
    rows.forEach(row => {
      if (row.skip && row.skip.includes(secKey)) return;
      const vals = sec.d[row.key];
      if (!vals) return;
      const isTr = row.cls === 'tr-zisk';
      tblHTML += `<tr${isTr ? ' class="tr-zisk"' : ''}><td>${esc(row.label)}</td>${allM.map((mm, i) => `<td class="${row.cls || ''}">${esc(row.fmtFn(Math.round(vals[i])))}</td>`).join('')}</tr>`;
    });
  });
  tblHTML += '</tbody>';
  document.getElementById('main-table').innerHTML = tblHTML;
}

// ═══════════════════════════════════════════════
// RENDER: MĚSÍC (Tab 2)
// ═══════════════════════════════════════════════
function selectMonth(idx) {
  document.querySelectorAll('.mpill').forEach((b, i) => {
    b.classList.toggle('active', i === idx);
    b.setAttribute('aria-checked', i === idx);
  });

  const m = MESICE[idx];
  const mPrev = idx > 0 ? MESICE[idx - 1] : null;
  document.getElementById('month-meta').textContent = mPrev ? `srovnání s: ${mPrev}` : '';

  const d = DATA.firma;
  const dz = DATA.zabeh, dv = DATA.vrsov, dve = DATA.veles;
  const trzby = d.trzby[idx], vydaje = d.vydaje[idx], zisk = d.zisk[idx];
  const marze = trzby > 0 ? ((zisk / trzby) * 100).toFixed(1) : '0.0';
  const zPrev = idx > 0 ? d.zisk[idx - 1] : null;
  const tPrev = idx > 0 ? d.trzby[idx - 1] : null;
  const zChange = zPrev ? ((zisk - zPrev) / Math.abs(zPrev) * 100).toFixed(1) : null;
  const tChange = tPrev ? ((trzby - tPrev) / Math.abs(tPrev) * 100).toFixed(1) : null;

  const secKpi = document.getElementById('m-sec-kpi');
  if (secKpi) secKpi.querySelector('span').textContent = `Celková firma — ${m}`;

  document.getElementById('m-kpi').innerHTML = `
    <div class="kpi" style="--kpi-accent:var(--gold)"><div class="kpi-label">Tržby</div><div class="kpi-val sm">${trzby.toLocaleString('cs-CZ')}</div><div class="kpi-footer">${tChange !== null ? `<span class="badge ${parseFloat(tChange) >= 0 ? 'up' : 'down'}">${parseFloat(tChange) >= 0 ? '▲' : '▼'} ${Math.abs(tChange)}%</span>` : ''}<span class="kpi-sub">Kč</span></div></div>
    <div class="kpi" style="--kpi-accent:var(--pos)"><div class="kpi-label">Čistý zisk</div><div class="kpi-val sm" style="color:var(--gold2)">${zisk.toLocaleString('cs-CZ')}</div><div class="kpi-footer">${zChange !== null ? `<span class="badge ${parseFloat(zChange) >= 0 ? 'up' : 'down'}">${parseFloat(zChange) >= 0 ? '▲' : '▼'} ${Math.abs(zChange)}%</span>` : ''}<span class="kpi-sub">Kč</span></div></div>
    <div class="kpi" style="--kpi-accent:var(--neg)"><div class="kpi-label">Výdaje celkem</div><div class="kpi-val sm">${vydaje.toLocaleString('cs-CZ')}</div><div class="kpi-footer"><span class="kpi-sub">Kč</span></div></div>
    <div class="kpi" style="--kpi-accent:var(--blue)"><div class="kpi-label">Marže zisku</div><div class="kpi-val sm">${marze}%</div><div class="kpi-footer"><span class="kpi-sub">Zisk / Tržby</span></div></div>`;

  // Pobočky cards
  const pobockyData = [
    { name: 'Záběhlice', color: 'var(--zabeh)', d: dz },
    { name: 'Vršovice', color: 'var(--vrsov)', d: dv },
    { name: 'Veleslavín', color: 'var(--velesv)', d: dve },
  ];
  document.getElementById('m-pobocky').innerHTML = pobockyData.map(p => {
    const t = p.d.trzby[idx], mzdy = p.d.mzdy[idx], z = p.d.zisk[idx];
    const vyd = p.d.vydaje[idx], vmz = p.d.vydaje_bez_mezd[idx];
    const mar = t > 0 ? ((z / t) * 100).toFixed(1) : '0.0';
    return `<div class="pobocka" style="--p-color:${p.color}">
      <div class="pobocka-name" style="color:${p.color}">${esc(p.name)}</div>
      <div class="pobocka-line"><span class="p-lbl">Tržby</span><span class="p-val val-g">${t.toLocaleString('cs-CZ')} Kč</span></div>
      <div class="pobocka-line"><span class="p-lbl">Mzdy</span><span class="p-val val-n">-${mzdy.toLocaleString('cs-CZ')} Kč</span></div>
      <div class="pobocka-line"><span class="p-lbl">Výdaje bez mezd</span><span class="p-val val-n">-${vmz.toLocaleString('cs-CZ')} Kč</span></div>
      <div class="pobocka-line"><span class="p-lbl">Výdaje celkem</span><span class="p-val val-n">-${vyd.toLocaleString('cs-CZ')} Kč</span></div>
      <div class="pobocka-line"><span class="p-lbl">Zisk</span><span class="p-val" style="color:var(--gold2)">${z.toLocaleString('cs-CZ')} Kč</span></div>
      <div class="pobocka-line"><span class="p-lbl">Marže</span><span class="p-val" style="color:var(--pos)">${mar}%</span></div>
    </div>`;
  }).join('');

  // Bar chart
  document.getElementById('m-chart-title').textContent = `Firma — ${m}${mPrev ? ' vs ' + mPrev : ''}`;
  document.getElementById('m-chart-sub').textContent = 'Tržby, Výdaje, Zisk';
  if (mChart) mChart.destroy();
  const barLabels = mPrev ? [mPrev, m] : [m];
  const barIdx = mPrev ? [idx - 1, idx] : [idx];
  mChart = new Chart(document.getElementById('m-bar'), {
    type: 'bar',
    data: { labels: barLabels, datasets: [
      { label: 'Tržby', data: barIdx.map(i => DATA.firma.trzby[i]), backgroundColor: 'rgba(201,168,76,0.25)', borderColor: 'rgba(201,168,76,0.7)', borderWidth: 1, borderRadius: 6 },
      { label: 'Výdaje', data: barIdx.map(i => DATA.firma.vydaje[i]), backgroundColor: 'rgba(217,107,90,0.2)', borderColor: 'rgba(217,107,90,0.6)', borderWidth: 1, borderRadius: 6 },
      { label: 'Zisk', data: barIdx.map(i => DATA.firma.zisk[i]), backgroundColor: 'rgba(93,184,122,0.25)', borderColor: 'rgba(93,184,122,0.7)', borderWidth: 1, borderRadius: 6 },
    ] },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { ...getTT(), callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.raw)}` } } },
      scales: { x: { grid: { color: gc() } }, y: { grid: { color: gc() }, ticks: { callback: v => fmtShort(v) } } }
    }
  });

  // Month table
  const allM = MESICE;
  const sections = [
    { label: 'ZÁBĚHLICE', d: dz, color: 'var(--zabeh)', dot: '#B8940E' },
    { label: 'VRŠOVICE', d: dv, color: 'var(--vrsov)', dot: '#2E8B4F' },
    { label: 'VELESLAVÍN', d: dve, color: 'var(--velesv)', dot: '#C0392B' },
    { label: 'CELKEM FIRMA', d: DATA.firma, color: 'var(--text)', isTotal: true, dot: '#1A1814' },
  ];
  const rowDefs = [
    { key: 'trzby', label: 'Tržby', fmtFn: v => v.toLocaleString('cs-CZ'), cls: 'val-g' },
    { key: 'mzdy', label: 'Mzdy', fmtFn: v => '-' + v.toLocaleString('cs-CZ'), cls: 'val-n', skip: ['firma'] },
    { key: 'vydaje_bez_mezd', label: 'Výdaje bez mezd', fmtFn: v => '-' + v.toLocaleString('cs-CZ'), cls: 'val-n', skip: ['firma'] },
    { key: 'vydaje', label: 'Výdaje celkem', fmtFn: v => '-' + v.toLocaleString('cs-CZ'), cls: 'val-n' },
    { key: 'zisk', label: 'Zisk', fmtFn: v => v.toLocaleString('cs-CZ'), cls: 'tr-zisk' },
  ];

  let tblHTML = `<thead><tr><th>Ukazatel</th>${allM.map(mm => `<th${mm === m ? ' style="color:var(--gold);border-bottom:1px solid var(--gold)"' : ''}>${esc(mm)}</th>`).join('')}</tr></thead><tbody>`;
  sections.forEach(sec => {
    const secKey = sec.label.includes('ZÁBĚHLICE') ? 'zabeh' : sec.label.includes('VRŠOVICE') ? 'vrsov' : sec.label.includes('VELESLAVÍN') ? 'velesv' : 'firma';
    tblHTML += `<tr class="tr-head"><td colspan="${allM.length + 1}"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${sec.dot};margin-right:8px;vertical-align:middle"></span><span style="color:${sec.color}">${esc(sec.label)}</span></td></tr>`;
    rowDefs.forEach(row => {
      if (row.skip && row.skip.includes(secKey)) return;
      const vals = sec.d[row.key];
      if (!vals) return;
      const isTr = row.cls === 'tr-zisk';
      tblHTML += `<tr${isTr ? ' class="tr-zisk"' : ''}><td>${esc(row.label)}</td>${allM.map((mm, i) => {
        const isActive = mm === m;
        return `<td class="${row.cls || ''}"${isActive ? ' style="background:rgba(201,168,76,0.04)"' : ''}>${esc(row.fmtFn(Math.round(vals[i])))}</td>`;
      }).join('')}</tr>`;
    });
  });
  tblHTML += '</tbody>';
  document.getElementById('m-table').innerHTML = tblHTML;
}


// ═══════════════════════════════════════════════
// ZÁLOHY (Tab 3)
// ═══════════════════════════════════════════════
function zInitBarberSelect(raw) {
  const names = [...new Set(raw.map(r => r.jmeno))].sort();
  const sel = document.getElementById('z-name');
  if (!sel) return;
  sel.innerHTML = '<option value="">Všichni</option>' + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');

  const months = [...new Set(raw.map(r => r.mesic + ' ' + r.rok))];
  const msel = document.getElementById('z-month');
  if (msel) msel.innerHTML = '<option value="">Všechny</option>' + months.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
}

function zApply() {
  const nameF = document.getElementById('z-name').value;
  const monthF = document.getElementById('z-month').value;

  let filtered = ZALOHY;
  if (nameF) filtered = filtered.filter(z => z.name === nameF);

  const grid = document.getElementById('z-grid');
  const info = document.getElementById('z-info');
  if (!filtered.length) { grid.innerHTML = '<div class="z-empty">Žádné zálohy k zobrazení</div>'; info.textContent = ''; return; }

  let totalAll = 0;
  let html = '';
  filtered.forEach(person => {
    let personTotal = 0;
    let monthsHTML = '';
    const sortedMonths = Object.entries(person.mesice).sort((a, b) => {
      const [mA, rA] = a[0].split('_'); const [mB, rB] = b[0].split('_');
      return (parseInt(rA) - parseInt(rB)) || a[0].localeCompare(b[0]);
    });

    sortedMonths.forEach(([key, items]) => {
      if (monthF) {
        const [mName, yr] = key.split('_');
        if ((mName + ' ' + yr) !== monthF) return;
      }
      const sub = items.reduce((s, x) => s + (x.c || 0), 0);
      personTotal += sub;
      const dotColor = sub >= 0 ? 'var(--pos)' : 'var(--neg)';
      monthsHTML += `<div class="z-month-sec"><div class="z-mlabel"><span class="z-mdot" style="background:${dotColor}"></span>${esc(key.replace('_', ' '))}</div>`;
      items.forEach(it => {
        const cls = it.c >= 0 ? 'pos' : 'neg';
        const typCls = (it.p || '').toLowerCase().includes('pokut') ? 'typ-pokuta' : (it.p || '').toLowerCase().includes('bonus') ? 'typ-bonus' : (it.p || '').toLowerCase().includes('korekc') ? 'typ-korekce' : 'typ-zaloha';
        monthsHTML += `<div class="z-row"><span class="z-date">${esc(it.d)}</span><span class="z-amt ${cls}">${it.c >= 0 ? '+' : ''}${it.c.toLocaleString('cs-CZ')} Kč</span><span class="z-typ ${typCls}">${esc(it.p || 'Záloha')}</span><span class="z-note${(it.p || '').toLowerCase().includes('pokut') ? ' pokuta' : ''}">${esc(it.pozn)}</span></div>`;
      });
      monthsHTML += `<div class="z-subtotal">Mezisoučet: <em>${sub.toLocaleString('cs-CZ')} Kč</em></div></div>`;
    });

    if (!monthsHTML) return;
    totalAll += personTotal;
    const initials = person.name.split(' ').map(w => w[0]).join('').toUpperCase();
    html += `<div class="z-card"><div class="z-head"><div class="z-name"><span class="z-avatar">${esc(initials)}</span>${esc(person.name)}</div><div class="z-total">${personTotal.toLocaleString('cs-CZ')} Kč</div></div>${monthsHTML}</div>`;
  });

  grid.innerHTML = html || '<div class="z-empty">Žádné zálohy odpovídající filtru</div>';
  info.innerHTML = `Zobrazeno: <strong>${filtered.length}</strong> osob · Celkem: <strong>${totalAll.toLocaleString('cs-CZ')} Kč</strong>`;
}

function zReset() {
  document.getElementById('z-name').value = '';
  document.getElementById('z-month').value = '';
  zApply();
}

// ═══════════════════════════════════════════════
// VÝPLATY (Tab 4)
// ═══════════════════════════════════════════════
function vpInitBarberSelect(raw) {
  const names = [...new Set(raw.map(r => r.jmeno))].sort();
  const sel = document.getElementById('vp-name');
  if (sel) sel.innerHTML = '<option value="">Všichni</option>' + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');

  const months = [...new Set(raw.map(r => r.mesic))].sort();
  const msel = document.getElementById('vp-month');
  if (msel) msel.innerHTML = '<option value="">Všechny</option>' + months.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');

  const years = [...new Set(raw.map(r => r.rok))].sort();
  const ysel = document.getElementById('vp-rok');
  if (ysel) ysel.innerHTML = '<option value="">Všechny</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
}

function vpApply() {
  const nameF = document.getElementById('vp-name').value;
  const monthF = document.getElementById('vp-month').value;
  const rokF = document.getElementById('vp-rok').value;

  let filtered = VYPLA_RAW;
  if (monthF) filtered = filtered.filter(r => r.mesic === monthF);
  if (rokF) filtered = filtered.filter(r => r.rok === parseInt(rokF));

  const wrap = document.getElementById('vp-listek-wrap');
  if (!filtered.length) { wrap.innerHTML = '<div class="z-empty">Žádné výplaty k zobrazení</div>'; return; }

  let html = '';
  filtered.forEach(period => {
    let barberi = period.barberi;
    if (nameF) barberi = barberi.filter(b => b.jmeno === nameF);
    if (!barberi.length) return;

    barberi.forEach(b => {
      html += `<div class="card" style="margin-bottom:16px"><div class="card-head"><div><div class="card-title">${esc(b.jmeno)}</div><div class="card-sub">${esc(period.mesic)} ${period.rok} · ${esc(b.pobocka || '')}</div></div></div>
      <div class="tbl-wrap"><table aria-label="Výplatní lístek ${esc(b.jmeno)}">
        <tr class="vp-row"><td class="vp-item">Tržba</td><td class="vp-val">${(b.trzba || 0).toLocaleString('cs-CZ')} Kč</td></tr>
        <tr class="vp-row"><td class="vp-item">Dížka</td><td class="vp-val vp-neg">-${(b.dizka || 0).toLocaleString('cs-CZ')} Kč</td></tr>
        <tr class="vp-sub"><td class="vp-item">Tržba po dížce</td><td class="vp-val">${(b.trzba_po_dizka || 0).toLocaleString('cs-CZ')} Kč</td></tr>
        <tr class="vp-row"><td class="vp-item">Provize minus</td><td class="vp-val vp-neg">-${(b.provize_minus || 0).toLocaleString('cs-CZ')} Kč</td></tr>
        <tr class="vp-sub"><td class="vp-item">Mzdy po provizi</td><td class="vp-val">${(b.mzdy_po_provizi || 0).toLocaleString('cs-CZ')} Kč</td></tr>
        <tr class="vp-row"><td class="vp-item">Procento (${b.procento || 0}%)</td><td class="vp-val">${(b.mzdy_po_pct || 0).toLocaleString('cs-CZ')} Kč</td></tr>
        <tr class="vp-row"><td class="vp-item">Přidání provizí</td><td class="vp-val vp-pos">+${(b.pridani_provizi || 0).toLocaleString('cs-CZ')} Kč</td></tr>
        <tr class="vp-sub"><td class="vp-item">Mzdy po aff</td><td class="vp-val">${(b.mzdy_po_aff || 0).toLocaleString('cs-CZ')} Kč</td></tr>
        <tr class="vp-row"><td class="vp-item">Zálohy</td><td class="vp-val vp-neg">-${(b.zalohy || 0).toLocaleString('cs-CZ')} Kč</td></tr>
        <tr class="vp-row"><td class="vp-item">VD služby</td><td class="vp-val vp-neg">-${(b.vdsluzby || 0).toLocaleString('cs-CZ')} Kč</td></tr>
        <tr class="vp-row"><td class="vp-item">ČSSZ + VZP</td><td class="vp-val vp-neg">-${(b.cssz_vzp || 0).toLocaleString('cs-CZ')} Kč</td></tr>
        <tr class="vp-final"><td class="vp-item-final">K VÝPLATĚ</td><td class="vp-val-final" style="color:var(--gold2)">${(b.mzdy_po_zalohach || 0).toLocaleString('cs-CZ')} Kč</td></tr>
        ${b.boss ? `<tr class="vp-row"><td class="vp-item">Boss</td><td class="vp-val">${(b.boss || 0).toLocaleString('cs-CZ')} Kč</td></tr>` : ''}
      </table></div></div>`;
    });
  });

  wrap.innerHTML = html || '<div class="z-empty">Žádné výplaty odpovídající filtru</div>';

  // 3-month comparison
  render3MonthComparison(nameF);
}

function render3MonthComparison(nameF) {
  const last3 = VYPLA_RAW.slice(-3);
  const cols = last3.map(p => p.mesic + ' ' + p.rok);
  document.getElementById('vp-col1').textContent = cols[0] || '';
  document.getElementById('vp-col2').textContent = cols[1] || '';
  document.getElementById('vp-col3').textContent = cols[2] || '';

  const metrics = ['trzba', 'dizka', 'mzdy_po_provizi', 'mzdy_po_pct', 'mzdy_po_aff', 'zalohy', 'mzdy_po_zalohach'];
  const labels = ['Tržba', 'Dížka', 'Mzdy po provizi', 'Mzdy po %', 'Mzdy po aff', 'Zálohy', 'K výplatě'];

  let html = '';
  metrics.forEach((key, mi) => {
    html += '<tr>';
    html += `<td style="text-align:left;font-family:Syne,sans-serif;font-size:12px;color:var(--muted2)">${labels[mi]}</td>`;
    last3.forEach(period => {
      let barberi = period.barberi;
      if (nameF) barberi = barberi.filter(b => b.jmeno === nameF);
      const sum = barberi.reduce((s, b) => s + (b[key] || 0), 0);
      html += `<td style="text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px">${sum.toLocaleString('cs-CZ')} Kč</td>`;
    });
    html += '</tr>';
  });
  document.getElementById('vp-tbody3m').innerHTML = html;
}

function vpReset() {
  document.getElementById('vp-name').value = '';
  document.getElementById('vp-month').value = '';
  document.getElementById('vp-rok').value = '';
  vpApply();
}

function vpExportPDF() {
  document.body.classList.add('printing-vp');
  const periodText = `${document.getElementById('vp-month').value || 'Vše'} ${document.getElementById('vp-rok').value || ''}`;
  document.getElementById('vp-print-period').textContent = periodText;
  setTimeout(() => { window.print(); document.body.classList.remove('printing-vp'); }, 200);
}

// ═══════════════════════════════════════════════
// FINANČNÍ PLÁN (Tab 5)
// ═══════════════════════════════════════════════
function renderFinplan() {
  if (!FP_DB_RAW.length) return;

  const rows = FP_DB_RAW;
  const months = [...new Set(rows.map(r => r.mesic).filter(Boolean))];
  const groups = {};
  rows.forEach(r => {
    const sec = r.sekce || 'Ostatní';
    if (!groups[sec]) groups[sec] = [];
    groups[sec].push(r);
  });

  const thead = document.getElementById('fp-thead');
  const tbody = document.getElementById('fp-tbody');
  thead.innerHTML = `<tr><th>Sekce</th><th>Kategorie</th><th>Položka</th>${months.map(m => `<th>${esc(m)}</th>`).join('')}<th>Celkem</th></tr>`;

  let html = '';
  let grandTrzby = 0, grandVydaje = 0, grandZisk = 0;
  const kumul = new Array(months.length).fill(0);

  Object.entries(groups).forEach(([sec, items]) => {
    html += `<tr class="fp-section-head"><td colspan="${months.length + 4}">${esc(sec)}</td></tr>`;
    let secTotals = new Array(months.length).fill(0);

    items.forEach(item => {
      html += '<tr>';
      html += `<td>${esc(item.sekce || '')}</td>`;
      html += `<td>${esc(item.kategorie || '')}</td>`;
      html += `<td>${esc(item.polozka || '')}</td>`;
      let rowSum = 0;
      months.forEach((m, mi) => {
        const val = item[m] || 0;
        rowSum += val;
        secTotals[mi] += val;
        const cls = val > 0 ? 'fp-pos' : val < 0 ? 'fp-neg' : 'fp-muted';
        html += `<td class="${cls}">${val !== 0 ? val.toLocaleString('cs-CZ') : '—'}</td>`;
      });
      const rCls = rowSum > 0 ? 'fp-pos' : rowSum < 0 ? 'fp-neg' : 'fp-muted';
      html += `<td class="${rCls}" style="font-weight:700">${rowSum !== 0 ? rowSum.toLocaleString('cs-CZ') : '—'}</td>`;
      html += '</tr>';
    });

    // Section total
    const secSum = secTotals.reduce((a, b) => a + b, 0);
    html += `<tr class="fp-total-row"><td>${esc(sec)} — Celkem</td><td></td><td></td>`;
    secTotals.forEach((v, mi) => {
      kumul[mi] += v;
      const cls = v > 0 ? 'fp-pos' : v < 0 ? 'fp-neg' : 'fp-muted';
      html += `<td class="${cls}">${v !== 0 ? v.toLocaleString('cs-CZ') : '—'}</td>`;
    });
    const sCls = secSum > 0 ? 'fp-pos' : secSum < 0 ? 'fp-neg' : 'fp-muted';
    html += `<td class="${sCls}">${secSum !== 0 ? secSum.toLocaleString('cs-CZ') : '—'}</td></tr>`;

    if (sec.toLowerCase().includes('tržb') || sec.toLowerCase().includes('příj')) grandTrzby += secSum;
    else grandVydaje += Math.abs(secSum);
  });

  grandZisk = grandTrzby - grandVydaje;
  tbody.innerHTML = html;

  // KPI
  document.getElementById('fp-kpi-trzby').textContent = grandTrzby.toLocaleString('cs-CZ');
  document.getElementById('fp-kpi-vydaje').textContent = grandVydaje.toLocaleString('cs-CZ');
  document.getElementById('fp-kpi-zisk').textContent = grandZisk.toLocaleString('cs-CZ');
  const lastKumul = kumul.reduce((a, b) => a + b, 0);
  document.getElementById('fp-kpi-kumul').textContent = lastKumul.toLocaleString('cs-CZ');
  document.getElementById('fp-kpi-kumul-sub').textContent = lastKumul >= 0 ? 'kladný' : 'záporný';
}

// ═══════════════════════════════════════════════
// REPORT (Tab 6) + CASH FLOW (Tab 7)
// ═══════════════════════════════════════════════
function reportInitSelects(cache) {
  const periods = REPORT_RAW.map(r => ({ mesic: r.mesic, rok: r.rok }));
  const unique = [...new Map(periods.map(p => [p.mesic + '_' + p.rok, p])).values()];

  const fromSel = document.getElementById('rpt-from');
  const toSel = document.getElementById('rpt-to');
  if (!fromSel || !toSel) return;

  const opts = unique.map(p => `<option value="${esc(p.mesic + '_' + p.rok)}">${esc(p.mesic)} ${p.rok}</option>`).join('');
  fromSel.innerHTML = opts;
  toSel.innerHTML = opts;
  if (unique.length > 0) { fromSel.selectedIndex = 0; toSel.selectedIndex = unique.length - 1; }
}

function cfInitSelects(cache) {
  const periods = REPORT_RAW.map(r => ({ mesic: r.mesic, rok: r.rok }));
  const unique = [...new Map(periods.map(p => [p.mesic + '_' + p.rok, p])).values()];

  const fromSel = document.getElementById('cf-from');
  const toSel = document.getElementById('cf-to');
  if (!fromSel || !toSel) return;

  const opts = unique.map(p => `<option value="${esc(p.mesic + '_' + p.rok)}">${esc(p.mesic)} ${p.rok}</option>`).join('');
  fromSel.innerHTML = opts;
  toSel.innerHTML = opts;
  if (unique.length > 0) { fromSel.selectedIndex = 0; toSel.selectedIndex = unique.length - 1; }
}

function reportApplyFilter() { renderReport(); }
function cfApplyFilter() { renderCF(); }

function getFilteredReportData() {
  const fromVal = document.getElementById('rpt-from')?.value;
  const toVal = document.getElementById('rpt-to')?.value;
  if (!fromVal || !toVal) return REPORT_RAW;

  const periods = REPORT_RAW.map(r => ({ mesic: r.mesic, rok: r.rok }));
  const unique = [...new Map(periods.map(p => [p.mesic + '_' + p.rok, p])).values()];
  const fromIdx = unique.findIndex(p => (p.mesic + '_' + p.rok) === fromVal);
  const toIdx = unique.findIndex(p => (p.mesic + '_' + p.rok) === toVal);
  const validPeriods = unique.slice(Math.min(fromIdx, toIdx), Math.max(fromIdx, toIdx) + 1);
  const validKeys = new Set(validPeriods.map(p => p.mesic + '_' + p.rok));

  return REPORT_RAW.filter(r => validKeys.has(r.mesic + '_' + r.rok));
}

function renderReport() {
  const data = getFilteredReportData();
  if (!data.length) return;

  const periods = [...new Map(data.map(r => [r.mesic + '_' + r.rok, { mesic: r.mesic, rok: r.rok }])).values()];
  const pobocky = ['Záběhlice', 'Vršovice', 'Veleslavín'];

  // KPI strip
  const totalTrzby = data.reduce((s, r) => s + (r.trzby || 0), 0);
  const totalVydaje = data.reduce((s, r) => s + Math.abs(r.vydaje_celkem || 0), 0);
  const totalZisk = data.reduce((s, r) => s + (r.zisk || 0), 0);
  const avgMarze = totalTrzby > 0 ? ((totalZisk / totalTrzby) * 100).toFixed(1) : '0.0';

  document.getElementById('report-kpi-strip').innerHTML = `
    <div class="kpi" style="--kpi-accent:var(--gold)"><div class="kpi-label">Tržby celkem</div><div class="kpi-val sm">${totalTrzby.toLocaleString('cs-CZ')}</div><div class="kpi-footer"><span class="kpi-sub">Kč</span></div></div>
    <div class="kpi" style="--kpi-accent:var(--neg)"><div class="kpi-label">Výdaje celkem</div><div class="kpi-val sm">${totalVydaje.toLocaleString('cs-CZ')}</div><div class="kpi-footer"><span class="kpi-sub">Kč</span></div></div>
    <div class="kpi" style="--kpi-accent:var(--pos)"><div class="kpi-label">Zisk celkem</div><div class="kpi-val sm">${totalZisk.toLocaleString('cs-CZ')}</div><div class="kpi-footer"><span class="kpi-sub">Kč</span></div></div>
    <div class="kpi" style="--kpi-accent:var(--blue)"><div class="kpi-label">Průměrná marže</div><div class="kpi-val sm">${avgMarze}%</div><div class="kpi-footer"><span class="kpi-sub">Zisk / Tržby</span></div></div>`;

  // Period label
  const pl = document.getElementById('rpt-period-label');
  if (pl) pl.textContent = `${periods[0].mesic} ${periods[0].rok} — ${periods[periods.length - 1].mesic} ${periods[periods.length - 1].rok}`;

  // Table
  const thead = document.getElementById('report-thead');
  const tbody = document.getElementById('report-tbody');
  thead.innerHTML = `<tr><th>Ukazatel</th>${periods.map(p => `<th>${esc(p.mesic)} ${p.rok}</th>`).join('')}<th>Celkem</th></tr>`;

  const metrics = [
    { key: 'trzby', label: 'Tržby', cls: '' },
    { key: 'mzdy', label: 'Mzdy', cls: '' },
    { key: 'holicske_potreby', label: 'Holičské potřeby', cls: '' },
    { key: 'vydaje_bez_mezd', label: 'Výdaje bez mezd', cls: '' },
    { key: 'vydaje_celkem', label: 'Výdaje celkem', cls: '' },
    { key: 'zisk', label: 'Zisk', cls: 'report-zisk-row' },
  ];

  let html = '';

  // Per pobočka
  pobocky.forEach(pob => {
    html += `<tr class="report-sec-head"><td colspan="${periods.length + 2}">${esc(pob)}</td></tr>`;
    metrics.forEach(m => {
      html += `<tr class="${m.cls}"><td>${esc(m.label)}</td>`;
      let rowSum = 0;
      periods.forEach(p => {
        const r = data.find(x => x.mesic === p.mesic && x.rok === p.rok && x.pobocka === pob);
        const val = r ? (r[m.key] || 0) : 0;
        rowSum += val;
        const cls = m.key === 'zisk' ? (val >= 0 ? 'r-pos' : 'r-neg') : (val < 0 ? 'r-neg' : '');
        html += `<td class="${cls}">${val !== 0 ? Math.round(val).toLocaleString('cs-CZ') : '—'}</td>`;
      });
      const rCls = m.key === 'zisk' ? (rowSum >= 0 ? 'r-pos' : 'r-neg') : '';
      html += `<td class="${rCls}" style="font-weight:700">${rowSum !== 0 ? Math.round(rowSum).toLocaleString('cs-CZ') : '—'}</td></tr>`;

      // Percentage row for tržby
      if (m.key === 'trzby') {
        html += `<tr class="report-label-pct"><td>% z celku</td>`;
        periods.forEach(p => {
          const r = data.find(x => x.mesic === p.mesic && x.rok === p.rok && x.pobocka === pob);
          const val = r ? (r.trzby || 0) : 0;
          const total = data.filter(x => x.mesic === p.mesic && x.rok === p.rok).reduce((s, x) => s + (x.trzby || 0), 0);
          const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0';
          html += `<td class="r-muted">${pct}%</td>`;
        });
        html += `<td class="r-muted"></td></tr>`;
      }
    });
  });

  // Firma total
  html += `<tr class="report-sec-head"><td colspan="${periods.length + 2}">CELKEM FIRMA</td></tr>`;
  metrics.forEach(m => {
    html += `<tr class="${m.cls} report-total-row"><td>${esc(m.label)}</td>`;
    let rowSum = 0;
    periods.forEach(p => {
      const vals = data.filter(x => x.mesic === p.mesic && x.rok === p.rok);
      const val = vals.reduce((s, x) => s + (x[m.key] || 0), 0);
      rowSum += val;
      const cls = m.key === 'zisk' ? (val >= 0 ? 'r-pos' : 'r-neg') : '';
      html += `<td class="${cls}">${val !== 0 ? Math.round(val).toLocaleString('cs-CZ') : '—'}</td>`;
    });
    const rCls = m.key === 'zisk' ? (rowSum >= 0 ? 'r-pos' : 'r-neg') : '';
    html += `<td class="${rCls}" style="font-weight:700">${rowSum !== 0 ? Math.round(rowSum).toLocaleString('cs-CZ') : '—'}</td></tr>`;
  });

  tbody.innerHTML = html;
}

function reportExportPDF() {
  const periodText = document.getElementById('rpt-period-label')?.textContent || '';
  document.getElementById('rpt-print-period').textContent = periodText;
  setTimeout(() => { window.print(); }, 200);
}

// ═══════════════════════════════════════════════
// CASH FLOW (Tab 7)
// ═══════════════════════════════════════════════
function renderCF() {
  const fromVal = document.getElementById('cf-from')?.value;
  const toVal = document.getElementById('cf-to')?.value;
  let data = REPORT_RAW;

  if (fromVal && toVal) {
    const periods = [...new Map(data.map(r => [r.mesic + '_' + r.rok, { mesic: r.mesic, rok: r.rok }])).values()];
    const fromIdx = periods.findIndex(p => (p.mesic + '_' + p.rok) === fromVal);
    const toIdx = periods.findIndex(p => (p.mesic + '_' + p.rok) === toVal);
    const validPeriods = periods.slice(Math.min(fromIdx, toIdx), Math.max(fromIdx, toIdx) + 1);
    const validKeys = new Set(validPeriods.map(p => p.mesic + '_' + p.rok));
    data = REPORT_RAW.filter(r => validKeys.has(r.mesic + '_' + r.rok));
  }

  if (!data.length) return;

  const periodsList = [...new Map(data.map(r => [r.mesic + '_' + r.rok, { mesic: r.mesic, rok: r.rok }])).values()];
  const pobocky = ['Záběhlice', 'Vršovice', 'Veleslavín'];

  // KPI
  const totalTrzby = data.reduce((s, r) => s + (r.trzby || 0), 0);
  const totalVydaje = data.reduce((s, r) => s + Math.abs(r.vydaje_celkem || 0), 0);
  const totalZisk = data.reduce((s, r) => s + (r.zisk || 0), 0);

  document.getElementById('cf-kpi-trzby').textContent = totalTrzby.toLocaleString('cs-CZ');
  document.getElementById('cf-kpi-vydaje').textContent = totalVydaje.toLocaleString('cs-CZ');
  document.getElementById('cf-kpi-zisk').textContent = totalZisk.toLocaleString('cs-CZ');

  const pl = document.getElementById('cf-period-label');
  if (pl) pl.textContent = `${periodsList[0].mesic} ${periodsList[0].rok} — ${periodsList[periodsList.length - 1].mesic} ${periodsList[periodsList.length - 1].rok}`;

  // Table
  const thead = document.getElementById('cf-thead');
  const tbody = document.getElementById('cf-tbody');

  thead.innerHTML = `<tr><th>Pobočka</th><th>Metrika</th>${periodsList.map(p => `<th>${esc(p.mesic)} ${p.rok}</th>`).join('')}<th>Celkem</th></tr>`;

  let html = '';
  const cfMetrics = [
    { key: 'trzby', label: 'Tržby' },
    { key: 'vydaje_celkem', label: 'Výdaje' },
    { key: 'zisk', label: 'Zisk' },
  ];

  pobocky.forEach(pob => {
    cfMetrics.forEach((m, mi) => {
      html += `<tr${mi === 0 ? ' style="border-top:2px solid var(--border)"' : ''}>`;
      html += mi === 0 ? `<td rowspan="3" style="font-family:'Bebas Neue',sans-serif;font-size:14px;letter-spacing:2px;vertical-align:middle">${esc(pob)}</td>` : '';
      html += `<td style="font-family:Syne,sans-serif;font-size:11px;color:var(--muted2)">${esc(m.label)}</td>`;
      let rowSum = 0;
      periodsList.forEach(p => {
        const r = data.find(x => x.mesic === p.mesic && x.rok === p.rok && x.pobocka === pob);
        const val = r ? (r[m.key] || 0) : 0;
        rowSum += val;
        const cls = m.key === 'zisk' ? (val >= 0 ? 'r-pos' : 'r-neg') : '';
        html += `<td class="${cls}">${val !== 0 ? Math.round(val).toLocaleString('cs-CZ') : '—'}</td>`;
      });
      const rCls = m.key === 'zisk' ? (rowSum >= 0 ? 'r-pos' : 'r-neg') : '';
      html += `<td class="${rCls}" style="font-weight:700">${rowSum !== 0 ? Math.round(rowSum).toLocaleString('cs-CZ') : '—'}</td></tr>`;
    });
  });

  // Firma total
  html += `<tr class="fp-section-head"><td colspan="${periodsList.length + 3}">CELKEM FIRMA</td></tr>`;
  cfMetrics.forEach(m => {
    html += `<tr class="fp-total-row"><td></td><td style="font-family:'Bebas Neue',sans-serif;letter-spacing:1.5px">${esc(m.label)}</td>`;
    let rowSum = 0;
    periodsList.forEach(p => {
      const vals = data.filter(x => x.mesic === p.mesic && x.rok === p.rok);
      const val = vals.reduce((s, x) => s + (x[m.key] || 0), 0);
      rowSum += val;
      const cls = m.key === 'zisk' ? (val >= 0 ? 'r-pos' : 'r-neg') : '';
      html += `<td class="${cls}">${val !== 0 ? Math.round(val).toLocaleString('cs-CZ') : '—'}</td>`;
    });
    const rCls = m.key === 'zisk' ? (rowSum >= 0 ? 'r-pos' : 'r-neg') : '';
    html += `<td class="${rCls}" style="font-weight:700">${rowSum !== 0 ? Math.round(rowSum).toLocaleString('cs-CZ') : '—'}</td></tr>`;
  });

  // Cumulative row
  html += `<tr class="fp-total-row"><td></td><td style="font-family:'Bebas Neue',sans-serif;letter-spacing:1.5px">Kumulativní zisk</td>`;
  let cumul = 0;
  periodsList.forEach(p => {
    const vals = data.filter(x => x.mesic === p.mesic && x.rok === p.rok);
    cumul += vals.reduce((s, x) => s + (x.zisk || 0), 0);
    const cls = cumul >= 0 ? 'r-pos' : 'r-neg';
    html += `<td class="${cls}">${Math.round(cumul).toLocaleString('cs-CZ')}</td>`;
  });
  const cCls = cumul >= 0 ? 'r-pos' : 'r-neg';
  html += `<td class="${cCls}" style="font-weight:700">${Math.round(cumul).toLocaleString('cs-CZ')}</td></tr>`;

  tbody.innerHTML = html;
}

function cfExportPDF() {
  document.body.classList.add('printing-cf');
  const periodText = document.getElementById('cf-period-label')?.textContent || '';
  document.getElementById('cf-print-period').textContent = periodText;
  setTimeout(() => { window.print(); document.body.classList.remove('printing-cf'); }, 200);
}

// ═══════════════════════════════════════════════
// MÁRA (Tab 8)
// ═══════════════════════════════════════════════
function renderMara() {
  if (!MARA_SPLATKY.length) return;

  // Filter
  const rokOd = document.getElementById('mara-rok-od')?.value;
  const mesOd = document.getElementById('mara-mes-od')?.value;
  const rokDo = document.getElementById('mara-rok-do')?.value;
  const mesDo = document.getElementById('mara-mes-do')?.value;

  // Populate selects if empty
  const years = [...new Set(MARA_SPLATKY.map(r => r.rok))].sort();
  const ySel = ['mara-rok-od', 'mara-rok-do'];
  ySel.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.options.length <= 1) {
      el.innerHTML = '<option value="">vše</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
    }
  });
  const mSel = ['mara-mes-od', 'mara-mes-do'];
  const allMonths = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];
  mSel.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.options.length <= 1) {
      el.innerHTML = '<option value="">vše</option>' + allMonths.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
    }
  });

  let filtered = MARA_SPLATKY;
  // Simple filter: just show all for now (complex date filtering can be added)

  const celkem = filtered.reduce((s, r) => s + (r.castka || 0), 0);
  const zaplaceno = filtered.reduce((s, r) => s + (r.zaplaceno || 0), 0);
  const dluh = filtered.length > 0 ? filtered[filtered.length - 1].zbyvajici_dluh || 0 : 0;
  const pct = celkem > 0 ? ((zaplaceno / celkem) * 100).toFixed(1) : '0.0';

  document.getElementById('mara-celkem').textContent = celkem.toLocaleString('cs-CZ') + ' Kč';
  document.getElementById('mara-zaplaceno').textContent = zaplaceno.toLocaleString('cs-CZ') + ' Kč';
  document.getElementById('mara-dluh').textContent = dluh.toLocaleString('cs-CZ') + ' Kč';

  // Progress
  document.getElementById('mara-progress-bar').style.width = pct + '%';
  document.getElementById('mara-pct-label').textContent = pct + ' %';
  document.getElementById('mara-progress-text').textContent = `${zaplaceno.toLocaleString('cs-CZ')} / ${celkem.toLocaleString('cs-CZ')} Kč`;
  document.getElementById('mara-prog-zaplaceno').textContent = `Zaplaceno: ${zaplaceno.toLocaleString('cs-CZ')} Kč`;
  document.getElementById('mara-prog-zbyva').textContent = `Zbývá: ${dluh.toLocaleString('cs-CZ')} Kč`;

  // Splátky table
  let sHtml = '';
  filtered.forEach(r => {
    sHtml += `<tr><td>${r.rok}</td><td style="text-align:left">${esc(r.obdobi || '')}</td>
      <td>${(r.castka || 0).toLocaleString('cs-CZ')} Kč</td>
      <td style="color:var(--pos)">${(r.zaplaceno || 0).toLocaleString('cs-CZ')} Kč</td>
      <td style="color:var(--neg)">${(r.zbyvajici_dluh || 0).toLocaleString('cs-CZ')} Kč</td></tr>`;
  });
  document.getElementById('mara-splatky-tbody').innerHTML = sHtml;
  document.getElementById('mara-splatky-tfoot').innerHTML = `<tr style="font-weight:700;border-top:2px solid var(--border)">
    <td colspan="2" style="text-align:left;font-family:'Bebas Neue',sans-serif;letter-spacing:2px">CELKEM</td>
    <td>${celkem.toLocaleString('cs-CZ')} Kč</td><td style="color:var(--pos)">${zaplaceno.toLocaleString('cs-CZ')} Kč</td><td style="color:var(--neg)">${dluh.toLocaleString('cs-CZ')} Kč</td></tr>`;

  // Výplaty table
  let vHtml = '';
  MARA_VYPLATY.forEach(r => {
    let datStr = r.datum || '';
    if (datStr.includes('-')) { const p = datStr.split('-'); datStr = p[2] + '.' + p[1] + '.' + p[0]; }
    vHtml += `<tr><td style="text-align:left">${esc(datStr)}</td><td>${(r.castka || 0).toLocaleString('cs-CZ')} Kč</td></tr>`;
  });
  document.getElementById('mara-vyplaty-tbody').innerHTML = vHtml;

  // Kontrola
  const vyplatyTotal = MARA_VYPLATY.reduce((s, r) => s + (r.castka || 0), 0);
  const rozdil = zaplaceno - vyplatyTotal;
  document.getElementById('mara-kontrola').innerHTML = `
    <div style="padding:8px 0"><div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border2)">
      <span style="color:var(--muted2)">Součet splátek (zaplaceno)</span>
      <span style="font-family:'JetBrains Mono',monospace">${zaplaceno.toLocaleString('cs-CZ')} Kč</span></div>
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border2)">
      <span style="color:var(--muted2)">Součet výplat</span>
      <span style="font-family:'JetBrains Mono',monospace">${vyplatyTotal.toLocaleString('cs-CZ')} Kč</span></div>
    <div style="display:flex;justify-content:space-between;padding:8px 0">
      <span style="font-weight:700">Rozdíl</span>
      <span style="font-family:'JetBrains Mono',monospace;color:${rozdil === 0 ? 'var(--pos)' : 'var(--neg)'};font-weight:700">${rozdil.toLocaleString('cs-CZ')} Kč ${rozdil === 0 ? '✓' : '!'}</span></div></div>`;
}

function maraReset() {
  ['mara-rok-od', 'mara-mes-od', 'mara-rok-do', 'mara-mes-do'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderMara();
}

// ═══════════════════════════════════════════════
// NEGATIVE PROFIT NOTIFICATION
// ═══════════════════════════════════════════════
function checkAlerts() {
  if (!DATA.firma || !DATA.firma.zisk) return;
  const lastIdx = DATA.firma.zisk.length - 1;
  const lastZisk = DATA.firma.zisk[lastIdx];
  if (lastZisk < 0) {
    toast(`Pozor: Záporný zisk v ${MESICE[lastIdx]}: ${fmt(lastZisk)}`, 'error');
  }
}
