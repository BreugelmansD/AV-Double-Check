import { isFirebaseConfigured } from './firebaseConfig.js';
import { signIn, signOutUser, watchAuth, AccessDeniedError } from './auth.js';
import {
  fetchAllProducts,
  seedProductsIfEmpty,
  importProducts,
  listenAlwaysRequired,
  addAlwaysRequired,
  updateAlwaysRequired,
  deleteAlwaysRequired,
  listenRules,
  addRule,
  updateRule,
  deleteRule,
  listenHistory,
  addHistoryEntry,
  deleteHistoryEntry,
} from './db.js';
import { runCheck, buildProductIndex, normalize } from './engine.js';
import { extractPdfText } from './pdfText.js';
import { readWorkbookFile, parseWorkbookToProducts } from './productImport.js';
import { seedProducts } from './seedProducts.js';

/* ---------------------------------------------------------------------- */
/* Helpers                                                                  */
/* ---------------------------------------------------------------------- */

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function initials(name) {
  return (name || '?').split(' ').filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

function formatTimestamp(ts) {
  if (!ts) return 'zonet';
  const date = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts.seconds ? ts.seconds * 1000 : ts);
  return date.toLocaleString('nl-BE');
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ---------------------------------------------------------------------- */
/* State                                                                    */
/* ---------------------------------------------------------------------- */

const state = {
  screen: 'loading', // loading | setup | login | app
  loginError: null,
  user: null,
  tab: 'controle',

  products: [],
  productIndex: [],
  alwaysRequired: [],
  rules: [],
  history: [],

  currentReport: null, // { fileName, bonText, report, timestamp, overrides: Set }
  pasteMode: false,
  dragOver: false,
  uploadError: null,
  toast: null,

  addingAlways: false,
  editingAlwaysId: null,
  addingRule: false,
  editingRuleId: null,

  productsTab: {
    category: 'all',
    importing: false,
    importPreview: null,
    importError: null,
  },
};

const app = document.getElementById('app');
const unsubscribers = [];

function formOpen() {
  return state.addingAlways || !!state.editingAlwaysId || state.addingRule || !!state.editingRuleId || state.productsTab.importing;
}

function showToast(msg) {
  state.toast = msg;
  render();
  setTimeout(() => {
    state.toast = null;
    if (!formOpen()) render();
  }, 2600);
}

function myRules() {
  if (!state.user) return [];
  return state.rules.filter((r) => r.scope === 'shared' || r.ownerUid === state.user.uid);
}

/* ---------------------------------------------------------------------- */
/* Product picker (chips + zoek-dropdown), scoped DOM, geen volledige render */
/* ---------------------------------------------------------------------- */

const pickerInstances = new Map();

function mountProductPicker(containerEl, initialItems, options = {}) {
  const max = options.max || Infinity;
  let items = initialItems.map((i) => ({ ...i }));

  const chipsEl = containerEl.querySelector('.picker-chips');
  const input = containerEl.querySelector('.picker-input');
  const results = containerEl.querySelector('.picker-results');

  function itemKey(it) {
    return it.type === 'product' ? `product:${it.code}` : `custom:${it.label.toLowerCase()}`;
  }

  function renderChips() {
    chipsEl.innerHTML = items.length
      ? items.map((it, idx) => `
        <span class="chip picker-chip ${it.type === 'custom' ? 'chip-custom' : ''}">
          ${escapeHtml(it.label)}
          <button type="button" class="chip-remove" data-idx="${idx}" aria-label="Verwijderen">×</button>
        </span>`).join('')
      : '<span class="picker-empty-hint">Nog niets gekozen</span>';
    options.onChange?.(items);
  }

  function addItem(itemRef) {
    if (items.some((i) => itemKey(i) === itemKey(itemRef))) return;
    if (max === 1) items = [itemRef];
    else items.push(itemRef);
    renderChips();
  }

  chipsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip-remove');
    if (!btn) return;
    items.splice(Number(btn.dataset.idx), 1);
    renderChips();
  });

  input.addEventListener('input', () => {
    const q = normalize(input.value);
    if (!q) {
      results.innerHTML = '';
      results.classList.remove('open');
      return;
    }
    const matches = state.productIndex
      .filter((p) => p.normName.includes(q) || p.normCode.includes(q))
      .slice(0, 20);
    const customLabel = input.value.trim();
    results.innerHTML = `
      ${matches
        .map(
          (p) => `
        <div class="picker-result" data-code="${escapeHtml(p.code)}">
          <span class="picker-result-name">${escapeHtml(p.name)}</span>
          <span class="picker-result-code">${escapeHtml(p.code)} · ${escapeHtml(p.category)}</span>
        </div>`
        )
        .join('')}
      ${
        customLabel
          ? `<div class="picker-result picker-result-custom" data-custom="${escapeHtml(customLabel)}">+ Toevoegen als los tekstitem: "${escapeHtml(customLabel)}"</div>`
          : ''
      }
      ${matches.length === 0 && !customLabel ? '<div class="picker-result-empty">Geen resultaten</div>' : ''}
    `;
    results.classList.add('open');
  });

  input.addEventListener('focus', () => {
    if (input.value.trim()) results.classList.add('open');
  });

  results.addEventListener('mousedown', (e) => {
    // mousedown i.p.v. click zodat dit vóór de blur van het inputveld vuurt
    const row = e.target.closest('.picker-result');
    if (!row) return;
    e.preventDefault();
    if (row.dataset.code) {
      const p = state.products.find((x) => x.code === row.dataset.code);
      if (p) addItem({ type: 'product', code: p.code, label: p.name });
    } else if (row.dataset.custom) {
      addItem({ type: 'custom', label: row.dataset.custom });
    }
    input.value = '';
    results.innerHTML = '';
    results.classList.remove('open');
  });

  renderChips();

  const apiObj = { getItems: () => items.slice() };
  pickerInstances.set(containerEl.dataset.pickerKey, apiObj);
  return apiObj;
}

