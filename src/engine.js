// Zuiver op regels gebaseerde tekstherkenning. Geen AI/LLM: enkel normalisatie,
// substring/token-matching tegen de geëxtraheerde bon-tekst en de echte
// productcatalogus (alfacodes + productnamen uit de Blue Moon materiaallijst).

const NOISE_WORDS = new Set([
  'set', 'x', 'met', 'en', 'no', 'with', 'the', 'a', 'an', 'of', 'voor', 'op',
  'in', 'incl', 'only', 'for', 'without', 'zonder', 'per',
]);

export function normalize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritics (é -> e, ë -> e, ...)
    .replace(/[^a-z0-9\s/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function significantWords(normalizedName) {
  return [...new Set(
    normalizedName
      .split(' ')
      .filter((w) => !NOISE_WORDS.has(w) && !/^\d+$/.test(w) && (w.length >= 4 || /\d/.test(w)))
  )];
}

/**
 * Bouwt een doorzoekbare index van de productcatalogus. Wordt één keer per
 * controle/opzoeking berekend.
 */
export function buildProductIndex(products) {
  return products.map((p) => {
    const normCode = normalize(p.code);
    const normName = normalize(p.name);
    return {
      code: p.code,
      name: p.name,
      category: p.category,
      group: p.group,
      normCode,
      normName,
      words: significantWords(normName),
    };
  });
}

/**
 * Zoekt of een productcode als apart "woord" voorkomt in de tekst (voorkomt
 * dat een korte code toevallig binnenin een ander woord matcht).
 */
function codeAppearsInText(normCode, tokenSet, normalizedText) {
  if (!normCode) return false;
  if (tokenSet.has(normCode)) return true;
  // langere codes (>=6 tekens) mogen ook als substring binnen een groter token matchen
  // (bv. code gevolgd door leestekens die de normalisatie niet volledig wegneemt)
  if (normCode.length >= 6 && normalizedText.includes(normCode)) return true;
  return false;
}

/**
 * Een productnaam matcht enkel als ÁLLE onderscheidende woorden ervan op de bon
 * staan (niet zomaar de meeste) — anders zou bv. "Speaker L-Acoustics X8" ook
 * meetellen zodra er een andere "Speaker L-Acoustics ..." op de bon staat. Voor
 * dit soort dubbele-controle-tool is een gemiste match (op te lossen met "toch
 * aanwezig") veel veiliger dan een foute match die verborgen blijft.
 */
function nameAppearsInText(entry, tokenSet, normalizedText) {
  if (!entry.normName) return false;
  if (normalizedText.includes(entry.normName)) return true;
  if (entry.words.length < 2) return false;
  return entry.words.every((w) => tokenSet.has(w) || normalizedText.includes(w));
}

/**
 * Bepaalt welke producten uit de catalogus effectief op de bon terug te vinden zijn.
 * @returns {Set<string>} set van productcodes die gevonden zijn
 */
export function findProductsInText(bonText, productIndex) {
  const normalizedText = normalize(bonText);
  const tokenSet = new Set(normalizedText.split(' '));
  const found = new Set();
  for (const entry of productIndex) {
    if (codeAppearsInText(entry.normCode, tokenSet, normalizedText) || nameAppearsInText(entry, tokenSet, normalizedText)) {
      found.add(entry.code);
    }
  }
  return found;
}

/**
 * Test of een los tekst-item (custom, niet uit de catalogus) op de bon voorkomt,
 * via trefwoord/substring-matching op de genormaliseerde labeltekst.
 */
function customLabelAppearsInText(label, normalizedText) {
  const norm = normalize(label);
  if (!norm) return false;
  return normalizedText.includes(norm);
}

/**
 * Evalueert of een item-referentie (product uit catalogus of vrije tekst)
 * aanwezig is, rekening houdend met manuele overrides ("toch aanwezig").
 */
function isItemPresent(itemRef, foundCodes, normalizedText, overrides) {
  const key = itemKey(itemRef);
  if (overrides && overrides.has(key)) return true;
  if (itemRef.type === 'product') return foundCodes.has(itemRef.code);
  return customLabelAppearsInText(itemRef.label, normalizedText);
}

export function itemKey(itemRef) {
  return itemRef.type === 'product' ? `product:${itemRef.code}` : `custom:${normalize(itemRef.label)}`;
}

/**
 * Zoekt de meest actuele weergavenaam voor een item (catalogus kan gewijzigd
 * zijn sinds de regel/checklist werd aangemaakt).
 */
function resolveLabel(itemRef, productsByCode) {
  if (itemRef.type === 'product') {
    const live = productsByCode.get(itemRef.code);
    return live ? live.name : `${itemRef.label} (niet meer in catalogus)`;
  }
  return itemRef.label;
}

/**
 * Voert de volledige controle uit van een bon-tekst tegen:
 *  - de "altijd nodig"-lijst
 *  - de logische EN-regels (elke trigger moet aanwezig zijn opdat de regel afgaat)
 *
 * @param {string} bonText
 * @param {Array} products - volledige productcatalogus [{code,name,category,group}]
 * @param {Array} alwaysRequired - [{id, type:'product'|'custom', code?, label, category}]
 * @param {Array} rules - [{id, scope, ownerName, triggers:[itemRef], requires:[itemRef]}]
 * @param {Set<string>} overrides - itemKey()'s die manueel als "aanwezig" gemarkeerd zijn
 */
export function runCheck(bonText, products, alwaysRequired, rules, overrides = new Set()) {
  const normalizedText = normalize(bonText);
  const productIndex = buildProductIndex(products);
  const productsByCode = new Map(products.map((p) => [p.code, p]));
  const foundCodes = findProductsInText(bonText, productIndex);

  const present = (itemRef) => isItemPresent(itemRef, foundCodes, normalizedText, overrides);

  const alwaysResults = alwaysRequired.map((item) => {
    const itemRef = item.type === 'product' ? { type: 'product', code: item.code, label: item.label } : { type: 'custom', label: item.label };
    return {
      id: item.id,
      label: resolveLabel(itemRef, productsByCode),
      category: item.category || 'Algemeen',
      itemKey: itemKey(itemRef),
      present: present(itemRef),
    };
  });

  const ruleResults = rules.map((rule) => {
    const triggered = rule.triggers.length > 0 && rule.triggers.every((t) => present(t));
    const requires = rule.requires.map((r) => ({
      label: resolveLabel(r, productsByCode),
      itemKey: itemKey(r),
      present: triggered ? present(r) : false,
    }));
    return {
      id: rule.id,
      scope: rule.scope,
      ownerName: rule.ownerName,
      triggerLabels: rule.triggers.map((t) => resolveLabel(t, productsByCode)),
      triggered,
      requires,
      missingCount: triggered ? requires.filter((r) => !r.present).length : 0,
    };
  });

  const foundProducts = products
    .filter((p) => foundCodes.has(p.code))
    .sort((a, b) => a.name.localeCompare(b.name));

  const missingAlways = alwaysResults.filter((m) => !m.present);
  const triggeredRules = ruleResults.filter((r) => r.triggered);
  const rulesWithGaps = triggeredRules.filter((r) => r.missingCount > 0);

  const stats = {
    foundProductsCount: foundProducts.length,
    alwaysTotal: alwaysResults.length,
    alwaysPresent: alwaysResults.length - missingAlways.length,
    alwaysMissing: missingAlways.length,
    rulesTriggered: triggeredRules.length,
    rulesWithGaps: rulesWithGaps.length,
  };

  const totalChecks = stats.alwaysTotal + triggeredRules.reduce((sum, r) => sum + r.requires.length, 0);
  const totalOk = stats.alwaysPresent + triggeredRules.reduce(
    (sum, r) => sum + r.requires.filter((x) => x.present).length,
    0
  );
  stats.completeness = totalChecks === 0 ? 100 : Math.round((totalOk / totalChecks) * 100);

  return { foundProducts, always: alwaysResults, rules: ruleResults, stats };
}
