const { test, expect } = require('@playwright/test');

function assertHealthyStatus(snapshot) {
  const hiddenOrNotFailed = snapshot.hidden || snapshot.state !== 'failed';
  expect(hiddenOrNotFailed).toBeTruthy();
  expect(snapshot.text).not.toContain('Pretext unavailable (pretext:failed)');
  expect(snapshot.text).not.toContain('render exception');
}

test('moiré pretext runtime smoke check', async ({ page }) => {
  const consoleErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (error) => {
    consoleErrors.push(String(error));
  });

  await page.goto('/moir%C3%A9/moir%C3%A9.html');

  await page.waitForFunction(() => {
    const status = document.getElementById('pretextStatus');
    if (!status) return false;
    const style = window.getComputedStyle(status);
    const hidden = style.display === 'none';
    const state = status.dataset.state || '';
    return hidden || state !== 'waiting';
  });

  const firstStatus = await page.evaluate(() => {
    const status = document.getElementById('pretextStatus');
    const style = status ? window.getComputedStyle(status) : null;
    return {
      hidden: Boolean(style && style.display === 'none'),
      state: status?.dataset.state || '',
      text: status?.textContent || '',
    };
  });
  assertHealthyStatus(firstStatus);

  await page.fill('#text', 'Smoke test content update for a rerender cycle.');
  await page.click('#render');

  await page.waitForTimeout(100);

  const secondStatus = await page.evaluate(() => {
    const status = document.getElementById('pretextStatus');
    const style = status ? window.getComputedStyle(status) : null;
    return {
      hidden: Boolean(style && style.display === 'none'),
      state: status?.dataset.state || '',
      text: status?.textContent || '',
    };
  });
  assertHealthyStatus(secondStatus);

  const onLineErrors = consoleErrors.filter((entry) =>
    entry.includes('onLine is not a function'),
  );
  expect(onLineErrors, `console errors: ${consoleErrors.join('\n')}`).toHaveLength(0);
});
