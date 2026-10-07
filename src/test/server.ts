import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { Webhook } from '../api/types';

export const API = 'https://3100.api.green-api.com';
export const ID = '3100123456';
export const TOKEN = 'secret-token';
const base = `${API}/waInstance${ID}`;

/** A tiny in-memory fake of the GREEN-API instance used by the tests. */
export const fake = {
  queue: [] as Array<{ receiptId: number; body: Webhook }>,
  deleted: [] as number[],
  sent: [] as Array<{ chatId: string; message: string; quotedMessageId?: string }>,
  state: 'authorized',
  nextReceipt: 1,
  push(body: Webhook) {
    this.queue.push({ receiptId: this.nextReceipt++, body });
  },
  reset() {
    this.queue = [];
    this.deleted = [];
    this.sent = [];
    this.state = 'authorized';
    this.nextReceipt = 1;
  },
};

const auth = (token: string | readonly string[] | undefined) => token === TOKEN;

export const handlers = [
  http.get(`${base}/getStateInstance/:token`, ({ params }) =>
    auth(params.token) ? HttpResponse.json({ stateInstance: fake.state }) : new HttpResponse(null, { status: 401 }),
  ),
  http.post(`${base}/checkAccount/:token`, async ({ request }) => {
    const { phoneNumber } = (await request.json()) as { phoneNumber: number };
    if (String(phoneNumber) === '77000000000') return HttpResponse.json({ exist: false, chatId: '' });
    return HttpResponse.json({ exist: true, chatId: `chat-${phoneNumber}` });
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
