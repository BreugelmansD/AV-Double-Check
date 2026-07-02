# AV Double Check

Een lichtgewicht webapp om werkbonnen en magazijnbonnen te controleren op vergeten
materiaal — **zonder AI**. Alle controles gebeuren via eenvoudige, transparante
tekstherkenning (trefwoorden zoeken in de bon-tekst) en door jou gedefinieerde regels.

## Wat doet de app?

1. **Controle** — upload een PDF van een werkbon/magazijnbon (of plak de tekst
   manueel) en de app zoekt automatisch:
   - of alle **verplichte items** uit je checklist op de bon staan;
   - of er, op basis van **logische regels**, materiaal ontbreekt dat normaal bij
     iets anders hoort (bv. staat er een *speaker* op de bon, dan wordt gecheckt
     of er ook een *statief* bij staat).
2. **Checklist** — beheer de lijst met verplichte items. Elk item heeft een naam,
   een categorie en trefwoorden/synoniemen waarop gescand wordt. Ontbreekt een
   item op de bon, dan wordt het altijd gevlagd.
3. **Regels** — beheer "als dit, dan waarschijnlijk ook dat"-regels. Volledig
   uitbreidbaar: voeg zelf triggers en verwachte materialen toe.
4. **Geschiedenis** — overzicht van eerder uitgevoerde controles.

## Waarom geen AI?

De controle-logica is 100% deterministisch: tekst wordt genormaliseerd
(kleine letters, geen accenten) en er wordt gezocht naar trefwoorden. Geen LLM,
geen externe AI-API, geen onvoorspelbaarheid — wat je instelt, is exact wat er
gecontroleerd wordt.

De enige externe bibliotheek is [pdf.js](https://mozilla.github.io/pdf.js/)
(via CDN), gebruikt om platte tekst uit een PDF te lezen. Dat is klassieke
PDF-parsing, geen AI.

## Gebruiken

Geen installatie, geen build-stap, geen Node.js nodig. Twee opties:

**Optie 1 — GitHub Pages (aanbevolen om overal te gebruiken)**
Zet dit repo aan via GitHub Pages (Settings → Pages → branch `main` → map `/`) en
open de gegenereerde URL.

**Optie 2 — lokaal**
```bash
python3 -m http.server 8080
```
en open `http://localhost:8080` in je browser. (Rechtstreeks openen als
`file://` werkt niet omdat de app ES-modules gebruikt — browsers blokkeren dat
via het `file://`-protocol.)

## Data & privacy

Al je checklist-items, regels en controlegeschiedenis worden opgeslagen in de
`localStorage` van je browser. Er is geen server, geen database en er wordt
niets naar buiten verstuurd. Dit betekent ook dat je data **per browser/toestel**
blijft — als je op een ander toestel werkt, begin je met de standaard
voorbeelddata.

## PDF-vereiste

De app leest **selecteerbare tekst** uit een PDF (bv. een export vanuit je
planningstool). Een foto of scan zonder tekstlaag kan niet gelezen worden — plak
in dat geval de inhoud manueel via de tekstoptie op de Controle-tab.

## Projectstructuur

```
index.html          Pagina-skelet, laadt pdf.js via CDN
src/
  main.js            UI-rendering, state, event handling
  engine.js           Normalisatie + matching-logica (het "brein")
  storage.js          localStorage persistentie
  seedData.js          Standaard checklist-items en regels bij eerste gebruik
  pdfText.js           PDF → platte tekst
  styles.css           Vormgeving
```

## Uitbreiden

- **Nieuw verplicht item**: Checklist-tab → "+ Item toevoegen".
- **Nieuwe regel**: Regels-tab → "+ Regel toevoegen". Formaat voor verwachte
  items: één per lijn, `Naam :: trefwoord1, trefwoord2`.
