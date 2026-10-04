const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('test-auth-initialized')) {
      localStorage.setItem('typingquiz_token', 'test-token');
      sessionStorage.setItem('test-auth-initialized', '1');
    }
  });
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
});

for (const path of ['index.html', 'ai-create.html', 'changelog.html']) {
  test(`${path} exposes the main navigation and logout`, async ({ page }) => {
    await page.goto('/' + path);
    const nav = page.locator('nav');
    for (const href of ['home.html', 'quizzes.html', 'create.html', 'stats.html', 'manage.html', 'settings.html', 'changelog.html']) {
      await expect(nav.locator(`a[href="${href}"]`).last()).toBeVisible();
    }
    await expect(nav.getByText('退出', { exact: true })).toBeVisible();
  });
}

test('changelog stays public and logout clears credentials', async ({ page }) => {
  await page.goto('/changelog.html');
  await page.locator('nav').getByText('退出', { exact: true }).click();
  await expect(page).toHaveURL(/login.html$/);
  expect(await page.evaluate(() => localStorage.getItem('typingquiz_token'))).toBeNull();
  await page.goto('/changelog.html');
  await expect(page.locator('main h1')).toHaveText('更新日志');
  await expect(page.locator('nav').getByText('退出', { exact: true })).toBeHidden();
});

test('390px dashboard confines heatmap scrolling to its card', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/stats/heatmap?days=365', route => route.fulfill({ json: { data: [{ date: '2026-10-04', count: 1, level: 1 }] } }));
  await page.goto('/stats.html');
  await expect(page.locator('.heatmap-weeks')).toBeVisible();
  const widths = await page.evaluate(() => {
    const heatmap = document.querySelector('.heatmap-container');
    return { document: document.documentElement.scrollWidth, viewport: innerWidth, heatmap: heatmap.scrollWidth, card: heatmap.clientWidth };
  });
  expect(widths.document).toBeLessThanOrEqual(widths.viewport);
  expect(widths.heatmap).toBeGreaterThan(widths.card);
});

test('review initialization failure preserves navigation and renders errors as text', async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      Auth.isLoggedIn = () => { throw new Error('<img src=x onerror=alert(1)>'); };
    });
  });
  await page.goto('/review-quiz.html?id=1');
  await expect(page.locator('nav')).toBeVisible();
  await expect(page.locator('#error-message')).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#error-display img')).toHaveCount(0);
  await expect(page.locator('#loading-indicator')).toBeHidden();
});

test('review page renders its actual quiz surface', async ({ page }) => {
  await page.route('**/api/quizzes/1', route => route.fulfill({ json: { id: 1, title: '复习测试', quizType: 'TYPING', answers: [{ id: 1, content: '答案' }], timeLimit: 60 } }));
  await page.goto('/review-quiz.html?id=1');
  await expect(page.locator('nav')).toBeVisible();
  await expect(page.locator('#quiz-title')).toHaveText('复习测试');
  await expect(page.locator('#answer-input')).toBeVisible();
});
