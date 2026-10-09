import { http, HttpResponse } from 'msw';
import { API, fake, ID, server, TOKEN } from '../test/server';
import { GreenApiClient, GreenApiError, guessApiUrl } from './greenApi';
import { extractText, messageFromHistory, messageFromWebhook } from './mappers';

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
