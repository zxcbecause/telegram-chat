import { GreenApiError, type ApiClient } from '../api/greenApi';
import type {
  HistoryItem,
  MessageWebhook,
  Notification,
  SendMessageRequest,
  StatusWebhook,
  Webhook,
} from '../api/types';
import { formatPhone } from '../lib/phone';

/**
 * In-browser imitation of a GREEN-API instance for the demo mode.
 *
 * It speaks the same protocol as the real API (history items, a notification
 * queue with receiptId, outgoingMessageStatus webhooks), so the rest of the app
 * runs unchanged — the demo exercises the real polling loop and reducer.
 * Nothing leaves the browser.
 */

/** Tests shrink this to run the demo instantly. */
export const demoTiming = { scale: 1 };

type Behaviour =
  | { kind: 'reply'; replies: string[] }
  | { kind: 'echo' }
  /** Every first attempt to send a given text fails, the retry succeeds. */
  | { kind: 'flaky'; replies: string[] };

interface DemoChat {
  chatId: string;
  name: string;
  username?: string;
  phone?: string;
  behaviour: Behaviour;
  history: HistoryItem[];
  replyIndex: number;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms * demoTiming.scale));

function abortError() {
  return new DOMException('The operation was aborted', 'AbortError');
}

function text(chatId: string, idMessage: string, type: 'incoming' | 'outgoing', ts: number, body: string, extra: Partial<HistoryItem> = {}): HistoryItem {
  return {
    type,
    idMessage,
    timestamp: ts,
    typeMessage: extra.quotedMessage ? 'quotedMessage' : 'textMessage',
    chatId,
    textMessage: body,
    ...(type === 'outgoing' ? { statusMessage: 'read' } : {}),
    ...extra,
  };
}

/** Builds the demo chats relative to "now", so dates read naturally ("Вчера", "Сегодня"). */
function seed(): { chats: DemoChat[]; unreadIds: string[] } {
  const now = Math.floor(Date.now() / 1000);
  const ago = (minutes: number) => now - minutes * 60;

  const anna: DemoChat = {
    chatId: 'demo-anna',
    name: 'Анна Смирнова',
    username: '@anna_dev',
    phone: '77011234567',
    replyIndex: 0,
    behaviour: {
      kind: 'reply',
      replies: [
        'Пришло 👌 Видел, как галочки поменялись?',
        'Теперь попробуй ответить на конкретное сообщение: наведи на него и нажми стрелку (или двойной клик)',
        'Клик по цитате прокручивает к исходному сообщению — удобно в длинной переписке',
        'И переключи тему кнопкой слева сверху 🌙',
      ],
    },
    history: [],
  };
  anna.history = [
    text(anna.chatId, 'a1', 'incoming', ago(26 * 60), 'Привет! Это демо-чат: здесь можно посмотреть все функции без инстанса GREEN-API'),
    text(anna.chatId, 'a2', 'outgoing', ago(26 * 60 - 3), 'Привет! А что можно попробовать?'),
    text(anna.chatId, 'a3', 'incoming', ago(62), 'Отправь любое сообщение — статус сменится: 🕓 → ✓ → ✓✓ → прочитано'),
    text(anna.chatId, 'a4', 'incoming', ago(61), 'А ещё тут есть ответы на сообщения, черновики, разделители по датам и тёмная тема'),
    text(anna.chatId, 'a5', 'outgoing', ago(35), 'Черновики — это если начал писать и ушёл в другой чат?', {
      quotedMessage: { stanzaId: 'a4' },
    }),
    text(anna.chatId, 'a6', 'incoming', ago(33), 'Да, текст сохранится, а в списке чатов будет пометка «Черновик» 🙂'),
  ];

  const delivery: DemoChat = {
    chatId: 'demo-delivery',
    name: 'Служба доставки',
    replyIndex: 0,
    behaviour: { kind: 'reply', replies: ['Спасибо! Курьер получил ваше сообщение 🚚'] },
    history: [],
  };
  delivery.history = [
    text(delivery.chatId, 'd1', 'incoming', ago(3 * 24 * 60), 'Ваш заказ №48213 принят и собирается'),
    text(delivery.chatId, 'd2', 'outgoing', ago(3 * 24 * 60 - 5), 'Спасибо!'),
    text(delivery.chatId, 'd3', 'incoming', ago(14), 'Курьер выехал 🚚'),
    text(delivery.chatId, 'd4', 'incoming', ago(13), 'Ожидаемое время доставки: 19:30–20:00'),
    text(delivery.chatId, 'd5', 'incoming', ago(12), 'Пожалуйста, будьте на связи'),
  ];

  const echo: DemoChat = {
    chatId: 'demo-echo',
    name: 'Эхо-бот',
    username: '@echo_bot',
    replyIndex: 0,
    behaviour: { kind: 'echo' },
    history: [],
  };
  echo.history = [
    text(echo.chatId, 'e1', 'incoming', ago(120), 'Напиши что угодно — я сразу повторю. Так удобно проверять получение сообщений'),
  ];

  const flaky: DemoChat = {
    chatId: 'demo-flaky',
    name: 'Проверка ошибок',
    replyIndex: 0,
    behaviour: { kind: 'flaky', replies: ['Со второй попытки дошло ✅'] },
    history: [],
  };
  flaky.history = [
    text(flaky.chatId, 'f1', 'incoming', ago(240), 'Здесь первая попытка отправить каждое сообщение «падает» — чтобы показать кнопку «Повторить». Текст при этом не теряется'),
  ];

  return { chats: [anna, delivery, echo, flaky], unreadIds: ['a6', 'd3', 'd4', 'd5', 'e1', 'f1'] };
}

