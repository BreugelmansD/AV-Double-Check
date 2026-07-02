// Zuiver op regels gebaseerde tekstherkenning. Geen AI/LLM: enkel normalisatie
// en substring-matching van trefwoorden tegen de geëxtraheerde bon-tekst.

export function normalize(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(new RegExp('[̀-ͯ]', 'g'), '') // diacritics (é -> e, ë -> e, ...)
    .replace(/[^a-z0-9\s/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Zoekt of één van de trefwoorden van een item als woord(deel) voorkomt in de genormaliseerde tekst.
function matchKeywords(normalizedText, keywords) {
  for (const raw of keywords) {
    const kw = normalize(raw);
    if (kw && normalizedText.includes(kw)) {
      return kw;
    }
  }
  return null;
}

/**
 * Voert de volledige controle uit van een bon-tekst tegen de verplichte items
 * en de logische afhankelijkheidsregels.
 *
 * @param {string} bonText - ruwe, geëxtraheerde tekst van de bon
 * @param {Array} mandatoryItems - [{id, label, keywords, category}]
 * @param {Array} rules - [{id, trigger:{label,keywords}, suggestions:[{label,keywords}]}]
 */
export function runCheck(bonText, mandatoryItems, rules) {
  const normalizedBon = normalize(bonText);

  const mandatory = mandatoryItems.map((item) => {
    const matched = matchKeywords(normalizedBon, item.keywords);
    return {
      id: item.id,
      label: item.label,
      category: item.category || 'Algemeen',
      present: !!matched,
      matchedKeyword: matched,
    };
  });

  const ruleResults = rules.map((rule) => {
    const triggerMatch = matchKeywords(normalizedBon, rule.trigger.keywords);
    const triggered = !!triggerMatch;
    const suggestions = rule.suggestions.map((s) => {
      const suggMatch = triggered ? matchKeywords(normalizedBon, s.keywords) : null;
      return {
        label: s.label,
        present: !!suggMatch,
      };
    });
    return {
      id: rule.id,
      triggerLabel: rule.trigger.label,
      triggered,
      triggerMatchedKeyword: triggerMatch,
      suggestions,
      missingCount: triggered ? suggestions.filter((s) => !s.present).length : 0,
    };
  });

  const missingMandatory = mandatory.filter((m) => !m.present);
  const triggeredRules = ruleResults.filter((r) => r.triggered);
  const rulesWithGaps = triggeredRules.filter((r) => r.missingCount > 0);

  const stats = {
    mandatoryTotal: mandatory.length,
    mandatoryPresent: mandatory.length - missingMandatory.length,
    mandatoryMissing: missingMandatory.length,
    rulesTriggered: triggeredRules.length,
    rulesWithGaps: rulesWithGaps.length,
  };

  const totalChecks = stats.mandatoryTotal + triggeredRules.reduce((sum, r) => sum + r.suggestions.length, 0);
  const totalOk = stats.mandatoryPresent + triggeredRules.reduce(
    (sum, r) => sum + r.suggestions.filter((s) => s.present).length,
    0
  );
  stats.completeness = totalChecks === 0 ? 100 : Math.round((totalOk / totalChecks) * 100);

  return { mandatory, rules: ruleResults, stats };
}
