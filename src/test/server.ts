import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { Webhook } from '../api/types';

export const API = 'https://4100.api.green-api.com';
export const ID = '4100123456';
export const TOKEN = 'secret-token';
const base = `${API}/waInstance${ID}`;

/** A tiny in-memory fake of the GREEN-API instance used by the tests. */
export const fake = {
  queue: [] as Array<{ receiptId: number; body: Webhook }>,
  deleted: [] as number[],
  sent: [] as Array<{ chatId: string; message: string; quotedMessageId?: string }>,
  deletedMessages: [] as Array<{ chatId: string; idMessage: string; onlySenderDelete?: boolean }>,
  state: 'authorized',
  nextReceipt: 1,
  settings: {
    webhookUrl: '',
    incomingWebhook: 'yes',
    outgoingWebhook: 'yes',
    outgoingMessageWebhook: 'yes',
    outgoingAPIMessageWebhook: 'yes',
  } as Record<string, string>,
  push(body: Webhook) {
    this.queue.push({ receiptId: this.nextReceipt++, body });
  },
  reset() {
    this.queue = [];
    this.deleted = [];
    this.sent = [];
    this.deletedMessages = [];
    this.state = 'authorized';
    this.nextReceipt = 1;
    this.settings = {
      webhookUrl: '',
      incomingWebhook: 'yes',
      outgoingWebhook: 'yes',
      outgoingMessageWebhook: 'yes',
      outgoingAPIMessageWebhook: 'yes',
    };
  },
};

const auth = (token: string | readonly string[] | undefined) => token === TOKEN;

export const handlers = [
  http.get(`${base}/getStateInstance/:token`, ({ params }) =>
    auth(params.token) ? HttpResponse.json({ stateInstance: fake.state }) : new HttpResponse(null, { status: 401 }),
  ),
  http.post(`${base}/checkAccount/:token`, async ({ request }) => {
    const { phoneNumber, username } = (await request.json()) as { phoneNumber?: number; username?: string };
    if (username) {
      return username.toLowerCase() === '@anya_dev'
        ? HttpResponse.json({ exist: true, chatId: 'chat-anya', username: '@anya_dev', phoneNumber: 79991112233 })
        : HttpResponse.json({ exist: false, chatId: '' });
    }
    if (String(phoneNumber) === '77000000000') return HttpResponse.json({ exist: false, chatId: '' });
    return HttpResponse.json({ exist: true, chatId: `chat-${phoneNumber}`, phoneNumber });
  }),
  http.post(`${base}/deleteMessage/:token`, async ({ request }) => {
    fake.deletedMessages.push((await request.json()) as (typeof fake.deletedMessages)[number]);
    return new HttpResponse(null, { status: 200 });
  }),
  http.get(`${base}/getSettings/:token`, () => HttpResponse.json(fake.settings)),
  http.post(`${base}/setSettings/:token`, async ({ request }) => {
    Object.assign(fake.settings, (await request.json()) as Record<string, string>);
    return HttpResponse.json({ saveSettings: true });
  }),
  http.post(`${base}/getChatHistory/:token`, () => HttpResponse.json([])),
  http.post(`${base}/sendMessage/:token`, async ({ request }) => {
    const body = (await request.json()) as (typeof fake.sent)[number];
    fake.sent.push(body);
    return HttpResponse.json({ idMessage: `srv-${fake.sent.length}` });
  }),
  http.get(`${base}/receiveNotification/:token`, async () => {
    await delay(20);
    const next = fake.queue[0];
    return next ? HttpResponse.json(next) : HttpResponse.text('null');
  }),
  http.delete(`${base}/deleteNotification/:token/:receiptId`, ({ params }) => {
    const id = Number(params.receiptId);
    fake.deleted.push(id);
    fake.queue = fake.queue.filter((n) => n.receiptId !== id);
    return HttpResponse.json({ result: true });
  }),
];

export const server = setupServer(...handlers);