function toWebhook(chat: DemoChat, item: HistoryItem): MessageWebhook {
  return {
    typeWebhook: item.type === 'incoming' ? 'incomingMessageReceived' : 'outgoingAPIMessageReceived',
    timestamp: item.timestamp,
    idMessage: item.idMessage,
    senderData: { chatId: chat.chatId, chatName: chat.name, senderName: chat.name },
    messageData: item.quotedMessage
      ? {
          typeMessage: 'quotedMessage',
          extendedTextMessageData: { text: item.textMessage ?? '' },
          quotedMessage: item.quotedMessage,
        }
      : { typeMessage: 'textMessage', textMessageData: { textMessage: item.textMessage ?? '' } },
  };
}

export class DemoClient implements ApiClient {
  private readonly chats = new Map<string, DemoChat>();
  private queue: Notification[] = [];
  private nextReceipt = 1;
  private seq = 0;
  private readonly failedOnce = new Set<string>();
  private readonly waiters = new Set<() => void>();

  constructor() {
    const { chats, unreadIds } = seed();
    for (const chat of chats) this.chats.set(chat.chatId, chat);

    // The latest message of each demo chat arrives as a notification on start,
    // exactly like messages that came in while the real app was closed.
    const initial = chats
      .flatMap((chat) => chat.history.filter((h) => unreadIds.includes(h.idMessage)).map((h) => ({ chat, h })))
      .sort((a, b) => a.h.timestamp - b.h.timestamp);
    for (const { chat, h } of initial) this.push(toWebhook(chat, h));
  }

  private push(body: Webhook) {
    this.queue.push({ receiptId: this.nextReceipt++, body });
    for (const wake of this.waiters) wake();
  }

  private chatFor(chatId: string): DemoChat {
    let chat = this.chats.get(chatId);
    if (!chat) {
      chat = {
        chatId,
        name: chatId,
        replyIndex: 0,
        behaviour: { kind: 'reply', replies: ['Привет! Это новый демо-чат — сообщения не уходят в настоящий Telegram'] },
        history: [],
      };
      this.chats.set(chatId, chat);
    }
    return chat;
  }

  async getSettings() {
    return {
      webhookUrl: '',
      incomingWebhook: 'yes',
      outgoingWebhook: 'yes',
      outgoingMessageWebhook: 'yes',
      outgoingAPIMessageWebhook: 'yes',
    };
  }

  async setSettings() {
    return { saveSettings: true };
  }

  async getStateInstance() {
    await delay(200);
    return { stateInstance: 'authorized' };
  }

