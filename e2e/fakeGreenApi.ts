import type { Page, Route } from '@playwright/test';

export const CHAT_ID = '777';

type Item = Record<string, unknown>;

/**
 * A small fake of a GREEN-API instance, served through Playwright routing:
 * history, sendMessage, long-polling notifications with receipt ids, settings.
 */
export class FakeGreenApi {
  history: Item[];
  queue: Array<{ receiptId: number; body: Item }> = [];
  sent: string[] = [];
  offline = false;
  private seq = 0;

  constructor(historyLength = 60) {
    const now = Math.floor(Date.now() / 1000);
    this.history = Array.from({ length: historyLength }, (_, i) => ({
      type: i % 3 ? 'incoming' : 'outgoing',
      idMessage: `h${i}`,
      timestamp: now - 4000 + i * 50,
      typeMessage: 'textMessage',
      chatId: CHAT_ID,
      textMessage: `Сообщение ${i}`,
      statusMessage: 'read',
    }));
  }

  push(body: Item) {
    this.queue.push({ receiptId: ++this.seq, body });
  }

  incoming(idMessage: string, text: string) {
    this.push({
      typeWebhook: 'incomingMessageReceived',
      timestamp: Math.floor(Date.now() / 1000),
      idMessage,
      senderData: { chatId: CHAT_ID, chatType: 'user', senderName: 'Тестер' },
      messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: text } },
    });
  }

  async attach(page: Page) {
    await page.route(/green-api\.com/, (route) => this.handle(route));
  }

  private async handle(route: Route) {
    const request = route.request();
    const headers = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    if (request.method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: { ...headers, 'access-control-allow-methods': 'GET,POST,DELETE', 'access-control-allow-headers': 'content-type' },
      });
    }
    if (this.offline) return route.abort('internetdisconnected');

    const method = /\/waInstance\d+\/(\w+)\//.exec(request.url())?.[1];
    const json = (body: unknown) => route.fulfill({ status: 200, headers, body: JSON.stringify(body) });

    switch (method) {
      case 'getStateInstance':
        return json({ stateInstance: 'authorized' });
      case 'getSettings':
        return json({
          webhookUrl: '',
          incomingWebhook: 'yes',
          outgoingWebhook: 'yes',
          outgoingMessageWebhook: 'yes',
          outgoingAPIMessageWebhook: 'yes',
        });
      case 'checkAccount':
        return json({ exist: true, chatId: CHAT_ID, username: '@tester', phoneNumber: 77001234567 });
      case 'getChatHistory':
        return json([...this.history].reverse());
      case 'sendMessage': {
        const { message } = request.postDataJSON() as { message: string };
        const idMessage = `s${++this.seq}`;
        this.sent.push(message);
        this.history.push({
          type: 'outgoing',
          idMessage,
          timestamp: Math.floor(Date.now() / 1000),
          typeMessage: 'textMessage',
          chatId: CHAT_ID,
          textMessage: message,
          statusMessage: 'sent',
        });
        return json({ idMessage });
      }
      case 'receiveNotification': {
        for (let i = 0; i < 10 && !this.queue.length && !this.offline; i++) {
          await new Promise((r) => setTimeout(r, 150));
        }
        return this.queue.length ? json(this.queue[0]) : route.fulfill({ status: 200, headers, body: 'null' });
      }
      case 'deleteNotification':
        this.queue.shift();
        return json({ result: true });
      default:
        return json({});
    }
  }
}

/** Logs in and opens the test chat. */
export async function loginAndOpenChat(page: Page, fake: FakeGreenApi) {
  await fake.attach(page);
  await page.goto('/');
  await page.getByPlaceholder('4100123456').fill('4100123456');
  await page.getByLabel('apiTokenInstance').fill('token');
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByLabel('Номер телефона или @username получателя').fill('+7 700 123 45 67');
  await page.getByRole('button', { name: 'Создать чат' }).click();
  await page.locator('.bubble__text').first().waitFor();
  await page.waitForTimeout(800);
}

export const bubbleTexts = (page: Page) => page.locator('.bubble__text').allTextContents();
