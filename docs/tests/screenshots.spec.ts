import { expect, test } from '@playwright/test'

test('landing page matches with intro skipped', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('vc-landing-skip-intro-once', '1')
  })

  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1500)

  await expect(page).toHaveScreenshot('landing-home.png', {
    animations: 'disabled',
    fullPage: true,
    maxDiffPixels: 10,
  })
})

test('guide page actions stay stable', async ({ page }) => {
  await page.goto('/docs/camera-view')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Open', exact: true }).click()

  await expect(page).toHaveScreenshot('guide-page-actions.png', {
    animations: 'disabled',
    fullPage: true,
    maxDiffPixels: 15000,
  })
})

test('desktop sidebar and toc stay sticky while scrolling', async ({
  page,
}) => {
  await page.goto('/docs/camera-view')
  await page.waitForLoadState('networkidle')

  // Scroll the window well past the nav bar
  await page.evaluate(() => window.scrollBy(0, 900))

  await expect
    .poll(async () => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0)

  const metrics = await page.evaluate(() => {
    const nav = document.getElementById('nd-nav')
    const sidebar = document.getElementById('nd-sidebar')
    const toc = document.getElementById('nd-toc')
    if (nav == null || sidebar == null || toc == null) return null

    return {
      navBottom: nav.getBoundingClientRect().bottom,
      navTop: nav.getBoundingClientRect().top,
      sidebarBottom: sidebar.getBoundingClientRect().bottom,
      sidebarTop: sidebar.getBoundingClientRect().top,
      tocBottom: toc.getBoundingClientRect().bottom,
      tocTop: toc.getBoundingClientRect().top,
      viewportHeight: window.innerHeight,
    }
  })

  if (metrics == null) {
    throw new Error('Desktop sticky elements not found')
  }

  // Nav should be sticky at the very top
  expect(metrics.navTop).toBeGreaterThanOrEqual(0)
  expect(metrics.navTop).toBeLessThanOrEqual(2)
  // Sidebar and ToC should be sticky just below the nav
  expect(metrics.sidebarTop).toBeGreaterThanOrEqual(metrics.navBottom - 2)
  expect(metrics.sidebarTop).toBeLessThanOrEqual(metrics.navBottom + 2)
  expect(metrics.tocTop).toBeGreaterThanOrEqual(metrics.navBottom - 2)
  expect(metrics.tocTop).toBeLessThanOrEqual(metrics.navBottom + 2)
  // All should stay within the viewport
  expect(metrics.sidebarBottom).toBeLessThanOrEqual(metrics.viewportHeight)
  expect(metrics.tocBottom).toBeLessThanOrEqual(metrics.viewportHeight)
})

test('scrollable docs pages have bottom spacing', async ({ page }) => {
  await page.goto('/docs/camera-view')
  await page.waitForLoadState('networkidle')

  // Verify the page is scrollable
  const isScrollable = await page.evaluate(
    () => document.documentElement.scrollHeight > window.innerHeight,
  )
  expect(isScrollable).toBe(true)

  // Scroll to the very bottom and measure spacing after the last content child
  const bottomSpacing = await page.evaluate(() => {
    const ndPage = document.getElementById('nd-page')
    if (!ndPage) throw new Error('#nd-page not found')

    // Scroll to absolute bottom
    window.scrollTo(0, document.documentElement.scrollHeight)

    // Measure: #nd-page's bottom edge minus its last child's bottom edge.
    // This captures padding-bottom (from fumadocs' py-6) that appears after content.
    const pageRect = ndPage.getBoundingClientRect()
    const lastChild = ndPage.lastElementChild as HTMLElement | null
    if (!lastChild) throw new Error('No children in #nd-page')
    const lastChildRect = lastChild.getBoundingClientRect()

    return pageRect.bottom - lastChildRect.bottom
  })

  // Expect at least 16px of visible bottom spacing (fumadocs' py-6 = 24px)
  expect(bottomSpacing).toBeGreaterThanOrEqual(16)
})

test('hybrid object api page stays stable', async ({ page }) => {
  await page.goto('/api/react-native-vision-camera/hybrid-objects/CameraOutput')
  await page.waitForLoadState('networkidle')

  await expect(page).toHaveScreenshot('api-hybrid-object.png', {
    animations: 'disabled',
    fullPage: true,
    maxDiffPixels: 250,
  })
})

test('function api page keeps linked code symbols', async ({ page }) => {
  await page.goto('/api/react-native-vision-camera/functions/getCameraDevice')
  await page.waitForLoadState('networkidle')

  await expect(page.locator('.api-code-link').first()).toBeVisible()
  await expect(page).toHaveScreenshot('api-function-page.png', {
    animations: 'disabled',
    fullPage: true,
  })
})

test('api page without eligible toc headings hides empty toc state', async ({
  page,
}) => {
  await page.goto('/api/react-native-vision-camera/views/NativePreviewView')
  await page.waitForLoadState('networkidle')

  await expect(page.getByRole('heading', { name: 'On this page' })).toHaveCount(
    0,
  )
  await expect(page.getByText('No Headings')).toHaveCount(0)

  const widget = page
    .getByText('Building something ambitious?')
    .locator('xpath=ancestor::aside[1]')
  await expect(widget).toBeVisible()

  const [titleBox, widgetBox] = await Promise.all([
    page
      .getByRole('heading', { level: 1, name: 'NativePreviewView' })
      .boundingBox(),
    widget.boundingBox(),
  ])

  if (titleBox == null || widgetBox == null) {
    throw new Error('Unable to measure API page heading or CTA widget')
  }

  expect(widgetBox.y).toBeLessThan(titleBox.y)
})
