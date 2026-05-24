import { expect, test } from '@playwright/test'

// Note: this spec exercises everything that lives in the DB or in the UI
// — sidebar list, click-to-resume, product-card hydration from persisted
// tool parts, delete confirm + toast, refresh-survives. The "send a new
// message" path is LLM-dependent and stays in the eval suite (`pnpm eval`)
// to keep CI-style runs deterministic + free.

test.setTimeout(60_000)

// Locators that target the sidebar row by accessible role (link) — needed
// because the same text also appears in the chat transcript as a user
// bubble when a chat is open.
const sidebarHeadphones = (page: import('@playwright/test').Page) =>
  page.getByRole('link', { name: /Wireless headphones under \$50/ })
const sidebarBeauty = (page: import('@playwright/test').Page) =>
  page.getByRole('link', { name: /Beauty products/ })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  // Wait until SWR has filled the sidebar.
  await expect(sidebarHeadphones(page)).toBeVisible()
})

test('sidebar lists the seeded chats and the "+ New chat" link', async ({ page }) => {
  await expect(sidebarHeadphones(page)).toBeVisible()
  await expect(sidebarBeauty(page)).toBeVisible()
  await expect(page.getByRole('link', { name: /^New chat$/ })).toBeVisible()
})

test('clicking a seeded chat hydrates the transcript with product cards', async ({ page }) => {
  await sidebarHeadphones(page).click()
  await expect(page).toHaveURL(/\/chat\/e2e-chat-headphones$/)

  await expect(page.getByText('Here are a couple of options under $50.')).toBeVisible()
  await expect(page.getByText('Studio Wireless Headphones')).toBeVisible()
  await expect(page.getByText('Budget Earbuds')).toBeVisible()
  await expect(page.getByText('$39.99')).toBeVisible()
})

test('refresh on /chat/[id] keeps the conversation + product cards', async ({ page }) => {
  await sidebarHeadphones(page).click()
  await expect(page.getByText('Studio Wireless Headphones')).toBeVisible()

  await page.reload()

  await expect(page).toHaveURL(/\/chat\/e2e-chat-headphones$/)
  await expect(page.getByText('Studio Wireless Headphones')).toBeVisible()
  await expect(page.getByText('$39.99')).toBeVisible()
})

test('"+ New chat" routes to / and leaves the prior chats in the sidebar', async ({ page }) => {
  await sidebarHeadphones(page).click()
  await expect(page).toHaveURL(/\/chat\/e2e-chat-headphones$/)

  await page.getByRole('link', { name: /^New chat$/ }).click()

  // Relative URL — resolves against the configured baseURL, so this works
  // regardless of which port the test server is on.
  await expect(page).toHaveURL(/\/$/)
  await expect(sidebarHeadphones(page)).toBeVisible()
  await expect(sidebarBeauty(page)).toBeVisible()
})

test('delete: confirm dialog, cancel, then delete and surface a toast', async ({ page }) => {
  await sidebarBeauty(page).hover()
  const deleteBtn = page.getByRole('button', { name: 'Delete Beauty products' })
  await deleteBtn.click()

  await expect(page.getByRole('heading', { name: /Delete this chat\?/i })).toBeVisible()

  // Cancel: dialog closes, row stays
  await page.getByRole('button', { name: /Cancel/i }).click()
  await expect(page.getByRole('heading', { name: /Delete this chat\?/i })).not.toBeVisible()
  await expect(sidebarBeauty(page)).toBeVisible()

  // Re-open, confirm delete
  await sidebarBeauty(page).hover()
  await deleteBtn.click()
  await page.getByRole('button', { name: /^Delete$/ }).click()

  // Row gone
  await expect(sidebarBeauty(page)).toHaveCount(0)
  // Toast surfaces via sonner — selector tolerant of the auto-dismiss race.
  // Sonner mounts toasts in a `[data-sonner-toaster]` portal at the end of body.
  await expect(page.locator('[data-sonner-toaster]').getByText(/Deleted/)).toBeVisible()
})

test('deleting the active chat routes back to /', async ({ page }) => {
  await sidebarHeadphones(page).click()
  await expect(page).toHaveURL(/\/chat\/e2e-chat-headphones$/)

  await sidebarHeadphones(page).hover()
  await page
    .getByRole('button', { name: 'Delete Wireless headphones under $50' })
    .click()
  await page.getByRole('button', { name: /^Delete$/ }).click()

  await expect(page).toHaveURL(/\/$/)
})
