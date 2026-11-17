#!/usr/bin/env python3
"""Bouwt AV Double Check om tot één losse HTML voor "Blue Moon Apps" (AI APPS).

Gebruik:  python3 scripts/maak-blue-moon-app.py [uitvoermap]
Standaard uitvoermap: ~/Desktop/AI/Klaar voor AI APPS

Ingebouwd: alle eigen modules, de stijlen, pdf.js (+ worker) en SheetJS, zodat
de app niet van een CDN afhangt. Niet ingebouwd: de Firebase-bibliotheek
(gstatic) en de gedeelde database zelf -- de app heeft dus internet nodig.
"""
import json, os, re, shutil, sys, urllib.request, zipfile, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_BASE = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/Desktop/AI/Klaar voor AI APPS")
NAME = "AV-Double-Check"
CACHE = os.path.expanduser("~/Library/Caches/AV-Double-Check-build")

LIBS = {
    "pdf.min.js": "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    "pdf.worker.min.js": "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
    "xlsx.full.min.js": "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
}
# volgorde = afhankelijkheden eerst
MODULES = ["firebaseConfig.js", "firebase.js", "auth.js", "engine.js", "seedProducts.js",
           "pdfText.js", "productImport.js", "db.js", "main.js"]


def lib(name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        print("downloaden:", name)
        urllib.request.urlretrieve(LIBS[name], path)
    return open(path, encoding="utf-8").read()


def script_safe(js):
    return js.replace("</script", "<\\/script")


def read(p):
    return open(os.path.join(ROOT, p), encoding="utf-8").read()


for m in MODULES:
    assert os.path.exists(os.path.join(ROOT, "src", m)), f"ontbreekt: src/{m}"

sources = {m: read(f"src/{m}") for m in MODULES}
css = read("src/styles.css")
icon = re.search(r'<link rel="icon"[^\n]*/>', read("index.html")).group(0)
worker = lib("pdf.worker.min.js")
assert "</script" not in worker, "worker bevat </script"

modules_json = json.dumps(sources, ensure_ascii=False).replace("</", "<\\/")

loader = """
(async () => {
  // pdf.js-worker uit de pagina zelf (geen CDN)
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(
    new Blob([document.getElementById('pdf-worker-src').textContent], { type: 'text/javascript' })
  );
  const sources = JSON.parse(document.getElementById('app-modules').textContent);
  const urls = {};
  for (const name of %s) {
    const code = sources[name].replace(/from\\s+'\\.\\/([\\w.]+)'/g, (_, dep) => {
      if (!urls[dep]) throw new Error('module niet gevonden: ' + dep);
      return "from '" + urls[dep] + "'";
    });
    urls[name] = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  }
  await import(urls['main.js']);
})().catch((e) => {
  document.getElementById('app').innerHTML = '<div style="padding:40px;font-family:sans-serif">Kon de app niet starten: ' + e.message + '</div>';
  console.error(e);
});
""" % json.dumps(MODULES)

html = f"""<!doctype html>
<html lang="nl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>AV Double Check</title>
{icon}
<style>
{css}
</style>
</head>
<body>
<div id="app"></div>
<!-- gebouwd {datetime.date.today().isoformat()} met scripts/maak-blue-moon-app.py -->
<script>
{script_safe(lib("pdf.min.js"))}
</script>
<script>
{script_safe(lib("xlsx.full.min.js"))}
</script>
<script type="text/plain" id="pdf-worker-src">
{worker}
</script>
<script type="application/json" id="app-modules">{modules_json}</script>
<script>
{loader}
</script>
</body>
</html>
"""

folder = os.path.join(OUT_BASE, NAME)
if os.path.exists(folder):
    shutil.rmtree(folder)
os.makedirs(folder)
open(os.path.join(folder, f"{NAME}.html"), "w", encoding="utf-8").write(html)
open(os.path.join(folder, "beschrijving.txt"), "w", encoding="utf-8").write(
    "Controleer een werkbon of magazijnbon (PDF) op vergeten materiaal, met gedeelde regels en een vaste lijst. Heeft internet nodig.\n")
open(os.path.join(folder, "logo.svg"), "w", encoding="utf-8").write(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#163a4a"/>'
    '<path d="M6 12.5l4 4 8-9" stroke="#e2924a" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>\n')

zip_path = os.path.join(OUT_BASE, f"{NAME}.zip")
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    for f in os.listdir(folder):
        z.write(os.path.join(folder, f), f"{NAME}/{f}")

print(f"klaar: {folder}  ({os.path.getsize(os.path.join(folder, NAME + '.html')) // 1024} kB)")
print(f"zip:   {zip_path}")