function pickerMountHtml(key, placeholder) {
  return `
    <div class="product-picker" data-picker-key="${key}">
      <div class="picker-chips"></div>
      <input type="text" class="picker-input" placeholder="${escapeHtml(placeholder)}" autocomplete="off" />
      <div class="picker-results"></div>
    </div>
  `;
}

/* ---------------------------------------------------------------------- */
/* Header / shell                                                          */
/* ---------------------------------------------------------------------- */

const TABS = [
  { id: 'controle', label: 'Controle' },
  { id: 'checklist', label: 'Altijd nodig' },
  { id: 'regels', label: 'Regels' },
  { id: 'producten', label: 'Producten' },
  { id: 'geschiedenis', label: 'Geschiedenis' },
];

function renderHeader() {
  const u = state.user;
  return `
    <header class="header">
      <div class="brand">
        <span class="brand-icon">
          <svg width="16" height="16" viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9" stroke="#e2924a" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
        AV Double Check
      </div>
      <nav class="tabs">
        ${TABS.map(
          (t) => `<button class="tab-btn ${state.tab === t.id ? 'active' : ''}" data-action="set-tab" data-tab="${t.id}">${t.label}</button>`
        ).join('')}
      </nav>
      <div class="user-chip">
        ${u?.photoURL ? `<img class="avatar avatar-img" src="${escapeHtml(u.photoURL)}" alt="" />` : `<span class="avatar">${initials(u?.displayName || u?.email || '?')}</span>`}
        <span>${escapeHtml(u?.displayName || u?.email || '')}</span>
        <button class="btn btn-sm" data-action="sign-out">Afmelden</button>
      </div>
    </header>
  `;
}

function completenessValue() {
  if (state.currentReport) return state.currentReport.report.stats.completeness;
  return null;
}

function renderSubheader() {
  const meta = {
    controle: { title: 'Bon controleren', sub: 'Upload een werkbon of magazijnbon (PDF) en check op vergeten materiaal.' },
    checklist: { title: 'Altijd nodig', sub: 'Materiaal dat bij élke job mee moet, los van wat er op de bon staat.' },
    regels: { title: 'Logische regels', sub: 'Als dit én dit op de bon staat, is dit waarschijnlijk ook nodig.' },
    producten: { title: 'Materiaalcatalogus', sub: 'De volledige Blue Moon materiaallijst waarop controles en regels gebaseerd zijn.' },
    geschiedenis: { title: 'Geschiedenis', sub: 'Eerder uitgevoerde controles door jou en je collega\'s.' },
  }[state.tab];

  const completeness = completenessValue();

  return `
    <div class="subheader">
      <div>
        <h1>${meta.title}</h1>
        <p>${meta.sub}</p>
      </div>
      ${
        state.tab === 'controle' && completeness !== null
          ? `<div class="completeness">
              <div class="completeness-label">${completeness}% compleet</div>
              <div class="progress-track"><div class="progress-fill" style="width:${completeness}%"></div></div>
            </div>`
          : ''
      }
    </div>
  `;
}

function renderSidebar() {
  const grouped = {};
  state.alwaysRequired.forEach((item) => {
    const cat = item.category || 'Algemeen';
    if (!grouped[cat]) grouped[cat] = [];
    let status = 'pending';
    if (state.currentReport) {
      const found = state.currentReport.report.always.find((m) => m.id === item.id);
      if (found) status = found.present ? 'ok' : 'missing';
    }
    grouped[cat].push({ label: item.label, status });
  });

  const statusLabel = { ok: 'OK', missing: 'MIST', pending: 'TBD' };

  return `
    <aside class="sidebar">
      <div class="sidebar-group">
        <h3>Altijd nodig</h3>
        ${Object.entries(grouped)
          .map(
            ([cat, items]) => `
            <div style="margin-bottom:14px;">
              <div style="font-size:11.5px;font-weight:700;color:var(--navy-soft);margin-bottom:4px;">${escapeHtml(cat)}</div>
              ${items
                .map(
                  (it) => `
                <div class="sidebar-row">
                  <span>${escapeHtml(it.label)}</span>
                  <span class="status-tag ${it.status}">${statusLabel[it.status]}</span>
                </div>`
                )
                .join('')}
            </div>`
          )
          .join('') || '<p class="empty-state">Nog geen items. Voeg ze toe via "Altijd nodig".</p>'}
      </div>
    </aside>
  `;
}

