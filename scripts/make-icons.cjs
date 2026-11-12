// Renders the PWA icons into public/. Usage: node scripts/make-icons.cjs
const path = require("node:path");
const { chromium } = require("playwright");

const out = path.join(__dirname, "..", "public");
const html = (size, radius, fontScale) => `<html><body style="margin:0;background:transparent">
<div style="width:${size}px;height:${size}px;background:#2b55cc;border-radius:${radius}px;display:grid;place-items:center;
font:700 ${Math.round(size * fontScale)}px/1 system-ui,Arial,sans-serif;color:#fff;letter-spacing:-0.02em">PS</div></body></html>`;

const icons = [
  { file: "icon-192.png", size: 192, radius: 0.22, font: 0.42 },
  { file: "icon-512.png", size: 512, radius: 0.22, font: 0.42 },
  // Full-bleed with extra padding so the glyph stays inside the maskable safe zone.
  { file: "icon-maskable-512.png", size: 512, radius: 0, font: 0.3 },
  { file: "apple-touch-icon.png", size: 180, radius: 0, font: 0.4 },
];

(async () => {
  const browser = await chromium.launch();
  for (const i of icons) {
    const page = await browser.newPage({ viewport: { width: i.size, height: i.size } });
    await page.setContent(html(i.size, Math.round(i.size * i.radius), i.font));
    await page.screenshot({ path: path.join(out, i.file), omitBackground: true, clip: { x: 0, y: 0, width: i.size, height: i.size } });
    await page.close();
  }
  await browser.close();
})();
