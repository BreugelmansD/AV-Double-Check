// Alle persistente data leeft in localStorage. Geen server, geen AI, geen externe calls.
import { seedMandatoryItems, seedRules } from './seedData.js';

const KEYS = {
  mandatoryItems: 'avdc_mandatory_items',
  rules: 'avdc_rules',
  history: 'avdc_history',
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Kon ${key} niet lezen uit localStorage`, err);
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function initStorage() {
  if (localStorage.getItem(KEYS.mandatoryItems) === null) {
    write(KEYS.mandatoryItems, seedMandatoryItems);
  }
  if (localStorage.getItem(KEYS.rules) === null) {
    write(KEYS.rules, seedRules);
  }
  if (localStorage.getItem(KEYS.history) === null) {
    write(KEYS.history, []);
  }
}

export function getMandatoryItems() {
  return read(KEYS.mandatoryItems, []);
}

export function saveMandatoryItems(items) {
  write(KEYS.mandatoryItems, items);
}

export function getRules() {
  return read(KEYS.rules, []);
}

export function saveRules(rules) {
  write(KEYS.rules, rules);
}

export function getHistory() {
  return read(KEYS.history, []);
}

export function addHistoryEntry(entry) {
  const history = getHistory();
  history.unshift(entry);
  // Houd de geschiedenis beperkt zodat localStorage niet ongelimiteerd groeit.
  write(KEYS.history, history.slice(0, 100));
}

export function clearHistory() {
  write(KEYS.history, []);
}

export function deleteHistoryEntry(id) {
  const history = getHistory().filter((entry) => entry.id !== id);
  write(KEYS.history, history);
}

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
