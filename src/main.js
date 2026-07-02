import {
  initStorage,
  getMandatoryItems,
  saveMandatoryItems,
  getRules,
  saveRules,
  getHistory,
  addHistoryEntry,
  deleteHistoryEntry,
  uid,
} from './storage.js';
import { runCheck } from './engine.js';
import { extractPdfText } from './pdfText.js';

initStorage();

const state = {
  tab: 'controle',
  mandatoryItems: getMandatoryItems(),
  rules: getRules(),
  history: getHistory(),
  currentReport: null, // { fileName, bonText, report, timestamp }
  pasteMode: false,
  dragOver: false,
  uploadError: null,
  editingMandatoryId: null,
  addingMandatory: false,
  editingRuleId: null,
  addingRule: false,
  toast: null,
};

const app = document.getElementById('app');

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function showToast(msg) {
  state.toast = msg;
  render();
  setTimeout(() => {
    state.toast = null;
    render();
  }, 2600);
}

function initials(name) {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

/* ---------------------------------------------------------------------- */
/* Header + shell                                                          */
/* ---------------------------------------------------------------------- */

const TABS = [
  { id: 'controle', label: 'Controle' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'regels', label: 'Regels' },
  { id: 'geschiedenis', label: 'Geschiedenis' },
];

function renderHeader() {
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
        <span class="avatar">${initials('Dimi Breugelmans')}</span>
        Dimi Breugelmans
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
    controle: {
      title: 'Bon controleren',
      sub: 'Upload een werkbon of magazijnbon (PDF) en check op vergeten materiaal.',
    },
    checklist: {
      title: 'Checklist met verplichte items',
      sub: 'Items die altijd gevlagd worden als ze niet op de bon staan.',
    },
    regels: {
      title: 'Logische regels',
      sub: 'Als dit op de bon staat, is dit waarschijnlijk ook nodig.',
    },
    geschiedenis: {
      title: 'Geschiedenis',
      sub: 'Eerder uitgevoerde controles.',
    },
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
  state.mandatoryItems.forEach((item) => {
    const cat = item.category || 'Algemeen';
    if (!grouped[cat]) grouped[cat] = [];
    let status = 'pending';
    if (state.currentReport) {
      const found = state.currentReport.report.mandatory.find((m) => m.id === item.id);
      if (found) status = found.present ? 'ok' : 'missing';
    }
    grouped[cat].push({ label: item.label, status });
  });

  const statusLabel = { ok: 'OK', missing: 'MIST', pending: 'TBD' };

  return `
    <aside class="sidebar">
      <div class="sidebar-group">
        <h3>Checklist overzicht</h3>
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
          .join('') || '<p class="empty-state">Nog geen items. Voeg ze toe via de Checklist-tab.</p>'}
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
            <div class="summary-stat"><span>Verplichte items OK</span><strong>${r.stats.mandatoryPresent}/${r.stats.mandatoryTotal}</strong></div>
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
        <div class="summary-stat"><span>Aantal verplichte items</span><strong>${state.mandatoryItems.length}</strong></div>
        <p style="font-size:12.5px;color:var(--text-muted);margin-top:14px;">Deze items worden bij élke controle gevlagd als ze niet gevonden worden op de bon.</p>
      </aside>
    `;
  }
  if (state.tab === 'regels') {
    return `
      <aside class="summary-panel">
        <h3>Samenvatting</h3>
        <div class="summary-stat"><span>Aantal regels</span><strong>${state.rules.length}</strong></div>
        <p style="font-size:12.5px;color:var(--text-muted);margin-top:14px;">Voorbeeld: staat er een <em>speaker</em> op de bon, verwacht dan ook een <em>statief</em>.</p>
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
      <div class="section-title">
        <h2>Verplichte items</h2>
      </div>
      <div class="card">
        ${r.mandatory
          .map(
            (m) => `
          <div class="item-row ${m.present ? 'ok' : 'missing'}">
            <span class="item-dot"></span>
            <span class="item-label">${escapeHtml(m.label)} <span style="color:var(--text-muted);font-weight:400;">(${escapeHtml(m.category)})</span></span>
            <span class="item-status">${m.present ? 'AANWEZIG' : 'VERGETEN'}</span>
          </div>`
          )
          .join('') || '<p class="empty-state">Geen verplichte items ingesteld.</p>'}
      </div>

      <div class="section-title">
        <h2>Logische controle (afhankelijkheden)</h2>
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
              <span class="card-title">${escapeHtml(rule.triggerLabel)} gevonden op de bon</span>
            </div>
            <p class="card-sub">Verwacht bijhorend materiaal:</p>
            ${rule.suggestions
              .map(
                (s) => `
              <div class="item-row ${s.present ? 'ok' : 'missing'}" style="margin-left:34px;">
                <span class="item-dot"></span>
                <span class="item-label">${escapeHtml(s.label)}</span>
                <span class="item-status">${s.present ? 'AANWEZIG' : 'VERGETEN'}</span>
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

/* ---------------------------------------------------------------------- */
/* Herberekenen zonder herupload                                           */
/* ---------------------------------------------------------------------- */

function rerunCurrentCheck() {
  if (!state.currentReport) return;
  const report = runCheck(state.currentReport.bonText, state.mandatoryItems, state.rules);
  state.currentReport = { ...state.currentReport, report };
}

function renderRecheckBanner() {
  if (!state.currentReport) return '';
  return `
    <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
      <span style="font-size:13px;color:var(--text-muted);">Actieve controle: <strong>${escapeHtml(state.currentReport.fileName)}</strong> — wijzigingen hierboven worden automatisch verrekend.</span>
      <button class="btn btn-primary btn-sm" data-action="recheck">Opnieuw controleren</button>
    </div>
  `;
}

/* ---------------------------------------------------------------------- */
/* Checklist tab (verplichte items CRUD)                                   */
/* ---------------------------------------------------------------------- */

function renderChecklistTab() {
  return `
    <div class="main">
      ${renderRecheckBanner()}
      <div class="section-title">
        <h2>Verplichte items (${state.mandatoryItems.length})</h2>
        <button class="btn btn-primary btn-sm" data-action="add-mandatory-open">+ Item toevoegen</button>
      </div>

      ${state.addingMandatory ? renderMandatoryForm(null) : ''}

      ${
        state.mandatoryItems.length === 0
          ? '<p class="empty-state">Nog geen verplichte items. Voeg er een toe.</p>'
          : state.mandatoryItems
              .map((item) =>
                state.editingMandatoryId === item.id
                  ? renderMandatoryForm(item)
                  : `
            <div class="list-item">
              <div class="list-item-main">
                <div class="list-item-title">${escapeHtml(item.label)}</div>
                <div class="list-item-meta">Categorie: ${escapeHtml(item.category || 'Algemeen')}</div>
                <div style="margin-top:6px;">${item.keywords.map((k) => `<span class="chip">${escapeHtml(k)}</span>`).join('')}</div>
              </div>
              <div class="list-item-actions">
                <button class="btn btn-sm" data-action="edit-mandatory-open" data-id="${item.id}">Bewerken</button>
                <button class="btn btn-sm btn-danger" data-action="delete-mandatory" data-id="${item.id}">Verwijderen</button>
              </div>
            </div>`
              )
              .join('')
      }
    </div>
  `;
}

function renderMandatoryForm(item) {
  const isEdit = !!item;
  return `
    <form class="card" data-action="submit-mandatory" data-id="${isEdit ? item.id : ''}">
      <div class="field">
        <label>Naam van het item</label>
        <input type="text" name="label" value="${escapeHtml(item?.label || '')}" placeholder="bv. EHBO-kit" required />
      </div>
      <div class="field">
        <label>Categorie</label>
        <input type="text" name="category" value="${escapeHtml(item?.category || '')}" placeholder="bv. Veiligheid" />
      </div>
      <div class="field">
        <label>Trefwoorden om op te scannen (komma-gescheiden, incl. synoniemen)</label>
        <input type="text" name="keywords" value="${escapeHtml((item?.keywords || []).join(', '))}" placeholder="bv. ehbo, first aid, verbandtrommel" required />
      </div>
      <div style="display:flex;gap:8px;">
        <button type="submit" class="btn btn-primary">${isEdit ? 'Opslaan' : 'Toevoegen'}</button>
        <button type="button" class="btn" data-action="cancel-mandatory-form">Annuleren</button>
      </div>
    </form>
  `;
}

/* ---------------------------------------------------------------------- */
/* Regels tab (dependency rules CRUD)                                      */
/* ---------------------------------------------------------------------- */

function renderRegelsTab() {
  return `
    <div class="main">
      ${renderRecheckBanner()}
      <div class="section-title">
        <h2>Logische regels (${state.rules.length})</h2>
        <button class="btn btn-primary btn-sm" data-action="add-rule-open">+ Regel toevoegen</button>
      </div>

      ${state.addingRule ? renderRuleForm(null) : ''}

      ${
        state.rules.length === 0
          ? '<p class="empty-state">Nog geen regels. Voeg er een toe, bv. "speaker" → "statief".</p>'
          : state.rules
              .map((rule) =>
                state.editingRuleId === rule.id
                  ? renderRuleForm(rule)
                  : `
            <div class="list-item">
              <div class="list-item-main">
                <div class="list-item-title">Als "${escapeHtml(rule.trigger.label)}" op de bon staat...</div>
                <div class="rule-flow">
                  <span class="rule-trigger-chip">${escapeHtml(rule.trigger.label)}</span>
                  <span class="rule-arrow">→ verwacht ook</span>
                  ${rule.suggestions.map((s) => `<span class="rule-sugg-chip">${escapeHtml(s.label)}</span>`).join('')}
                </div>
              </div>
              <div class="list-item-actions">
                <button class="btn btn-sm" data-action="edit-rule-open" data-id="${rule.id}">Bewerken</button>
                <button class="btn btn-sm btn-danger" data-action="delete-rule" data-id="${rule.id}">Verwijderen</button>
              </div>
            </div>`
              )
              .join('')
      }
    </div>
  `;
}

function renderRuleForm(rule) {
  const isEdit = !!rule;
  const suggestionsText = (rule?.suggestions || [])
    .map((s) => `${s.label} :: ${s.keywords.join(', ')}`)
    .join('\n');
  return `
    <form class="card" data-action="submit-rule" data-id="${isEdit ? rule.id : ''}">
      <div class="field">
        <label>Trigger-item (naam)</label>
        <input type="text" name="triggerLabel" value="${escapeHtml(rule?.trigger.label || '')}" placeholder="bv. Speaker / luidspreker" required />
      </div>
      <div class="field">
        <label>Trefwoorden voor de trigger (komma-gescheiden)</label>
        <input type="text" name="triggerKeywords" value="${escapeHtml((rule?.trigger.keywords || []).join(', '))}" placeholder="bv. speaker, luidspreker, pa-kast" required />
      </div>
      <div class="field">
        <label>Verwachte items (één per lijn, formaat: naam :: trefwoord1, trefwoord2)</label>
        <textarea name="suggestions" rows="4" placeholder="Speakerstatief :: statief, standaard&#10;Speakerkabel :: speakerkabel, speakon" required>${escapeHtml(suggestionsText)}</textarea>
      </div>
      <div style="display:flex;gap:8px;">
        <button type="submit" class="btn btn-primary">${isEdit ? 'Opslaan' : 'Toevoegen'}</button>
        <button type="button" class="btn" data-action="cancel-rule-form">Annuleren</button>
      </div>
    </form>
  `;
}

/* ---------------------------------------------------------------------- */
/* Geschiedenis tab                                                         */
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
          <div class="history-row" data-action="open-history" data-id="${h.id}">
            <div class="history-row-main">
              <span class="history-filename">${escapeHtml(h.fileName)}</span>
              <span class="history-meta">${new Date(h.timestamp).toLocaleString('nl-BE')} · ${h.stats.mandatoryPresent}/${h.stats.mandatoryTotal} verplichte items · ${h.stats.rulesWithGaps} regel(s) met gaten</span>
            </div>
            <div style="display:flex;align-items:center;gap:14px;">
              <span class="history-score" style="color:${h.stats.completeness >= 90 ? 'var(--green)' : h.stats.completeness >= 60 ? 'var(--orange)' : 'var(--red)'}">${h.stats.completeness}%</span>
              <button class="btn btn-sm btn-danger" data-action="delete-history" data-id="${h.id}">Verwijderen</button>
            </div>
          </div>`
              )
              .join('')
      }
    </div>
  `;
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
    case 'geschiedenis':
      return renderGeschiedenisTab();
    default:
      return '';
  }
}