function renderSummaryPanel() {
  if (state.tab === 'controle') {
    const r = state.currentReport?.report;
    return `
      <aside class="summary-panel">
        <h3>Samenvatting</h3>
        ${
          r
            ? `
          <div class="summary-block">
            <div class="summary-stat"><span>Gevonden op bon</span><strong>${r.stats.foundProductsCount}</strong></div>
            <div class="summary-stat"><span>Altijd nodig OK</span><strong>${r.stats.alwaysPresent}/${r.stats.alwaysTotal}</strong></div>
            <div class="summary-stat"><span>Regels getriggerd</span><strong>${r.stats.rulesTriggered}</strong></div>
            <div class="summary-stat"><span>Regels met gaten</span><strong>${r.stats.rulesWithGaps}</strong></div>
          </div>
          <div class="summary-block">
            <label>Bestand</label>
            <div style="font-size:13px;">${escapeHtml(state.currentReport.fileName)}</div>
          </div>
          <button class="btn" data-action="recheck" style="width:100%;margin-bottom:8px;">Opnieuw controleren</button>
          <button class="btn btn-primary" data-action="new-check" style="width:100%;">Nieuwe controle</button>
        `
            : '<p class="empty-state">Upload een bon om een samenvatting te zien.</p>'
        }
      </aside>
    `;
  }
  if (state.tab === 'checklist') {
    return `
      <aside class="summary-panel">
        <h3>Samenvatting</h3>
        <div class="summary-stat"><span>Aantal items</span><strong>${state.alwaysRequired.length}</strong></div>
        <p style="font-size:12.5px;color:var(--text-muted);margin-top:14px;">Deze items worden bij élke controle gevlagd als ze niet gevonden worden op de bon.</p>
      </aside>
    `;
  }
  if (state.tab === 'regels') {
    return `
      <aside class="summary-panel">
        <h3>Samenvatting</h3>
        <div class="summary-stat"><span>Gedeelde regels</span><strong>${state.rules.filter((r) => r.scope === 'shared').length}</strong></div>
        <div class="summary-stat"><span>Mijn privé-regels</span><strong>${state.rules.filter((r) => r.scope === 'private' && r.ownerUid === state.user?.uid).length}</strong></div>
        <p style="font-size:12.5px;color:var(--text-muted);margin-top:14px;">Voorbeeld: staan er <em>2 speakers</em> én een <em>mixer</em> op de bon, verwacht dan ook <em>speakerstatieven</em>.</p>
      </aside>
    `;
  }
  if (state.tab === 'producten') {
    return `
      <aside class="summary-panel">
        <h3>Samenvatting</h3>
        <div class="summary-stat"><span>Aantal producten</span><strong>${state.products.length}</strong></div>
        <p style="font-size:12.5px;color:var(--text-muted);margin-top:14px;">Deze lijst komt uit de Blue Moon materiaalexport en wordt gebruikt om bonnen automatisch te herkennen.</p>
      </aside>
    `;
  }
  return `
    <aside class="summary-panel">
      <h3>Samenvatting</h3>
      <div class="summary-stat"><span>Aantal controles</span><strong>${state.history.length}</strong></div>
    </aside>
  `;
}

/* ---------------------------------------------------------------------- */
/* Controle tab                                                            */
/* ---------------------------------------------------------------------- */

function renderControleTab() {
  if (!state.currentReport) {
    return `
      <div class="main">
        ${state.uploadError ? `<div class="error-box">${escapeHtml(state.uploadError)}</div>` : ''}
        <div class="dropzone ${state.dragOver ? 'dragover' : ''}" data-action="dropzone-click">
          <p><strong>Sleep een PDF hierheen</strong> of klik om te bladeren</p>
          <p>Werkbon of magazijnbon met selecteerbare tekst (.pdf)</p>
          <input type="file" id="file-input" accept="application/pdf" style="display:none;" />
        </div>
        <div class="divider-text">of</div>
        ${
          state.pasteMode
            ? `
          <form data-action="submit-paste">
            <div class="field">
              <label>Plak de tekst van de bon manueel</label>
              <textarea name="bonText" rows="8" placeholder="Plak hier de inhoud van de bon..."></textarea>
            </div>
            <button type="submit" class="btn btn-primary">Controleer tekst</button>
          </form>`
            : `<button class="btn" data-action="toggle-paste" style="width:100%;">Tekst manueel plakken</button>`
        }
      </div>
    `;
  }

  const r = state.currentReport.report;

  return `
    <div class="main">
      <div class="section-title"><h2>Gevonden materiaal op de bon (${r.foundProducts.length})</h2></div>
      <details class="card">
        <summary style="cursor:pointer;font-size:13px;color:var(--text-muted);">${r.foundProducts.length === 0 ? 'Geen producten uit de catalogus herkend — controleer of de PDF selecteerbare tekst bevat.' : 'Toon lijst'}</summary>
        ${r.foundProducts.map((p) => `<div class="chip">${escapeHtml(p.name)} <span style="color:var(--text-muted)">(${escapeHtml(p.code)})</span></div>`).join('')}
      </details>

      <div class="section-title">
        <h2>Altijd nodig</h2>
      </div>
      <div class="card">
        ${r.always
          .map(
            (m) => `
          <div class="item-row ${m.present ? 'ok' : 'missing'}">
            <span class="item-dot"></span>
            <span class="item-label">${escapeHtml(m.label)} <span style="color:var(--text-muted);font-weight:400;">(${escapeHtml(m.category)})</span></span>
            <span class="item-status">${m.present ? 'AANWEZIG' : 'VERGETEN'}</span>
            ${!m.present ? `<button class="btn btn-sm" data-action="toggle-override" data-key="${escapeHtml(m.itemKey)}">Toch aanwezig</button>` : ''}
          </div>`
          )
          .join('') || '<p class="empty-state">Geen items ingesteld onder "Altijd nodig".</p>'}
      </div>

      <div class="section-title">
        <h2>Logische regels (EN-condities)</h2>
      </div>
      ${
        r.rules.filter((rule) => rule.triggered).length === 0
          ? '<div class="card"><p class="empty-state">Geen regels getriggerd op basis van deze bon.</p></div>'
          : r.rules
              .filter((rule) => rule.triggered)
              .map(
                (rule) => `
          <div class="card">
            <div class="card-header">
              <span class="badge-num">${rule.missingCount === 0 ? '✓' : rule.missingCount}</span>
              <span class="card-title">${rule.triggerLabels.map(escapeHtml).join(' + ')} gevonden op de bon</span>
              <span class="scope-badge ${rule.scope}">${rule.scope === 'shared' ? 'gedeeld' : 'privé · ' + escapeHtml(rule.ownerName || '')}</span>
            </div>
            <p class="card-sub">Verwacht bijhorend materiaal:</p>
            ${rule.requires
              .map(
                (s) => `
              <div class="item-row ${s.present ? 'ok' : 'missing'}" style="margin-left:34px;">
                <span class="item-dot"></span>
                <span class="item-label">${escapeHtml(s.label)}</span>
                <span class="item-status">${s.present ? 'AANWEZIG' : 'VERGETEN'}</span>
                ${!s.present ? `<button class="btn btn-sm" data-action="toggle-override" data-key="${escapeHtml(s.itemKey)}">Toch aanwezig</button>` : ''}
              </div>`
              )
              .join('')}
          </div>`
              )
              .join('')
      }

      <details style="margin-top:20px;">
        <summary style="cursor:pointer;color:var(--text-muted);font-size:12.5px;">Geëxtraheerde tekst tonen</summary>
        <div class="card" style="white-space:pre-wrap;font-size:12px;color:var(--text-muted);max-height:220px;overflow:auto;">${escapeHtml(state.currentReport.bonText)}</div>
      </details>
    </div>
  `;
}

