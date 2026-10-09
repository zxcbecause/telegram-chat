import { expect, test } from '@playwright/test';
import { bubbleTexts, CHAT_ID, FakeGreenApi, loginAndOpenChat } from './fakeGreenApi';

test.describe('real browser', () => {
  test('long history: composer stays on screen and the list scrolls', async ({ page }) => {
    await loginAndOpenChat(page, new FakeGreenApi(60));

    const composer = await page.locator('.composer').boundingBox();
    const viewport = page.viewportSize()!;
    expect(composer!.y + composer!.height).toBeLessThanOrEqual(viewport.height + 1);

    const list = page.locator('.messages');
    const atBottom = await list.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 5);
    expect(atBottom).toBe(true);
    await list.evaluate((el) => el.scrollBy(0, -2000));
    await expect(page.getByRole('button', { name: 'Вниз к новым сообщениям' })).toBeVisible();
  });

  test('a sent message stays last, including after a history re-sync', async ({ page }) => {
    const fake = new FakeGreenApi(10);
    await loginAndOpenChat(page, fake);
    await page.getByLabel('Текст сообщения').fill('Из браузера');
    await page.keyboard.press('Enter');
    await expect.poll(() => fake.sent).toEqual(['Из браузера']);

    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(1000);
    const texts = await bubbleTexts(page);
    expect(texts.at(-1)).toBe('Из браузера');
    expect(texts.filter((t) => t === 'Из браузера')).toHaveLength(1);
  });

  test('incoming messages arrive live; while scrolled up they are counted, not forced into view', async ({ page }) => {
    const fake = new FakeGreenApi(60);
    await loginAndOpenChat(page, fake);
    await page.locator('.messages').evaluate((el) => el.scrollBy(0, -2000));
    fake.incoming('live-1', 'Живое сообщение');
    await expect(page.locator('.jump-down__badge')).toHaveText('1');
    await page.getByRole('button', { name: 'Вниз к новым сообщениям' }).click();
    await expect(page.getByRole('log').getByText('Живое сообщение')).toBeInViewport();
  });

  test('HTML inside a message is shown as text and never runs (XSS)', async ({ page }) => {
    const fake = new FakeGreenApi(2);
    fake.history.push({
      type: 'incoming',
      idMessage: 'x',
      timestamp: Math.floor(Date.now() / 1000),
      typeMessage: 'textMessage',
      chatId: CHAT_ID,
      textMessage: '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>',
    });
    await loginAndOpenChat(page, fake);
    await expect(page.getByRole('log').getByText('<img src=x onerror=')).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  });

  test('production build has a CSP and the app runs under it without violations', async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text());
    });
    await loginAndOpenChat(page, new FakeGreenApi(5));
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("connect-src 'self' https://*.green-api.com");
    expect(problems).toEqual([]);
  });

  test('shows a lost connection and recovers when the network is back', async ({ page }) => {
    const fake = new FakeGreenApi(3);
    await loginAndOpenChat(page, fake);
    fake.offline = true;
    await expect(page.locator('.conn')).toContainText('Нет соединения', { timeout: 8000 });
    fake.offline = false;
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.locator('.conn')).toContainText('В сети', { timeout: 8000 });
  });

  test('right click (desktop) or long press (phone) opens the message menu', async ({ page, isMobile }) => {
    await loginAndOpenChat(page, new FakeGreenApi(5));
    const own = page.locator('.msg--out .bubble').last();
    if (isMobile) {
      const box = (await own.boundingBox())!;
      const cdp = await page.context().newCDPSession(page);
      const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await page.waitForTimeout(700);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await own.click({ button: 'right' });
    }
    await expect(page.getByRole('menuitem')).toHaveText(['Ответить', 'Удалить у всех', 'Удалить только у меня']);
    const menu = (await page.getByRole('menu').boundingBox())!;
    expect(menu.y + menu.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    expect(menu.x).toBeGreaterThanOrEqual(0);
  });

  test('no horizontal scrolling at any width', async ({ page }) => {
    await loginAndOpenChat(page, new FakeGreenApi(20));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('demo mode works with no network requests at all', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('green-api')) requests.push(r.url());
    });
    await page.goto('/?demo');
    await page.getByText('Эхо-бот').click();
    await page.getByLabel('Текст сообщения').fill('демо?');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('log').getByText('Эхо: демо?')).toBeVisible({ timeout: 8000 });
    expect(requests).toEqual([]);
  });
});
