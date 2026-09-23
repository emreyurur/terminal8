import { chromium } from 'file:///C:/Users/emree/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs'

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
})

for (const viewport of [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  const page = await browser.newPage({ viewport })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('http://localhost:5175/', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Docs', exact: true }).click()
  await page.waitForTimeout(600)
  const metrics = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
    docsWidth: document.querySelector('.terminal8-docs')?.getBoundingClientRect().width ?? 0,
    mainWidth: document.querySelector('.terminal8-docs main')?.getBoundingClientRect().width ?? 0,
    hasHorizontalOverflow: document.body.scrollWidth > window.innerWidth,
  }))
  await page.screenshot({ path: `.tmp/docs-${viewport.name}.png`, fullPage: true })
  console.log(JSON.stringify({ viewport: viewport.name, metrics, errors }))
  await page.close()
}

await browser.close()