function rerunCurrentCheck() {
  if (!state.currentReport) return;
  const report = runCheck(state.currentReport.bonText, state.products, state.alwaysRequired, myRules(), state.currentReport.overrides);
  state.currentReport = { ...state.currentReport, report };
}

function renderRecheckBanner() {
  if (!state.currentReport) return '';
  return `
    <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
      <span style="font-size:13px;color:var(--text-muted);">Actieve controle: <strong>${escapeHtml(state.currentReport.fileName)}</strong> — wijzigingen hierboven worden automatisch verrekend zodra ze opgeslagen zijn; klik hieronder om het manueel te forceren.</span>
      <button class="btn btn-primary btn-sm" data-action="recheck">Opnieuw controleren</button>
    </div>
  `;
}

/* ---------------------------------------------------------------------- */
/* Altijd nodig tab                                                        */
/* ---------------------------------------------------------------------- */

function renderChecklistTab() {
  return `
    <div class="main">
      ${renderRecheckBanner()}
      <div class="section-title">
        <h2>Altijd nodig (${state.alwaysRequired.length})</h2>
        <button class="btn btn-primary btn-sm" data-action="add-always-open">+ Item toevoegen</button>
      </div>

      ${state.addingAlways ? renderAlwaysForm(null) : ''}

      ${
        state.alwaysRequired.length === 0
          ? '<p class="empty-state">Nog geen vaste items. Voeg er een toe, bv. "EHBO-kit" of "Gaffer tape".</p>'
          : state.alwaysRequired
              .map((item) =>
                state.editingAlwaysId === item.id
                  ? renderAlwaysForm(item)
                  : `
            <div class="list-item">
              <div class="list-item-main">
                <div class="list-item-title">${escapeHtml(item.label)}</div>
                <div class="list-item-meta">Categorie: ${escapeHtml(item.category || 'Algemeen')} · toegevoegd door ${escapeHtml(item.addedBy || '?')}</div>
              </div>
              <div class="list-item-actions">
                <button class="btn btn-sm" data-action="edit-always-open" data-id="${item.id}">Bewerken</button>
                <button class="btn btn-sm btn-danger" data-action="delete-always" data-id="${item.id}">Verwijderen</button>
              </div>
            </div>`
              )
              .join('')
      }
    </div>
  `;
}

function renderAlwaysForm(item) {
  const isEdit = !!item;
  const initial = item ? [item.type === 'product' ? { type: 'product', code: item.code, label: item.label } : { type: 'custom', label: item.label }] : [];
  return `
    <form class="card" data-action="submit-always" data-id="${isEdit ? item.id : ''}">
      <div class="field">
        <label>Materiaal (zoek in de catalogus of voeg los tekstitem toe)</label>
        ${pickerMountHtml('always-picker', 'bv. EHBO-kit, gaffer tape, of zoek een product...')}
      </div>
      <div class="field">
        <label>Categorie</label>
        <input type="text" name="category" value="${escapeHtml(item?.category || '')}" placeholder="bv. Veiligheid, Werkmateriaal..." />
      </div>
      <div style="display:flex;gap:8px;">
        <button type="submit" class="btn btn-primary">${isEdit ? 'Opslaan' : 'Toevoegen'}</button>
        <button type="button" class="btn" data-action="cancel-always-form">Annuleren</button>
      </div>
      <input type="hidden" data-picker-init='${escapeHtml(JSON.stringify(initial))}' />
    </form>
  `;
}

/* ---------------------------------------------------------------------- */
/* Regels tab                                                              */
/* ---------------------------------------------------------------------- */