  async checkAccount(target: { phoneNumber: string } | { username: string }) {
    await delay(500);
    if ('username' in target) {
      const existing = [...this.chats.values()].find(
        (c) => c.username?.toLowerCase() === target.username.toLowerCase(),
      );
      if (existing) return { exist: true, chatId: existing.chatId, username: existing.username };
      const chat = this.chatFor(`demo-${target.username.slice(1).toLowerCase()}`);
      chat.name = target.username;
      chat.username = target.username;
      return { exist: true, chatId: chat.chatId, username: target.username };
    }

    if (target.phoneNumber === '77000000000') return { exist: false, chatId: '' };
    const existing = [...this.chats.values()].find((c) => c.phone === target.phoneNumber);
    if (existing) {
      return { exist: true, chatId: existing.chatId, phoneNumber: Number(target.phoneNumber), username: existing.username };
    }
    const chat = this.chatFor(`demo-${target.phoneNumber}`);
    chat.name = formatPhone(target.phoneNumber);
    chat.phone = target.phoneNumber;
    return { exist: true, chatId: chat.chatId, phoneNumber: Number(target.phoneNumber) };
  }

  async getChatHistory(chatId: string, count = 50) {
    await delay(700); // long enough to see the skeleton
    const chat = this.chats.get(chatId);
    if (!chat) return [];
    return [...chat.history]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, count)
      .map((h) => ({ ...h }));
  }

  async sendMessage({ chatId, message, quotedMessageId }: SendMessageRequest) {
    const chat = this.chatFor(chatId);

    if (chat.behaviour.kind === 'flaky' && !this.failedOnce.has(message)) {
      this.failedOnce.add(message);
      await delay(900);
      throw new GreenApiError('Не отправлено: нет соединения (демо-ошибка)', 503);
    }
    this.failedOnce.delete(message);

    await delay(350);
    const idMessage = `demo-out-${++this.seq}`;
    const item = text(chatId, idMessage, 'outgoing', Math.floor(Date.now() / 1000), message, {
      statusMessage: 'sent',
      ...(quotedMessageId ? { quotedMessage: { stanzaId: quotedMessageId } } : {}),
    });
    chat.history.push(item);
    void this.simulateRecipient(chat, item);
    return { idMessage };
  }

  /** Delivered → read → (maybe) an answer, with human-ish pauses. */
  private async simulateRecipient(chat: DemoChat, sent: HistoryItem) {
    const fast = chat.behaviour.kind === 'echo';
    const status = (s: 'delivered' | 'read') => {
      sent.statusMessage = s;
      const body: StatusWebhook = {
        typeWebhook: 'outgoingMessageStatus',
        timestamp: Math.floor(Date.now() / 1000),
        chatId: chat.chatId,
        idMessage: sent.idMessage,
        status: s,
      };
      this.push(body);
    };

    await delay(fast ? 300 : 900);
    status('delivered');
    await delay(fast ? 300 : 1300);
    status('read');

    let answer: string | undefined;
    if (chat.behaviour.kind === 'echo') answer = `Эхо: ${sent.textMessage}`;
    else {
      const { replies } = chat.behaviour;
      answer = replies[chat.replyIndex % replies.length];
      chat.replyIndex += 1;
    }
    if (!answer) return;

    await delay(fast ? 400 : 1500);
    const reply = text(chat.chatId, `demo-in-${++this.seq}`, 'incoming', Math.floor(Date.now() / 1000), answer);
    chat.history.push(reply);
    this.push(toWebhook(chat, reply));
  }

  receiveNotification(timeoutSec = 20, signal?: AbortSignal): Promise<Notification | null> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(abortError());

      const finish = () => {
        cleanup();
        // A short pause between notifications so bubbles animate one by one.
        setTimeout(() => (signal?.aborted ? reject(abortError()) : resolve(this.queue[0] ?? null)), 120 * demoTiming.scale);
      };
      const onAbort = () => {
        cleanup();
        reject(abortError());
      };
      const timer = setTimeout(finish, timeoutSec * 1000);
      const cleanup = () => {
        clearTimeout(timer);
        this.waiters.delete(finish);
        signal?.removeEventListener('abort', onAbort);
      };

      signal?.addEventListener('abort', onAbort, { once: true });
      if (this.queue.length) finish();
      else this.waiters.add(finish);
    });
  }

  async deleteNotification(receiptId: number) {
    this.queue = this.queue.filter((n) => n.receiptId !== receiptId);
    return { result: true };
  }
}
