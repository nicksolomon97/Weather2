const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 480 });

  const filePath = 'file://' + path.resolve(__dirname, 'weather.html');
  await page.goto(filePath, { waitUntil: 'networkidle0', timeout: 15000 });

  // Wait for API fetch + chart render
  await new Promise(r => setTimeout(r, 4000));

  await page.screenshot({
    path: 'weather.png',
    clip: { x: 0, y: 0, width: 800, height: 480 },
  });

  await browser.close();
  console.log('Done: weather.png saved');
})();