function renderRegelsTab() {
  const visibleRules = myRules();
  return `
    <div class="main">
      ${renderRecheckBanner()}
      <div class="section-title">
        <h2>Logische regels (${visibleRules.length})</h2>
        <button class="btn btn-primary btn-sm" data-action="add-rule-open">+ Regel toevoegen</button>
      </div>

      ${state.addingRule ? renderRuleForm(null) : ''}

      ${
        visibleRules.length === 0
          ? '<p class="empty-state">Nog geen regels. Voeg er een toe, bv. "2x speaker" + "mixer" → "speakerstatieven".</p>'
          : visibleRules
              .map((rule) =>
                state.editingRuleId === rule.id
                  ? renderRuleForm(rule)
                  : `
            <div class="list-item">
              <div class="list-item-main">
                <div class="list-item-title">
                  Als dit allemaal op de bon staat...
                  <span class="scope-badge ${rule.scope}">${rule.scope === 'shared' ? 'gedeeld' : 'privé'}</span>
                </div>
                <div class="rule-flow">
                  ${rule.triggers.map((t) => `<span class="rule-trigger-chip">${escapeHtml(t.label)}</span>`).join('<span class="rule-and">EN</span>')}
                  <span class="rule-arrow">→ verwacht ook</span>
                  ${rule.requires.map((s) => `<span class="rule-sugg-chip">${escapeHtml(s.label)}</span>`).join('')}
                </div>
                <div class="list-item-meta" style="margin-top:6px;">door ${escapeHtml(rule.ownerName || '?')}</div>
              </div>
              ${
                rule.ownerUid === state.user?.uid
                  ? `<div class="list-item-actions">
                      <button class="btn btn-sm" data-action="edit-rule-open" data-id="${rule.id}">Bewerken</button>
                      <button class="btn btn-sm btn-danger" data-action="delete-rule" data-id="${rule.id}">Verwijderen</button>
                    </div>`
                  : ''
              }
            </div>`
              )
              .join('')
      }
    </div>
  `;
}

function renderRuleForm(rule) {
  const isEdit = !!rule;
  const initialTriggers = rule?.triggers || [];
  const initialRequires = rule?.requires || [];
  return `
    <form class="card" data-action="submit-rule" data-id="${isEdit ? rule.id : ''}">
      <div class="field">
        <label>ALS ik dit allemaal bij heb (EN — alles moet op de bon staan)</label>
        ${pickerMountHtml('rule-triggers', 'Zoek een product of typ een los tekstitem...')}
      </div>
      <div class="field">
        <label>...MOET ik dit ook bij hebben</label>
        ${pickerMountHtml('rule-requires', 'Zoek een product of typ een los tekstitem...')}
      </div>
      <div class="field">
        <label>Zichtbaarheid</label>
        <select name="scope">
          <option value="shared" ${rule?.scope === 'shared' || !rule ? 'selected' : ''}>Gedeeld — telt mee voor iedereen bij Blue Moon</option>
          <option value="private" ${rule?.scope === 'private' ? 'selected' : ''}>Privé — telt enkel mee bij mijn eigen controles</option>
        </select>
      </div>
      <div style="display:flex;gap:8px;">
        <button type="submit" class="btn btn-primary">${isEdit ? 'Opslaan' : 'Toevoegen'}</button>
        <button type="button" class="btn" data-action="cancel-rule-form">Annuleren</button>
      </div>
      <input type="hidden" data-picker-triggers-init='${escapeHtml(JSON.stringify(initialTriggers))}' />
      <input type="hidden" data-picker-requires-init='${escapeHtml(JSON.stringify(initialRequires))}' />
    </form>
  `;
}

/* ---------------------------------------------------------------------- */
/* Producten tab                                                           */
/* ---------------------------------------------------------------------- */

function productMatches(query, category) {
  const q = normalize(query);
  return state.products.filter((p) => {
    if (category !== 'all' && p.category !== category) return false;
    if (!q) return true;
    return normalize(p.name).includes(q) || normalize(p.code).includes(q);
  });
}

function renderProductRows(list) {
  const capped = list.slice(0, 150);
  return `
    <div class="product-table">
      ${capped
        .map(
          (p) => `
        <div class="product-row">
          <span class="product-row-code">${escapeHtml(p.code)}</span>
          <span class="product-row-name">${escapeHtml(p.name)}</span>
          <span class="product-row-cat">${escapeHtml(p.category)}</span>
        </div>`
        )
        .join('') || '<p class="empty-state">Geen producten gevonden.</p>'}
      ${list.length > capped.length ? `<p class="empty-state">... en ${list.length - capped.length} andere. Verfijn je zoekopdracht.</p>` : ''}
    </div>
  `;
}

