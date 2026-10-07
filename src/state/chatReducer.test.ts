import { chatReducer, initialState, mergeStatus, selectChatList, type ChatAction, type ChatState } from './chatReducer';

const run = (actions: ChatAction[], state: ChatState = initialState) => actions.reduce(chatReducer, state);
const open: ChatAction = { type: 'chat/open', chatId: 'c1', title: 'Аня', phone: '77001234567', now: 1000 };

describe('mergeStatus', () => {
  it('only moves forward', () => {
    expect(mergeStatus('read', 'delivered')).toBe('read');
    expect(mergeStatus('sent', 'delivered')).toBe('delivered');
    expect(mergeStatus('delivered', 'sent')).toBe('delivered');
  });

  it('lets failed win, but a later delivery proves it went through', () => {
    expect(mergeStatus('delivered', 'failed')).toBe('failed');
    expect(mergeStatus('failed', 'sent')).toBe('failed');
    expect(mergeStatus('failed', 'read')).toBe('read');
  });
});

describe('chatReducer', () => {
  it('sends a message: pending → sent, and clears the draft', () => {
    const s = run([
      open,
      { type: 'chat/draft', chatId: 'c1', draft: 'привет' },
      { type: 'send/start', chatId: 'c1', localId: 'l1', text: 'привет', now: 2000 },
    ]);
    expect(s.chats.c1!.draft).toBe('');
    expect(s.chats.c1!.messages[0]).toMatchObject({ id: 'l1', status: 'pending', local: true });

    const done = chatReducer(s, { type: 'send/success', chatId: 'c1', localId: 'l1', idMessage: 'm1' });
    expect(done.chats.c1!.messages).toEqual([expect.objectContaining({ id: 'm1', status: 'sent', local: false })]);
  });

  it('does not duplicate when the API webhook arrives before the HTTP response', () => {
    const s = run([
      open,
      { type: 'send/start', chatId: 'c1', localId: 'l1', text: 'hi', now: 2000 },
      {
        type: 'message/received',
        message: { id: 'm1', chatId: 'c1', text: 'hi', timestamp: 2001, direction: 'out', status: 'sent' },
      },
      { type: 'send/success', chatId: 'c1', localId: 'l1', idMessage: 'm1' },
    ]);
    expect(s.chats.c1!.messages).toHaveLength(1);
    expect(s.chats.c1!.messages[0]!.id).toBe('m1');
  });

  it('applies a status that arrived before the message id was known', () => {
    const s = run([
      open,
      { type: 'send/start', chatId: 'c1', localId: 'l1', text: 'hi', now: 2000 },
      { type: 'message/status', chatId: 'c1', idMessage: 'm1', status: 'delivered' },
      { type: 'send/success', chatId: 'c1', localId: 'l1', idMessage: 'm1' },
    ]);
    expect(s.chats.c1!.messages[0]!.status).toBe('delivered');
    expect(s.orphanStatuses).toEqual({});
  });

  it('never downgrades a status (read stays read after a late "delivered")', () => {
    const s = run([
      open,
      { type: 'send/start', chatId: 'c1', localId: 'l1', text: 'hi', now: 2000 },
      { type: 'send/success', chatId: 'c1', localId: 'l1', idMessage: 'm1' },
      { type: 'message/status', chatId: 'c1', idMessage: 'm1', status: 'read' },
      { type: 'message/status', chatId: 'c1', idMessage: 'm1', status: 'delivered' },
    ]);
    expect(s.chats.c1!.messages[0]!.status).toBe('read');
  });

  it('creates a chat for an unknown sender and counts unread only when not open', () => {
    const incoming = (id: string, chatId: string, timestamp: number): ChatAction => ({
      type: 'message/received',
      title: 'Борис',
      message: { id, chatId, text: 'yo', timestamp, direction: 'in' },
    });
    const s = run([open, incoming('a', 'c1', 5000), incoming('b', 'c2', 6000), incoming('b', 'c2', 6000)]);
    expect(s.chats.c1!.unread).toBe(0); // c1 is the active chat
    expect(s.chats.c2).toMatchObject({ title: 'Борис', unread: 1 }); // duplicate ignored
    expect(selectChatList(s)[0]!.chatId).toBe('c2'); // most recent activity first
  });

  it('marks failed sends and supports retry/discard', () => {
    const s = run([
      open,
      { type: 'send/start', chatId: 'c1', localId: 'l1', text: 'hi', now: 2000 },
      { type: 'send/failed', chatId: 'c1', localId: 'l1', error: 'offline' },
    ]);
    expect(s.chats.c1!.messages[0]).toMatchObject({ status: 'failed', error: 'offline' });
    expect(chatReducer(s, { type: 'send/retry', chatId: 'c1', localId: 'l1' }).chats.c1!.messages[0]!.status).toBe(
      'pending',
    );
    expect(chatReducer(s, { type: 'send/discard', chatId: 'c1', localId: 'l1' }).chats.c1!.messages).toHaveLength(0);
  });

  it('merges history with messages already on screen, sorted by time', () => {
    const s = run([
      open,
      { type: 'send/start', chatId: 'c1', localId: 'l1', text: 'new', now: 9000 },
      {
        type: 'history/loaded',
        chatId: 'c1',
        messages: [
          { id: 'h2', chatId: 'c1', text: 'b', timestamp: 3000, direction: 'out', status: 'read' },
          { id: 'h1', chatId: 'c1', text: 'a', timestamp: 2000, direction: 'in' },
        ],
      },
    ]);
    expect(s.chats.c1!.messages.map((m) => m.id)).toEqual(['h1', 'h2', 'l1']);
    expect(s.chats.c1!.history).toBe('loaded');
  });
});

describe('chat titles', () => {
  it('replaces the phone placeholder with the sender name from MAX', () => {
    const s = run([
      { type: 'chat/open', chatId: 'c1', title: '+7 700 123-45-67', phone: '77001234567', now: 1 },
      {
        type: 'message/received',
        title: 'Аня',
        message: { id: 'm', chatId: 'c1', text: 'hi', timestamp: 2000, direction: 'in' },
      },
    ]);
    expect(s.chats.c1!.title).toBe('Аня');
  });
});
