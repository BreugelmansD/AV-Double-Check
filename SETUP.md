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

## 3. Anonieme login inschakelen

Er is geen Google-account nodig om in te loggen — de toegangsdrempel is een
gedeelde teamcode (zie stap 5). Onder de motorkap gebruikt de app wel een
(onzichtbare) Firebase-sessie zodat Firestore weet dat het om een "ingelogde"
bezoeker gaat.

1. Ga naar **Build -> Authentication -> Get started**.
2. Kies **Anonymous** als sign-in-methode en schakel deze in (schakelaar
   "Enable" -> **Save**). Geen support-e-mail, geen "Authorized domains" nodig
   — dat is enkel vereist voor Google/Microsoft-achtige providers.

## 4. Firestore-database aanmaken

1. Ga naar **Build -> Firestore Database -> Database maken**.
2. Kies een locatie in de buurt (bv. `eur3 (Europa)`).
3. Start in **productiemodus**.
4. Ga naar het tabblad **Rules** en vervang de inhoud volledig door de inhoud van [`firestore.rules`](firestore.rules) uit deze repo. Klik **Publiceren**.

## 5. Teamcode instellen

Open [`src/firebaseConfig.js`](src/firebaseConfig.js) en pas `TEAM_PASSCODE`
aan naar een code die je met collega's deelt (bv. via Slack/WhatsApp). Dit is
een lichte toegangsdrempel, geen echte beveiliging — iedereen die de broncode
bekijkt kan de code zien. Behandel deze app dus niet als een plek voor
gevoelige data.

## 6. Publiceren

1. Commit en push je ingevulde `src/firebaseConfig.js` naar GitHub (het bevat
   geen geheimen die je wil verbergen voor gebruikers — een Firebase
   web-apikey is bedoeld om publiek in client-code te staan; de teamcode is
   wel zichtbaar voor wie de broncode bekijkt, zie hierboven).
2. Zet **Settings -> Pages** aan op branch `main`, map `/` (indien nog niet gebeurd).
3. Open de gegenereerde GitHub Pages-URL, voer de teamcode + je naam in, en klaar.

## Later: catalogus bijwerken

Wanneer het magazijn nieuw materiaal krijgt, hoef je niets te herbouwen: ga naar
de **Producten**-tab in de app en importeer een nieuwe Excel-export (zelfde
formaat: sheets `products` en `productgroups`).
