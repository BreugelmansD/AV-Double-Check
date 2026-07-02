// Haalt platte tekst uit een PDF met selecteerbare tekst, via de pdf.js bibliotheek
// (klassieke tekstherkenning/parsing, geen AI). pdf.js wordt als globale `pdfjsLib`
// geladen via een <script> tag in index.html.

export async function extractPdfText(file) {
  if (typeof window.pdfjsLib === 'undefined') {
    throw new Error(
      'PDF-bibliotheek kon niet geladen worden (geen internetverbinding?). Plak de tekst van de bon manueel als alternatief.'
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  let fullText = '';
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str).join(' ');
    fullText += `${pageText}\n`;
  }

  if (!fullText.trim()) {
    throw new Error(
      'Er kon geen tekst uit deze PDF gehaald worden. Vermoedelijk is het een scan/foto zonder selecteerbare tekst — plak de tekst dan manueel.'
    );
  }

  return fullText.trim();
}
