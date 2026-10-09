import { http, HttpResponse } from 'msw';
import { API, fake, ID, server, TOKEN } from '../test/server';
import { GreenApiClient, GreenApiError, guessApiUrl, settingsProblems, validateApiUrl } from './greenApi';
import { extractText, isPersonalChat, messageFromHistory, messageFromWebhook } from './mappers';

const client = new GreenApiClient({ apiUrl: `${API}/`, idInstance: ID, apiTokenInstance: TOKEN });

beforeEach(() => fake.reset());

describe('guessApiUrl', () => {
  it('derives the cluster host from idInstance', () => {
    expect(guessApiUrl('4100123456')).toBe('https://4100.api.green-api.com');
    expect(guessApiUrl('')).toBe('https://api.green-api.com');
  });
});

describe('GreenApiClient', () => {
  it('sends text with an optional quote', async () => {
    const res = await client.sendMessage({ chatId: '10000000', message: 'Привет', quotedMessageId: 'q1' });
    expect(res.idMessage).toBe('srv-1');
    expect(fake.sent[0]).toEqual({ chatId: '10000000', message: 'Привет', quotedMessageId: 'q1' });
  });

  it('returns null when the notification queue is empty and acks by receiptId', async () => {
    expect(await client.receiveNotification(5)).toBeNull();

    fake.push({ typeWebhook: 'stateInstanceChanged', timestamp: 1, stateInstance: 'authorized' });
    const n = await client.receiveNotification(5);
    expect(n?.receiptId).toBe(1);
    await client.deleteNotification(n!.receiptId);
    expect(fake.deleted).toEqual([1]);
  });

  it('maps HTTP errors to readable messages', async () => {
    const bad = new GreenApiClient({ apiUrl: API, idInstance: ID, apiTokenInstance: 'wrong' });
    await expect(bad.getStateInstance()).rejects.toMatchObject({
      name: 'GreenApiError',
      status: 401,
      message: 'Неверный idInstance или apiTokenInstance',
    });
  });

  it('treats { status: false } from checkAccount as an error', async () => {
    server.use(
      http.post(`${API}/waInstance${ID}/checkAccount/:token`, () =>
        HttpResponse.json({ status: false, reason: 'instance is starting or not authorized' }),
      ),
    );
    await expect(client.checkAccount({ phoneNumber: '77001234567' })).rejects.toBeInstanceOf(GreenApiError);
  });

  it('resolves a chat by @username', async () => {
    const res = await client.checkAccount({ username: '@anya_dev' });
    expect(res).toMatchObject({ exist: true, chatId: 'chat-anya' });
  });
});

describe('mappers', () => {
  it('extracts text from text, extended text and quoted messages only', () => {
    expect(extractText({ typeMessage: 'textMessage', textMessageData: { textMessage: 'a' } })).toBe('a');
    expect(extractText({ typeMessage: 'extendedTextMessage', extendedTextMessageData: { text: 'b' } })).toBe('b');
    expect(extractText({ typeMessage: 'quotedMessage', extendedTextMessageData: { text: 'c' } })).toBe('c');
    expect(extractText({ typeMessage: 'imageMessage' })).toBeNull();
  });

  it('turns a webhook into a message with ms timestamps and the quote id', () => {
    const m = messageFromWebhook({
      typeWebhook: 'incomingMessageReceived',
      timestamp: 1763115112,
      idMessage: 'x1',
      senderData: { chatId: '10000000', senderName: 'Аня' },
      messageData: {
        typeMessage: 'quotedMessage',
        extendedTextMessageData: { text: 'да' },
        quotedMessage: { stanzaId: 'q1' },
      },
    });
    expect(m).toEqual({
      id: 'x1',
      chatId: '10000000',
      text: 'да',
      timestamp: 1763115112000,
      direction: 'in',
      status: undefined,
      quotedId: 'q1',
    });
  });
});

