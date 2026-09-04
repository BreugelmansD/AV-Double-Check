// Leest een Excel-export (zelfde formaat als de Blue Moon materiaallijst: een
// sheet "products" met kolommen Alfacode/Product/# en een sheet "productgroups"
// met groepscode -> groepnaam en hoofdcategorie) en zet ze om naar platte
// productrecords. Gebruikt SheetJS (window.XLSX, via CDN), klassieke
// spreadsheet-parsing — geen AI.

const TOP_CATEGORY_FALLBACK = 'Overig';

export function parseWorkbookToProducts(workbook) {
  if (typeof window.XLSX === 'undefined') {
    throw new Error('Spreadsheet-bibliotheek kon niet geladen worden (geen internetverbinding?).');
  }
  const XLSX = window.XLSX;

  const groupSheetName = workbook.SheetNames.find((n) => n.toLowerCase() === 'productgroups');
  const productSheetName = workbook.SheetNames.find((n) => n.toLowerCase() === 'products') || workbook.SheetNames[0];

  const groupNameByCode = new Map();
  const categoryByPrefix = new Map();

  if (groupSheetName) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[groupSheetName], { header: 1 });
    for (const row of rows) {
      const [code, name, , prefix, catName] = row;
      if (code) groupNameByCode.set(String(code).trim(), (name || '').toString().trim());
      if (prefix) categoryByPrefix.set(String(prefix).trim(), (catName || '').toString().trim());
    }
  }
  // De brontabel koppelt IT-groepen niet aan een hoofdcategorie; val hiervoor terug op "IT".
  if (!categoryByPrefix.has('IT')) categoryByPrefix.set('IT', 'IT');

  const productRows = XLSX.utils.sheet_to_json(workbook.Sheets[productSheetName], { header: 1 });
  const [header, ...rows] = productRows;
  const products = [];
  const seen = new Set();

  for (const row of rows) {
    const [rawCode, rawName, rawQty] = row || [];
    if (!rawCode) continue;
    const code = String(rawCode).trim();
    if (seen.has(code)) continue;
    seen.add(code);
    const name = (rawName || '').toString().trim();
    const qty = typeof rawQty === 'number' ? rawQty : null;
    const groupCode = code.slice(0, 5);
    const group = groupNameByCode.get(groupCode) || '';
    const category = categoryByPrefix.get(groupCode.slice(0, 2)) || TOP_CATEGORY_FALLBACK;
    products.push({ code, name, qty, group, groupCode, category });
  }

  return products;
}

export function readWorkbookFile(file) {
  return new Promise((resolve, reject) => {
    if (typeof window.XLSX === 'undefined') {
      reject(new Error('Spreadsheet-bibliotheek kon niet geladen worden (geen internetverbinding?).'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = window.XLSX.read(e.target.result, { type: 'array' });
        resolve(wb);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Kon het bestand niet lezen.'));
    reader.readAsArrayBuffer(file);
  });
}
