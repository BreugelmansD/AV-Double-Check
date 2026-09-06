# AV Double Check

Een webapp om werkbonnen en magazijnbonnen te controleren op vergeten
materiaal — gebaseerd op de echte Blue Moon materiaalcatalogus, gedeeld
tussen collega's. Alle controles gebeuren via eenvoudige, transparante
tekstherkenning (geen AI/LLM): tekst normaliseren en matchen tegen
alfacodes/productnamen en door jullie gedefinieerde regels.

## Wat doet de app?

1. **Controle** — upload een PDF van een werkbon/magazijnbon (of plak de tekst
   manueel). De app herkent automatisch welke producten uit de catalogus op de
   bon staan, en checkt vervolgens:
   - of alle items uit **"Altijd nodig"** aanwezig zijn;
   - of er, op basis van **logische regels**, materiaal ontbreekt dat normaal
     bij een combinatie van andere materialen hoort (bv. staan er 2 speakers
     **én** een mixer op de bon, dan wordt gecheckt of er ook statieven bij
     staan).
   - Items die de app ten onrechte als ontbrekend markeert kan je met één klik
     als "toch aanwezig" markeren voor die controle.
2. **Altijd nodig** — het gedeelde basis-checklist: materiaal dat bij élke job
   mee moet (EHBO-kit, gaffer tape, gereedschapskoffer...), los van wat er op
   de bon staat.
3. **Regels** — "als dit **en** dit, dan waarschijnlijk ook dat"-regels, met
   meerdere triggers per regel (EN-logica). Kies triggers/verwacht materiaal
   uit de echte catalogus, of typ een los tekstitem. Elke regel is **gedeeld**
   (telt mee voor iedereen) of **privé** (enkel voor jouw eigen controles).
4. **Producten** — de volledige materiaalcatalogus (alfacode, naam, categorie),
   doorzoekbaar. Kan op elk moment opnieuw geïmporteerd worden vanuit een
   Excel-export, zonder de app opnieuw te moeten bouwen.
5. **Geschiedenis** — overzicht van controles door jou en je collega's.

## Delen binnen Blue Moon

De app gebruikt Firebase (gratis tier) zodat alle collega's dezelfde
catalogus, checklist, regels en geschiedenis zien. Er is geen Google-account
nodig: je logt in met een gedeelde teamcode + je eigen naam (zie
`src/firebaseConfig.js`).

**Eenmalige setup vereist** — zie [`SETUP.md`](SETUP.md) voor de volledige
stap-voor-stap instructies (Firebase-project aanmaken, anonieme login
inschakelen, Firestore-regels publiceren, teamcode instellen).

## Waarom geen AI?

De controle-logica is 100% deterministisch: tekst wordt genormaliseerd
(kleine letters, geen accenten) en gematcht tegen alfacodes/productnamen uit
de catalogus en tegen de trefwoorden van losse tekstitems. Geen LLM, geen
externe AI-API, geen onvoorspelbaarheid — wat je instelt, is exact wat er
gecontroleerd wordt.

De externe bibliotheken zijn pdf.js (PDF -> platte tekst), SheetJS (Excel ->
productlijst bij import) en de Firebase SDK (login + gedeelde database) — alle
drie klassieke, deterministische bibliotheken, geen AI.

## Gebruiken

Geen build-stap, geen Node.js nodig. Na de Firebase-setup (zie `SETUP.md`):

**GitHub Pages (aanbevolen)** — Settings -> Pages -> branch `main`, map `/`.

**Lokaal**:

```
python3 -m http.server 8080
```

en open `http://localhost:8080`. (Rechtstreeks openen als `file://` werkt niet
omdat de app ES-modules gebruikt.)

## PDF-vereiste

De app leest selecteerbare tekst uit een PDF (bv. een export vanuit je
planningstool). Een foto/scan zonder tekstlaag kan niet gelezen worden — plak
in dat geval de inhoud manueel via de tekstoptie op de Controle-tab.

## Projectstructuur

```
index.html            Pagina-skelet, laadt pdf.js + SheetJS via CDN
firestore.rules        Firestore-beveiligingsregels (zie SETUP.md)
SETUP.md               Stap-voor-stap Firebase-setup
src/
  main.js               UI-rendering, state, event handling
  engine.js             Normalisatie + matching-logica + EN-regel-evaluatie ("het brein")
  firebaseConfig.js      Jouw Firebase-projectgegevens (zelf invullen)
  firebase.js             Lui geladen Firebase SDK-init
  auth.js                 Stille anonieme Firebase-login (voor Firestore-toegang)
  db.js                   Firestore CRUD (producten, altijd-nodig, regels, geschiedenis)
  productImport.js         Excel/CSV -> productrecords (her-import via de app)
  seedProducts.js          Eenmalige seed-data (huidige Blue Moon materiaallijst)
  pdfText.js               PDF -> platte tekst
  styles.css                Vormgeving
```

## Uitbreiden

- Nieuw "altijd nodig"-item: **Altijd nodig**-tab -> "+ Item toevoegen".
- Nieuwe regel: **Regels**-tab -> "+ Regel toevoegen" -> kies triggers (EN) en
  verwacht materiaal uit de catalogus of typ een los tekstitem.
- Catalogus bijwerken: **Producten**-tab -> "Excel/CSV importeren".
