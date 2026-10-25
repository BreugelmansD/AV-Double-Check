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
      normGroup: normalize(p.groupCode || ''),
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
 * Op een echte Blue Moon-bon staat de alfacode als "GROEP SUFFIX" (met spatie,
 * bv. "AUACC USBPRO"), terwijl de catalogus "AUACCUSBPRO" heeft. Zoekt alle
 * zulke codes in de tekst op.
 * @returns {string[]} genormaliseerde codes zoals in de catalogus (zonder spatie)
 */
function extractBonCodes(tokens, groupCodes) {
  const codes = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (groupCodes.has(tokens[i]) && /^[a-z0-9]/.test(tokens[i + 1])) {
      // het aantal staat op een Blue Moon-bon rechts van de code
      const qty = /^\d+$/.test(tokens[i + 2] || '') ? Number(tokens[i + 2]) : 1;
      codes.push({ code: tokens[i] + tokens[i + 1], qty });
    }
  }
  return codes;
}

const MIN_BON_CODES_FOR_STRUCTURED = 3;

/**
 * Bepaalt welke producten uit de catalogus effectief op de bon terug te vinden zijn.
 *
 * Bevat de tekst minstens een paar bon-codes ("GROEP SUFFIX"), dan is het een
 * gestructureerde bon en tellen ENKEL die exacte codes: namen zoeken in een
 * lange tekst geeft anders veel valse treffers (bv. elke kabel waarvan de
 * woorden "cable", "32a", "5m" ergens op de bon voorkomen). Plak je gewone
 * tekst zonder codes, dan valt de app terug op herkenning via de productnaam.
 *
 * @returns {{found: Set<string>, quantities: Map<string, number>|null, mode: 'codes'|'text', unmatchedCodes: string[]}}
 * `quantities` = totaal aantal per productcode op de bon (enkel bij een gestructureerde bon).
 */
