# Firebase instellen (eenmalig)

De app deelt data (materiaalcatalogus, "altijd nodig"-lijst, regels, geschiedenis)
tussen alle Blue Moon-collega's via Firebase. Dit kost niets voor een team van
deze grootte (gratis "Spark"-tier).

## 1. Firebase-project aanmaken

1. Ga naar [console.firebase.google.com](https://console.firebase.google.com) en log in met een Google-account.
2. **Project toevoegen** -> geef het een naam, bv. `av-double-check`.
3. Google Analytics mag je uitschakelen (niet nodig).

## 2. Web-app toevoegen en config kopiëren

1. Klik in het project op het `</>` (web) icoon om een nieuwe web-app te registreren.
2. Geef een naam (bv. "AV Double Check") en klik **App registreren**.
3. Je krijgt een codeblok met `firebaseConfig = { apiKey: ..., authDomain: ..., ... }`.
4. Kopieer deze waarden naar [`src/firebaseConfig.js`](src/firebaseConfig.js) in deze repo, ter vervanging van de `VUL_IN`-waarden.

## 3. Google-login inschakelen

1. Ga naar **Build -> Authentication -> Get started**.
2. Kies **Google** als sign-in-methode en schakel deze in.
3. Vul een support-e-mailadres in en sla op.
4. Ga naar **Authentication -> Settings -> Authorized domains** en voeg je GitHub Pages-domein toe (bv. `breugelmansd.github.io`), zodat inloggen daar werkt.

De app zelf laat na het inloggen enkel `@bluemoon.be`-adressen effectief binnen (zowel in de interface als in de Firestore-regels hieronder) — een collega met een privé Gmail-account komt er niet in, ook al staat Google-login open voor iedereen.

## 4. Firestore-database aanmaken

1. Ga naar **Build -> Firestore Database -> Database maken**.
2. Kies een locatie in de buurt (bv. `eur3 (Europa)`).
3. Start in **productiemodus**.
4. Ga naar het tabblad **Rules** en vervang de inhoud volledig door de inhoud van [`firestore.rules`](firestore.rules) uit deze repo. Klik **Publiceren**.

## 5. Publiceren

1. Commit en push je ingevulde `src/firebaseConfig.js` naar GitHub (dit bestand bevat geen geheimen — een Firebase web-apikey is bedoeld om publiek in client-code te staan; de echte beveiliging zit in de Firestore-regels en de `@bluemoon.be`-check).
2. Zet **Settings -> Pages** aan op branch `main`, map `/` (indien nog niet gebeurd).
3. Open de gegenereerde GitHub Pages-URL, log in met je Blue Moon-account, en klaar.

## Later: catalogus bijwerken

Wanneer het magazijn nieuw materiaal krijgt, hoef je niets te herbouwen: ga naar
de **Producten**-tab in de app en importeer een nieuwe Excel-export (zelfde
formaat: sheets `products` en `productgroups`).
