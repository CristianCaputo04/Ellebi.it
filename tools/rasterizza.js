/**
 * Trasforma i loghi SVG in PNG ad alta risoluzione, usando Chromium.
 * I file finiscono in .logo-tmp/, che genera-icone.py poi ridimensiona.
 *
 *   node tools/rasterizza.js
 *
 * Il percorso di Chromium si può forzare con CHROMIUM_PATH.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const RADICE = path.resolve(__dirname, '..');
const USCITA = path.join(RADICE, '.logo-tmp');

const LAVORI = [
  { svg: 'public/assets/img/logo-ellebi.svg', out: 'logo-1024.png', lato: 1024 },
  { svg: 'public/favicon.svg', out: 'marchio-1024.png', lato: 1024 },
];

(async () => {
  fs.mkdirSync(USCITA, { recursive: true });
  const opzioni = { args: ['--no-sandbox'] };
  if (process.env.CHROMIUM_PATH) opzioni.executablePath = process.env.CHROMIUM_PATH;
  const browser = await chromium.launch(opzioni);

  for (const l of LAVORI) {
    const page = await browser.newPage({
      viewport: { width: l.lato, height: l.lato },
      deviceScaleFactor: 1,
    });
    const svg = fs.readFileSync(path.join(RADICE, l.svg), 'utf8');
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}
       svg{display:block;width:${l.lato}px;height:${l.lato}px}</style>${svg}`
    );
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(USCITA, l.out), omitBackground: true });
    await page.close();
    console.log('reso', l.out);
  }

  await browser.close();
})();
