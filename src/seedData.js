// Startdata bij eerste gebruik. Volledig aanpasbaar/verwijderbaar via de Checklist- en Regels-tab.

export const seedMandatoryItems = [
  {
    id: 'seed-m1',
    label: 'Stroomkabel / verlengkabel',
    category: 'Voeding',
    keywords: ['stroomkabel', 'verlengkabel', 'voedingskabel', 'power cable', 'haspel'],
  },
  {
    id: 'seed-m2',
    label: 'Signaalkabels (XLR/HDMI/Cat6)',
    category: 'Kabels',
    keywords: ['xlr', 'hdmi', 'cat6', 'signaalkabel', 'jack kabel'],
  },
  {
    id: 'seed-m3',
    label: 'Bevestigingsmateriaal (klemmen/rigging)',
    category: 'Rigging',
    keywords: ['klem', 'rigging', 'truss', 'sjorband', 'beugel'],
  },
  {
    id: 'seed-m4',
    label: 'EHBO-kit',
    category: 'Veiligheid',
    keywords: ['ehbo', 'first aid', 'verbandtrommel'],
  },
  {
    id: 'seed-m5',
    label: 'Gereedschapskoffer',
    category: 'Werkmateriaal',
    keywords: ['gereedschap', 'toolbox', 'gereedschapskoffer'],
  },
  {
    id: 'seed-m6',
    label: 'Technische fiche / stageplan',
    category: 'Documentatie',
    keywords: ['rider', 'technische fiche', 'stageplan', 'planning'],
  },
];

export const seedRules = [
  {
    id: 'seed-r1',
    trigger: { label: 'Speaker / luidspreker', keywords: ['speaker', 'luidspreker', 'pa-kast', 'pa kast'] },
    suggestions: [
      { label: 'Speakerstatief', keywords: ['statief', 'standaard', 'speakerstatief'] },
      { label: 'Speakerkabel', keywords: ['speakerkabel', 'speakon'] },
    ],
  },
  {
    id: 'seed-r2',
    trigger: { label: 'Projector / beamer', keywords: ['projector', 'beamer'] },
    suggestions: [
      { label: 'Projectiescherm', keywords: ['scherm', 'canvas', 'projectiescherm'] },
      { label: 'HDMI-kabel', keywords: ['hdmi'] },
      { label: 'Verlengkabel HDMI', keywords: ['hdmi verleng', 'hdmi extender', 'hdmi booster'] },
    ],
  },
  {
    id: 'seed-r3',
    trigger: { label: 'Draadloze microfoon', keywords: ['draadloze microfoon', 'wireless mic', 'handheld zender', 'dasspeld'] },
    suggestions: [
      { label: 'Batterijen', keywords: ['batterij', 'aa batterij', '9v'] },
      { label: 'Ontvanger', keywords: ['ontvanger', 'receiver'] },
    ],
  },
  {
    id: 'seed-r4',
    trigger: { label: 'Laptop / regie-pc', keywords: ['laptop', 'pc regie', 'regie pc'] },
    suggestions: [
      { label: 'Voedingskabel laptop', keywords: ['laptop lader', 'voedingskabel laptop'] },
      { label: 'Video-adapter (HDMI/USB-C)', keywords: ['usb-c adapter', 'hdmi adapter', 'dongle'] },
    ],
  },
  {
    id: 'seed-r5',
    trigger: { label: 'Camera', keywords: ['camera'] },
    suggestions: [
      { label: 'Camerastatief', keywords: ['camerastatief', 'tripod'] },
      { label: 'Geheugenkaart', keywords: ['sd-kaart', 'geheugenkaart'] },
      { label: 'Extra batterij/accu', keywords: ['camera batterij', 'accu'] },
    ],
  },
];