function render() {
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
  const dropzone = document.querySelector('.dropzone');
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
}

/* ---------------------------------------------------------------------- */
/* Actions                                                                  */
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
  const report = runCheck(bonText, state.mandatoryItems, state.rules);
  const timestamp = Date.now();
  state.currentReport = { fileName, bonText, report, timestamp };
  addHistoryEntry({ id: uid(), fileName, timestamp, stats: report.stats });
  state.history = getHistory();
  render();
}

function resetMandatoryForms() {
  state.addingMandatory = false;
  state.editingMandatoryId = null;
}

function resetRuleForms() {
  state.addingRule = false;
  state.editingRuleId = null;
}

app.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const { action, id, tab } = target.dataset;

  switch (action) {
    case 'set-tab':
      state.tab = tab;
      state.uploadError = null;
      resetMandatoryForms();
      resetRuleForms();
      render();
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

    case 'add-mandatory-open':
      resetMandatoryForms();
      state.addingMandatory = true;
      render();
      break;

    case 'edit-mandatory-open':
      resetMandatoryForms();
      state.editingMandatoryId = id;
      render();
      break;

    case 'cancel-mandatory-form':
      resetMandatoryForms();
      render();
      break;

    case 'delete-mandatory':
      state.mandatoryItems = state.mandatoryItems.filter((m) => m.id !== id);
      saveMandatoryItems(state.mandatoryItems);
      rerunCurrentCheck();
      showToast('Item verwijderd.');
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
      state.rules = state.rules.filter((r) => r.id !== id);
      saveRules(state.rules);
      rerunCurrentCheck();
      showToast('Regel verwijderd.');
      break;

    case 'recheck':
      rerunCurrentCheck();
      showToast('Controle opnieuw uitgevoerd.');
      break;

    case 'delete-history':
      deleteHistoryEntry(id);
      state.history = getHistory();
      render();
      break;

    case 'open-history': {
      const entry = state.history.find((h) => h.id === id);
      if (entry) showToast(`${entry.fileName}: ${entry.stats.completeness}% compleet op ${new Date(entry.timestamp).toLocaleDateString('nl-BE')}`);
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

  if (action === 'submit-mandatory') {
    const label = data.get('label').trim();
    const category = data.get('category').trim() || 'Algemeen';
    const keywords = data
      .get('keywords')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    if (id) {
      state.mandatoryItems = state.mandatoryItems.map((m) =>
        m.id === id ? { ...m, label, category, keywords } : m
      );
    } else {
      state.mandatoryItems.push({ id: uid(), label, category, keywords });
    }
    saveMandatoryItems(state.mandatoryItems);
    resetMandatoryForms();
    rerunCurrentCheck();
    showToast('Checklist opgeslagen.');
    return;
  }

  if (action === 'submit-rule') {
    const triggerLabel = data.get('triggerLabel').trim();
    const triggerKeywords = data
      .get('triggerKeywords')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    const suggestions = data
      .get('suggestions')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, kwPart] = line.split('::');
        return {
          label: (label || '').trim(),
          keywords: (kwPart || '')
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean),
        };
      })
      .filter((s) => s.label && s.keywords.length);

    const rule = { id: id || uid(), trigger: { label: triggerLabel, keywords: triggerKeywords }, suggestions };
    if (id) {
      state.rules = state.rules.map((r) => (r.id === id ? rule : r));
    } else {
      state.rules.push(rule);
    }
    saveRules(state.rules);
    resetRuleForms();
    rerunCurrentCheck();
    showToast('Regel opgeslagen.');
    return;
  }
});

render();