describe('findText (replies in different shapes)', () => {
  it('finds the text of a reply wherever the API put it', () => {
    const base = { type: 'incoming' as const, idMessage: 'x', timestamp: 1, chatId: 'c' };
    const shapes = [
      { ...base, typeMessage: 'quotedMessage', textMessage: 'да' },
      { ...base, typeMessage: 'quotedMessage', extendedTextMessage: { text: 'да' } },
      { ...base, typeMessage: 'extendedTextMessage', extendedTextMessageData: { text: 'да' } },
      { ...base, typeMessage: 'replyMessage', textMessageData: { textMessage: 'да' } },
    ];
    for (const item of shapes) {
      expect(messageFromHistory(item as never).text).toBe('да');
    }
  });

  it('uses the quoted text sent with a reply and keeps media as attachments', () => {
    const m = messageFromHistory({
      type: 'incoming',
      idMessage: 'r',
      timestamp: 1,
      chatId: 'c',
      typeMessage: 'quotedMessage',
      textMessage: 'ответ',
      quotedMessage: { stanzaId: 'old', textMessage: 'исходное' },
    });
    expect(m).toMatchObject({ text: 'ответ', quotedId: 'old', quotedText: 'исходное' });
    expect(
      messageFromHistory({ type: 'incoming', idMessage: 'i', timestamp: 1, chatId: 'c', typeMessage: 'imageMessage' })
        .text,
    ).toBeNull();
  });
});

describe('attachments', () => {
  const base = { type: 'incoming' as const, idMessage: 'x', timestamp: 1, chatId: 'c' };

  it('shows documents by file name and keeps the caption as text', () => {
    expect(
      messageFromHistory({ ...base, typeMessage: 'documentMessage', fileName: 'lepro_цены.xlsx', caption: '' }),
    ).toMatchObject({ text: null, attachment: { kind: 'document', name: 'lepro_цены.xlsx' } });

    expect(
      messageFromHistory({
        ...base,
        typeMessage: 'imageMessage',
        fileName: '1769056990.jpg',
        caption: 'почему остаток не грузится?',
      }),
    ).toMatchObject({ text: 'почему остаток не грузится?', attachment: { kind: 'photo' } });
  });

  it('reads file details from webhooks (fileMessageData)', () => {
    const m = messageFromWebhook({
      typeWebhook: 'incomingMessageReceived',
      timestamp: 1,
      idMessage: 'w',
      senderData: { chatId: 'c' },
      messageData: { typeMessage: 'imageMessage', fileMessageData: { caption: 'смотри', fileName: 'a.jpg' } },
    });
    expect(m).toMatchObject({ text: 'смотри', attachment: { kind: 'photo' } });
  });

  it('labels unknown types instead of hiding them', () => {
    expect(messageFromHistory({ ...base, typeMessage: 'callMessage' })).toMatchObject({
      text: null,
      attachment: { kind: 'other', name: 'callMessage' },
    });
  });
});

describe('settingsProblems', () => {
  it('lists what stops live notifications', () => {
    expect(
      settingsProblems({
        webhookUrl: 'https://x',
        incomingWebhook: 'no',
        outgoingWebhook: 'yes',
        outgoingMessageWebhook: 'yes',
        outgoingAPIMessageWebhook: 'yes',
      }),
    ).toEqual([
      'задан Webhook URL — HTTP API не отдаёт уведомления',
      'выключены уведомления о входящих сообщениях',
    ]);
    expect(settingsProblems(fake.settings)).toEqual([]);
  });
});

describe('isPersonalChat', () => {
  const w = (senderData: { chatId: string; chatType?: string }) =>
    ({
      typeWebhook: 'incomingMessageReceived',
      timestamp: 1,
      idMessage: 'x',
      senderData,
      messageData: { typeMessage: 'textMessage' },
    }) as const;

  it('keeps people and bots, skips groups and channels', () => {
    expect(isPersonalChat(w({ chatId: '10000000', chatType: 'user' }))).toBe(true);
    expect(isPersonalChat(w({ chatId: '20000000', chatType: 'bot' }))).toBe(true);
    expect(isPersonalChat(w({ chatId: '-1001', chatType: 'supergroup' }))).toBe(false);
    expect(isPersonalChat(w({ chatId: '-1001' }))).toBe(false);
  });
});