export function findProductsInText(bonText, productIndex) {
  const normalizedText = normalize(bonText);
  const tokens = normalizedText.split(' ');
  const tokenSet = new Set(tokens);
  const groupCodes = new Set(productIndex.map((e) => e.normGroup).filter(Boolean));
  const bonCodes = extractBonCodes(tokens, groupCodes);
  const found = new Set();

  if (bonCodes.length >= MIN_BON_CODES_FOR_STRUCTURED) {
    const byCode = new Map(productIndex.map((e) => [e.normCode, e.code]));
    const quantities = new Map();
    const unmatched = new Set();
    for (const { code, qty } of bonCodes) {
      if (byCode.has(code)) {
        const real = byCode.get(code);
        found.add(real);
        quantities.set(real, (quantities.get(real) || 0) + qty);
      } else {
        unmatched.add(code.toUpperCase());
      }
    }
    return { found, quantities, mode: 'codes', unmatchedCodes: [...unmatched] };
  }

  for (const entry of productIndex) {
    if (codeAppearsInText(entry.normCode, tokenSet, normalizedText) || nameAppearsInText(entry, tokenSet, normalizedText)) {
      found.add(entry.code);
    }
  }
  return { found, quantities: null, mode: 'text', unmatchedCodes: [] };
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
function neededQty(itemRef) {
  return Math.max(1, Number(itemRef.qty) || 1);
}

/**
 * Hoeveel er van een item op de bon staat (null = onbekend, bv. bij gewone
 * geplakte tekst of bij een los tekstitem: dan kunnen we geen aantal controleren).
 */
function qtyOnBon(itemRef, foundCodes, quantities) {
  if (itemRef.type !== 'product' || !quantities) return null;
  return foundCodes.has(itemRef.code) ? quantities.get(itemRef.code) ?? 1 : 0;
}

/**
 * Evalueert of een item-referentie (product uit catalogus of vrije tekst)
 * aanwezig is, rekening houdend met het gevraagde aantal en manuele
 * overrides ("toch aanwezig").
 */
function isItemPresent(itemRef, foundCodes, normalizedText, overrides, quantities) {
  const key = itemKey(itemRef);
  if (overrides && overrides.has(key)) return true;
  if (itemRef.type === 'product') {
    if (!foundCodes.has(itemRef.code)) return false;
    const have = qtyOnBon(itemRef, foundCodes, quantities);
    return have === null || have >= neededQty(itemRef);
  }
  return customLabelAppearsInText(itemRef.label, normalizedText);
}

/** Uitleg bij een tekort, bv. "1 op bon, 2 nodig". Leeg als er geen aantalprobleem is. */
function shortfallDetail(itemRef, foundCodes, quantities) {
  const have = qtyOnBon(itemRef, foundCodes, quantities);
  if (have === null || have >= neededQty(itemRef)) return '';
  return `${have} op bon, ${neededQty(itemRef)} nodig`;
}

export function itemKey(itemRef) {
  return itemRef.type === 'product' ? `product:${itemRef.code}` : `custom:${normalize(itemRef.label)}`;
}

/**
 * Zoekt de meest actuele weergavenaam voor een item (catalogus kan gewijzigd
 * zijn sinds de regel/checklist werd aangemaakt).
 */
function resolveLabel(itemRef, productsByCode) {
  const base = (() => {
    if (itemRef.type === 'product') {
      const live = productsByCode.get(itemRef.code);
      return live ? live.name : `${itemRef.label} (niet meer in catalogus)`;
    }
    return itemRef.label;
  })();
  return itemRef.type === 'product' && neededQty(itemRef) > 1 ? `${neededQty(itemRef)}× ${base}` : base;
}

/**
 * Een "altijd nodig"-item is ofwel één los item (oud schema, nog steeds
 * ondersteund) ofwel een OR-groep van alternatieven (nieuw: `items: [itemRef]`)
 * — bv. "Schuko-adapter OF krachtstroomkabel": één van beide aanwezig volstaat.
 */
function alwaysEntryItems(entry) {
  if (Array.isArray(entry.items) && entry.items.length > 0) {
    return entry.items.map((it) => (it.type === 'product' ? { type: 'product', code: it.code, label: it.label, qty: it.qty } : { type: 'custom', label: it.label }));
  }
  return [entry.type === 'product' ? { type: 'product', code: entry.code, label: entry.label, qty: entry.qty } : { type: 'custom', label: entry.label }];
}

function groupKey(itemRefs) {
  return `group:${itemRefs.map(itemKey).join('|')}`;
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
  const { found: foundCodes, quantities, mode, unmatchedCodes } = findProductsInText(bonText, productIndex);

  const present = (itemRef) => isItemPresent(itemRef, foundCodes, normalizedText, overrides, quantities);
  const detailFor = (refs) => refs.map((r) => shortfallDetail(r, foundCodes, quantities)).filter(Boolean).join('; ');

  const alwaysResults = alwaysRequired.map((item) => {
    const alternatives = alwaysEntryItems(item);
    const key = groupKey(alternatives);
    const isPresent = (overrides && overrides.has(key)) || alternatives.some((ref) => present(ref));
    return {
      id: item.id,
      label: alternatives.map((ref) => resolveLabel(ref, productsByCode)).join(' OF '),
      category: item.category || 'Algemeen',
      itemKey: key,
      present: isPresent,
      detail: isPresent ? '' : detailFor(alternatives),
    };
  });

  const ruleResults = rules.map((rule) => {
    const triggered = rule.triggers.length > 0 && rule.triggers.every((t) => present(t));
    const requires = rule.requires.map((r) => ({
      label: resolveLabel(r, productsByCode),
      itemKey: itemKey(r),
      present: triggered ? present(r) : false,
      detail: triggered && !present(r) ? detailFor([r]) : '',
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
    .map((p) => ({ ...p, onBon: quantities ? quantities.get(p.code) ?? 1 : null }))
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

  return { foundProducts, always: alwaysResults, rules: ruleResults, stats, mode, unmatchedCodes };
}