function renderProductenTab() {
  const categories = [...new Set(state.products.map((p) => p.category))].sort();
  const pt = state.productsTab;

  return `
    <div class="main">
      <div class="card">
        <div class="section-title" style="margin-bottom:10px;">
          <h2 style="font-size:14px;">Catalogus vernieuwen</h2>
          ${!pt.importing ? `<button class="btn btn-sm" data-action="import-open">Excel/CSV importeren</button>` : ''}
        </div>
        ${
          pt.importing
            ? `
          <div class="dropzone" data-action="import-dropzone-click">
            <p><strong>Sleep een Excel-bestand hierheen</strong> of klik om te bladeren</p>
            <p>Zelfde formaat als de originele materiaallijst (sheets "products" + "productgroups")</p>
            <input type="file" id="import-file-input" accept=".xlsx,.xls,.csv" style="display:none;" />
          </div>
          ${pt.importError ? `<div class="error-box">${escapeHtml(pt.importError)}</div>` : ''}
          ${
            pt.importPreview
              ? `
            <div class="card" style="background:var(--gray-bg);">
              <p style="margin:0 0 10px;font-size:13.5px;">${pt.importPreview.length} producten gevonden in het bestand. Dit vervangt/overschrijft de bestaande catalogus (items die niet in dit bestand staan blijven bewaard).</p>
              <div style="display:flex;gap:8px;">
                <button class="btn btn-primary btn-sm" data-action="import-confirm">Bevestig import</button>
                <button class="btn btn-sm" data-action="import-cancel">Annuleren</button>
              </div>
            </div>`
              : `<button class="btn btn-sm" data-action="import-cancel" style="margin-top:10px;">Annuleren</button>`
          }
        `
            : '<p style="font-size:12.5px;color:var(--text-muted);margin:0;">Update de volledige lijst wanneer het magazijn nieuw materiaal krijgt, zonder de app opnieuw te moeten bouwen.</p>'
        }
      </div>

      <div class="section-title">
        <h2>Producten (${state.products.length})</h2>
      </div>
      <div class="field" style="display:flex;gap:10px;">
        <input type="text" id="products-search-input" placeholder="Zoek op naam of alfacode..." style="flex:1;" />
        <select id="products-category-select">
          <option value="all" ${pt.category === 'all' ? 'selected' : ''}>Alle categorieën</option>
          ${categories.map((c) => `<option value="${escapeHtml(c)}" ${pt.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
        </select>
      </div>
      <div id="products-list">${renderProductRows(productMatches('', pt.category))}</div>
    </div>
  `;
}

/* ---------------------------------------------------------------------- */
/* Geschiedenis tab                                                        */
/* ---------------------------------------------------------------------- */

function renderGeschiedenisTab() {
  return `
    <div class="main">
      <div class="section-title">
        <h2>Eerdere controles (${state.history.length})</h2>
      </div>
      ${
        state.history.length === 0
          ? '<p class="empty-state">Nog geen controles uitgevoerd.</p>'
          : state.history
              .map(
                (h) => `
          <div class="history-row">
            <div class="history-row-main">
              <span class="history-filename">${escapeHtml(h.fileName)}</span>
              <span class="history-meta">${formatTimestamp(h.timestamp)} · door ${escapeHtml(h.userName || '?')} · ${h.stats?.alwaysPresent ?? 0}/${h.stats?.alwaysTotal ?? 0} altijd-nodig · ${h.stats?.rulesWithGaps ?? 0} regel(s) met gaten</span>
            </div>
            <div style="display:flex;align-items:center;gap:14px;">
              <span class="history-score" style="color:${(h.stats?.completeness ?? 0) >= 90 ? 'var(--green)' : (h.stats?.completeness ?? 0) >= 60 ? 'var(--orange)' : 'var(--red)'}">${h.stats?.completeness ?? 0}%</span>
              ${h.uid === state.user?.uid ? `<button class="btn btn-sm btn-danger" data-action="delete-history" data-id="${h.id}">Verwijderen</button>` : ''}
            </div>
          </div>`
              )
              .join('')
      }
    </div>
  `;
}

/* ---------------------------------------------------------------------- */
/* Login / setup schermen                                                  */
/* ---------------------------------------------------------------------- */

function renderSetupScreen() {
  app.innerHTML = `
    <div class="gate-screen">
      <div class="gate-card">
        <h1>AV Double Check — nog niet geconfigureerd</h1>
        <p>Deze app heeft een gratis Firebase-project nodig om data te delen tussen collega's bij Blue Moon.</p>
        <p>Vul <code>src/firebaseConfig.js</code> in met je eigen projectgegevens. Zie <code>SETUP.md</code> in de repo voor de volledige stap-voor-stap instructies.</p>
        <button class="btn btn-primary" data-action="reload">Herladen</button>
      </div>
    </div>
  `;
  app.querySelector('[data-action="reload"]').addEventListener('click', () => window.location.reload());
}

function renderLoginScreen() {
  app.innerHTML = `
    <div class="gate-screen">
      <div class="gate-card">
        <h1>AV Double Check</h1>
        <p>Log in met je Blue Moon Google-account om bonnen te controleren en regels te beheren.</p>
        ${state.loginError ? `<div class="error-box">${escapeHtml(state.loginError)}</div>` : ''}
        <button class="btn btn-primary" data-action="sign-in">Inloggen met Google</button>
      </div>
    </div>
  `;
  app.querySelector('[data-action="sign-in"]').addEventListener('click', async () => {
    state.loginError = null;
    try {
      await signIn();
    } catch (err) {
      state.loginError = err instanceof AccessDeniedError ? err.message : 'Inloggen mislukt. Probeer opnieuw.';
      renderLoginScreen();
    }
  });
}

function renderLoadingScreen() {
  app.innerHTML = `<div class="gate-screen"><div class="gate-card"><p>Laden...</p></div></div>`;
}

/* ---------------------------------------------------------------------- */
/* Root render                                                             */
/* ---------------------------------------------------------------------- */

function renderTabMain() {
  switch (state.tab) {
    case 'controle':
      return renderControleTab();
    case 'checklist':
      return renderChecklistTab();
    case 'regels':
      return renderRegelsTab();
    case 'producten':
      return renderProductenTab();
    case 'geschiedenis':
      return renderGeschiedenisTab();
    default:
      return '';
  }
}

function render() {
  if (state.screen === 'loading') return renderLoadingScreen();
  if (state.screen === 'setup') return renderSetupScreen();
  if (state.screen === 'login') return renderLoginScreen();

  app.innerHTML = `
    ${renderHeader()}
    ${renderSubheader()}
    <div class="layout">
      ${renderSidebar()}
      ${renderTabMain()}
      ${renderSummaryPanel()}
    </div>
    ${state.toast ? `<div class="toast">${escapeHtml(state.toast)}</div>` : ''}
  `;
  attachDynamicListeners();
}

function attachDynamicListeners() {
  const fileInput = document.getElementById('file-input');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleFile(file);
    });
  }
  const dropzone = document.querySelector('.dropzone[data-action="dropzone-click"]');
  if (dropzone) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!state.dragOver) {
        state.dragOver = true;
        render();
      }
    });
    dropzone.addEventListener('dragleave', () => {
      state.dragOver = false;
      render();
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      state.dragOver = false;
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    });
  }

  const importFileInput = document.getElementById('import-file-input');
  if (importFileInput) {
    importFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleImportFile(file);
    });
  }
  const importDropzone = document.querySelector('[data-action="import-dropzone-click"]');
  if (importDropzone) {
    importDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleImportFile(file);
    });
    importDropzone.addEventListener('dragover', (e) => e.preventDefault());
  }

  // Product picker mounten in open formulieren
  const alwaysPicker = document.querySelector('[data-picker-key="always-picker"]');
  if (alwaysPicker) {
    const initEl = alwaysPicker.closest('form').querySelector('[data-picker-init]');
    const initial = JSON.parse(initEl.dataset.pickerInit || '[]');
    mountProductPicker(alwaysPicker, initial, { max: 1 });
  }
  const triggersPicker = document.querySelector('[data-picker-key="rule-triggers"]');
  const requiresPicker = document.querySelector('[data-picker-key="rule-requires"]');
  if (triggersPicker && requiresPicker) {
    const form = triggersPicker.closest('form');
    const initTriggers = JSON.parse(form.querySelector('[data-picker-triggers-init]').dataset.pickerTriggersInit || '[]');
    const initRequires = JSON.parse(form.querySelector('[data-picker-requires-init]').dataset.pickerRequiresInit || '[]');
    mountProductPicker(triggersPicker, initTriggers);
    mountProductPicker(requiresPicker, initRequires);
  }

  // Producten-zoekbalk: scoped update, geen volledige render (behoudt focus tijdens typen)
  const searchInput = document.getElementById('products-search-input');
  const categorySelect = document.getElementById('products-category-select');
  const productsList = document.getElementById('products-list');
  if (searchInput && productsList) {
    searchInput.addEventListener('input', () => {
      productsList.innerHTML = renderProductRows(productMatches(searchInput.value, categorySelect.value));
    });
  }
  if (categorySelect) {
    categorySelect.addEventListener('change', () => {
      state.productsTab.category = categorySelect.value;
      productsList.innerHTML = renderProductRows(productMatches(searchInput?.value || '', categorySelect.value));
    });
  }
}

/* ---------------------------------------------------------------------- */
/* Data laden (Firestore realtime + eenmalige catalogus-fetch)             */
/* ---------------------------------------------------------------------- */

async function loadAppData() {
  try {
    await seedProductsIfEmpty(seedProducts);
  } catch (err) {
    console.error('Kon catalogus niet seeden', err);
  }
  try {
    state.products = await fetchAllProducts();
  } catch (err) {
    console.error('Kon producten niet laden', err);
    state.products = seedProducts;
  }
  state.productIndex = buildProductIndex(state.products);

  unsubscribers.push(
    listenAlwaysRequired((items) => {
      state.alwaysRequired = items;
      rerunCurrentCheck();
      if (!formOpen()) render();
    })
  );
  unsubscribers.push(
    listenRules((items) => {
      state.rules = items;
      rerunCurrentCheck();
      if (!formOpen()) render();
    })
  );
  unsubscribers.push(
    listenHistory((items) => {
      state.history = items;
      if (!formOpen()) render();
    })
  );

  state.screen = 'app';
  render();
}

/* ---------------------------------------------------------------------- */
/* Acties                                                                   */
/* ---------------------------------------------------------------------- */

async function handleFile(file) {
  if (file.type !== 'application/pdf') {
    state.uploadError = 'Enkel PDF-bestanden worden ondersteund.';
    render();
    return;
  }
  state.uploadError = null;
  try {
    const text = await extractPdfText(file);
    runAndStoreCheck(file.name, text);
  } catch (err) {
    state.uploadError = err.message;
    render();
  }
}

function runAndStoreCheck(fileName, bonText) {
  const overrides = new Set();
  const report = runCheck(bonText, state.products, state.alwaysRequired, myRules(), overrides);
  const timestamp = Date.now();
  state.currentReport = { fileName, bonText, report, timestamp, overrides };
  addHistoryEntry({ fileName, stats: report.stats }, state.user).catch((err) => console.error('history opslaan mislukt', err));
  render();
}

async function handleImportFile(file) {
  state.productsTab.importError = null;
  try {
    const wb = await readWorkbookFile(file);
    const products = parseWorkbookToProducts(wb);
    if (products.length === 0) throw new Error('Geen producten gevonden in dit bestand. Controleer het formaat.');
    state.productsTab.importPreview = products;
  } catch (err) {
    state.productsTab.importError = err.message;
    state.productsTab.importPreview = null;
  }
  render();
}

function resetAlwaysForms() {
  state.addingAlways = false;
  state.editingAlwaysId = null;
}

function resetRuleForms() {
  state.addingRule = false;
  state.editingRuleId = null;
}

app.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const { action, id, tab, key } = target.dataset;

  switch (action) {
    case 'set-tab':
      state.tab = tab;
      state.uploadError = null;
      resetAlwaysForms();
      resetRuleForms();
      render();
      break;

    case 'sign-out':
      signOutUser();
      break;

    case 'dropzone-click':
      document.getElementById('file-input').click();
      break;

    case 'toggle-paste':
      state.pasteMode = true;
      render();
      break;

    case 'new-check':
      state.currentReport = null;
      state.pasteMode = false;
      state.uploadError = null;
      render();
      break;

    case 'toggle-override': {
      if (!state.currentReport) break;
      const set = state.currentReport.overrides;
      if (set.has(key)) set.delete(key); else set.add(key);
      rerunCurrentCheck();
      render();
      break;
    }

    case 'add-always-open':
      resetAlwaysForms();
      state.addingAlways = true;
      render();
      break;

    case 'edit-always-open':
      resetAlwaysForms();
      state.editingAlwaysId = id;
      render();
      break;

    case 'cancel-always-form':
      resetAlwaysForms();
      render();
      break;

    case 'delete-always':
      deleteAlwaysRequired(id).then(() => showToast('Item verwijderd.'));
      break;

    case 'add-rule-open':
      resetRuleForms();
      state.addingRule = true;
      render();
      break;

    case 'edit-rule-open':
      resetRuleForms();
      state.editingRuleId = id;
      render();
      break;

    case 'cancel-rule-form':
      resetRuleForms();
      render();
      break;

    case 'delete-rule':
      deleteRule(id).then(() => showToast('Regel verwijderd.'));
      break;

    case 'recheck':
      rerunCurrentCheck();
      showToast('Controle opnieuw uitgevoerd.');
      break;

    case 'delete-history':
      deleteHistoryEntry(id);
      break;

    case 'import-open':
      state.productsTab.importing = true;
      state.productsTab.importPreview = null;
      state.productsTab.importError = null;
      render();
      break;

    case 'import-dropzone-click':
      document.getElementById('import-file-input').click();
      break;

    case 'import-cancel':
      state.productsTab.importing = false;
      state.productsTab.importPreview = null;
      state.productsTab.importError = null;
      render();
      break;

    case 'import-confirm': {
      const products = state.productsTab.importPreview;
      if (!products) break;
      importProducts(products)
        .then(async () => {
          state.products = await fetchAllProducts();
          state.productIndex = buildProductIndex(state.products);
          state.productsTab.importing = false;
          state.productsTab.importPreview = null;
          rerunCurrentCheck();
          showToast(`Catalogus bijgewerkt (${products.length} producten).`);
        })
        .catch((err) => {
          state.productsTab.importError = `Import mislukt: ${err.message}`;
          render();
        });
      break;
    }

    default:
      break;
  }
});

app.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-action]');
  if (!form) return;
  e.preventDefault();
  const { action, id } = form.dataset;
  const data = new FormData(form);

  if (action === 'submit-paste') {
    const bonText = data.get('bonText')?.trim();
    if (!bonText) return;
    runAndStoreCheck('Manueel geplakte tekst', bonText);
    state.pasteMode = false;
    return;
  }

  if (action === 'submit-always') {
    const picked = pickerInstances.get('always-picker')?.getItems() || [];
    if (picked.length === 0) {
      showToast('Kies of typ eerst een materiaal.');
      return;
    }
    const chosen = picked[0];
    const category = data.get('category').trim() || 'Algemeen';
    const item = chosen.type === 'product'
      ? { type: 'product', code: chosen.code, label: chosen.label, category }
      : { type: 'custom', label: chosen.label, category };
    const promise = id ? updateAlwaysRequired(id, item) : addAlwaysRequired(item, state.user);
    promise.then(() => showToast('Opgeslagen.'));
    resetAlwaysForms();
    render();
    return;
  }

  if (action === 'submit-rule') {
    const triggers = pickerInstances.get('rule-triggers')?.getItems() || [];
    const requires = pickerInstances.get('rule-requires')?.getItems() || [];
    if (triggers.length === 0 || requires.length === 0) {
      showToast('Vul zowel de "ALS"- als de "MOET ik ook"-lijst in.');
      return;
    }
    const scope = data.get('scope');
    const rule = { triggers, requires, scope };
    const promise = id ? updateRule(id, rule) : addRule(rule, state.user);
    promise.then(() => showToast('Regel opgeslagen.'));
    resetRuleForms();
    render();
    return;
  }
});

/* ---------------------------------------------------------------------- */
/* Bootstrap                                                               */
/* ---------------------------------------------------------------------- */

function renderFatalError(message) {
  app.innerHTML = `
    <div class="gate-screen">
      <div class="gate-card">
        <h1>Er ging iets mis</h1>
        <p>${escapeHtml(message)}</p>
        <button class="btn btn-primary" data-action="reload">Herladen</button>
      </div>
    </div>
  `;
  app.querySelector('[data-action="reload"]').addEventListener('click', () => window.location.reload());
}

async function bootstrap() {
  if (!isFirebaseConfigured()) {
    state.screen = 'setup';
    render();
    return;
  }

  render(); // loading

  try {
    const unsub = await watchAuth(async (user) => {
      if (!user) {
        state.user = null;
        state.screen = 'login';
        render();
        return;
      }
      state.user = user;
      if (state.screen !== 'app') {
        try {
          await loadAppData();
        } catch (err) {
          console.error('Kon app-data niet laden', err);
          renderFatalError('Kon geen verbinding maken met de gedeelde database. Controleer je internetverbinding en probeer opnieuw.');
        }
      }
    });
    unsubscribers.push(unsub);
  } catch (err) {
    console.error('Firebase-initialisatie mislukt', err);
    renderFatalError('Kon Firebase niet initialiseren. Controleer de gegevens in src/firebaseConfig.js en je internetverbinding.');
  }
}

bootstrap();