describe('validateApiUrl (where the token may be sent)', () => {
  it('accepts GREEN-API hosts over https', () => {
    expect(validateApiUrl('https://4100.api.green-api.com')).toBeNull();
    expect(validateApiUrl('https://api.green-api.com/')).toBeNull();
  });

  it('rejects other sites, plain http and garbage', () => {
    expect(validateApiUrl('https://evil.example.com')).toMatch(/green-api\.com/);
    expect(validateApiUrl('https://green-api.com.evil.io')).toMatch(/green-api\.com/);
    expect(validateApiUrl('https://evilgreen-api.com')).toMatch(/green-api\.com/);
    expect(validateApiUrl('http://4100.api.green-api.com')).toMatch(/https/);
    expect(validateApiUrl('javascript:alert(1)')).not.toBeNull();
    expect(validateApiUrl('не адрес')).not.toBeNull();
  });
});

describe('request building and error handling', () => {
  const base = `${API}/waInstance${ID}`;

  it('encodes the token so it cannot change the request path', async () => {
    let seen = '';
    server.use(
      http.get(`${API}/*`, ({ request }) => {
        seen = new URL(request.url).pathname;
        return HttpResponse.json({ stateInstance: 'authorized' });
      }),
    );
    const c = new GreenApiClient({ apiUrl: API, idInstance: ID, apiTokenInstance: 'a/b?c#d' });
    await c.getStateInstance();
    expect(seen).toBe(`/waInstance${ID}/getStateInstance/a%2Fb%3Fc%23d`);
  });

  it.each([
    [404, '', 'Инстанс не найден. Проверьте API URL и idInstance'],
    [429, '', 'Слишком много запросов, подождите немного'],
    [466, '', 'Достигнут лимит тарифа GREEN-API'],
    [469, '', 'Telegram временно ограничил проверку номеров, попробуйте позже'],
    [502, '', 'Сервер GREEN-API временно недоступен'],
    [400, 'custom webhook url is set', 'В настройках инстанса задан Webhook URL — очистите его, чтобы получать сообщения'],
    [400, 'Message by id not found', 'Сообщение не найдено — возможно, оно уже удалено'],
    [418, '', 'Ошибка 418'],
  ])('HTTP %i → readable message', async (status, body, message) => {
    server.use(http.post(`${base}/sendMessage/:token`, () => new HttpResponse(body, { status })));
    await expect(client.sendMessage({ chatId: '1', message: 'x' })).rejects.toMatchObject({ status, message });
  });

  it('reports rate limits from checkAccount even when they come as 200', async () => {
    server.use(
      http.post(`${base}/checkAccount/:token`, () =>
        HttpResponse.json({ status: false, data: { status: 'fail', reason: 'rate_limit_exceeded' } }),
      ),
    );
    await expect(client.checkAccount({ phoneNumber: '77001234567' })).rejects.toThrow('Telegram просит подождать');
  });

  it('turns a non-JSON answer (proxy error page) into an error instead of crashing later', async () => {
    server.use(http.get(`${base}/getSettings/:token`, () => HttpResponse.text('<html>Bad gateway</html>')));
    await expect(client.getSettings()).rejects.toThrow();
  });

  it('sends settings and delete requests in the documented shape', async () => {
    await client.setSettings({ incomingWebhook: 'yes', webhookUrl: '' });
    expect(fake.settings).toMatchObject({ incomingWebhook: 'yes', webhookUrl: '' });

    await client.deleteMessage({ chatId: '10', idMessage: 'm1', onlySenderDelete: true });
    expect(fake.deletedMessages).toEqual([{ chatId: '10', idMessage: 'm1', onlySenderDelete: true }]);
  });

  it('passes the receive timeout to long polling', async () => {
    let timeout: string | null = null;
    server.use(
      http.get(`${base}/receiveNotification/:token`, ({ request }) => {
        timeout = new URL(request.url).searchParams.get('receiveTimeout');
        return HttpResponse.text('null');
      }),
    );
    expect(await client.receiveNotification(20)).toBeNull();
    expect(timeout).toBe('20');
  });
});
