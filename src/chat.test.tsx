import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { incoming, nowSec, openChat, sidebar, startApp } from './test/helpers';
import { API, fake, ID, server } from './test/server';

const CHAT = 'chat-77001234567';
const base = `${API}/waInstance${ID}`;

beforeEach(() => fake.reset());

describe('sending', () => {
  it('keeps the text when sending fails, and "Повторить" delivers it', async () => {
    server.use(http.post(`${base}/sendMessage/:token`, () => new HttpResponse(null, { status: 502 }), { once: true }));
    const { user } = await startApp();
    const chat = await openChat(user);

    await user.type(within(chat).getByLabelText('Текст сообщения'), 'Важное{Enter}');
    expect(await within(chat).findByText('Сервер GREEN-API временно недоступен')).toBeInTheDocument();
    expect(within(chat).getByRole('img', { name: 'Не отправлено' })).toBeInTheDocument();

    await user.click(within(chat).getByRole('button', { name: /Повторить/ }));
    expect(await within(chat).findByRole('img', { name: 'Отправлено' })).toBeInTheDocument();
    expect(fake.sent).toEqual([{ chatId: CHAT, message: 'Важное' }]);
  });

  it('"Удалить" drops a message that never went out, without calling the API', async () => {
    server.use(http.post(`${base}/sendMessage/:token`, () => HttpResponse.error(), { once: true }));
    const { user } = await startApp();
    const chat = await openChat(user);
    await user.type(within(chat).getByLabelText('Текст сообщения'), 'Черновое{Enter}');
    await user.click(await within(chat).findByRole('button', { name: 'Удалить' }));
    await waitFor(() => expect(within(chat).queryByText('Черновое')).not.toBeInTheDocument());
    expect(fake.deletedMessages).toEqual([]);
  });

  it('Shift+Enter makes a new line, empty or whitespace text is not sent', async () => {
    const { user } = await startApp();
    const chat = await openChat(user);
    const input = within(chat).getByLabelText('Текст сообщения');

    await user.type(input, '   {Enter}');
    await user.type(input, 'строка 1{Shift>}{Enter}{/Shift}строка 2');
    expect(input).toHaveValue('   строка 1\nстрока 2');
    expect(fake.sent).toEqual([]);

    await user.click(within(chat).getByRole('button', { name: 'Отправить' }));
    await waitFor(() => expect(fake.sent).toEqual([{ chatId: CHAT, message: 'строка 1\nстрока 2' }]));
  });

  it('blocks messages over the Telegram limit of 4096 characters and shows a counter', async () => {
    const { user } = await startApp();
    const chat = await openChat(user);
    const input = within(chat).getByLabelText('Текст сообщения');
    fireEvent.change(input, { target: { value: 'я'.repeat(4097) } });
    expect(within(chat).getByText('4097 / 4096')).toBeInTheDocument();
    expect(within(chat).queryByRole('button', { name: 'Отправить' })).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(fake.sent).toEqual([]);
  });
});

describe('replies', () => {
  it('reply from the right-click menu sends quotedMessageId; Esc cancels a reply', async () => {
    const { user } = await startApp();
    const chat = await openChat(user);
    fake.push(incoming(CHAT, 'in-1', 'Во сколько встречаемся?'));
    const bubble = await within(chat).findByText('Во сколько встречаемся?');

    fireEvent.contextMenu(bubble);
    // Not our message: replying is allowed, deleting is not.
    expect(screen.queryByRole('menuitem', { name: 'Удалить у всех' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Ответить' }));
    expect(within(chat).getByRole('button', { name: 'Отменить ответ' })).toBeInTheDocument();

    await user.type(within(chat).getByLabelText('Текст сообщения'), 'В 11{Enter}');
    await waitFor(() =>
      expect(fake.sent).toEqual([{ chatId: CHAT, message: 'В 11', quotedMessageId: 'in-1' }]),
    );

    // The sent reply shows the quote; clicking it scrolls to the original.
    const quote = await within(chat).findByRole('button', { name: /Во сколько встречаемся/ });
    await user.click(quote);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();

    fireEvent.doubleClick(bubble);
    expect(within(chat).getByRole('button', { name: 'Отменить ответ' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(within(chat).queryByRole('button', { name: 'Отменить ответ' })).not.toBeInTheDocument(),
    );
  });
});

describe('incoming traffic', () => {
  it('a new person writing creates a chat with an unread counter that clears when opened', async () => {
    const { user } = await startApp();
    await openChat(user); // another chat is open
    fake.push(incoming('chat-new', 'n1', 'Здравствуйте!', { senderData: { chatId: 'chat-new', chatType: 'user', senderName: 'Борис' } }));
    fake.push(incoming('chat-new', 'n2', 'Вы тут?', { senderData: { chatId: 'chat-new', chatType: 'user', senderName: 'Борис' } }));

    expect(await sidebar().findByLabelText('2 непрочитанных')).toBeInTheDocument();
    await user.click(sidebar().getByText('Борис'));
    await waitFor(() => expect(sidebar().queryByLabelText('2 непрочитанных')).not.toBeInTheDocument());
    expect(await screen.findByRole('region', { name: 'Чат с Борис' })).toBeInTheDocument();
  });

  it('messages from groups and channels do not flood the chat list', async () => {
    await startApp();
    await screen.findByRole('complementary', { name: 'Чаты' });
    fake.push(incoming('-100500', 'g1', 'Всем привет', { senderData: { chatId: '-100500', chatType: 'supergroup', chatName: 'Флудилка' } }));
    fake.push(incoming('chat-ok', 'p1', 'Личное', { senderData: { chatId: 'chat-ok', chatType: 'user', senderName: 'Вера' } }));
    expect(await sidebar().findByText('Вера')).toBeInTheDocument();
    expect(sidebar().queryByText('Флудилка')).not.toBeInTheDocument();
  });

  it('shows messages I sent from my phone in the chat', async () => {
    const { user } = await startApp();
    const chat = await openChat(user);
    fake.push({ ...incoming(CHAT, 'ph1', 'С телефона'), typeWebhook: 'outgoingMessageReceived' });
    const text = await within(chat).findByText('С телефона');
    expect(text.closest('.msg')).toHaveClass('msg--out');
  });

  it('explains a "noAccount" status on my message', async () => {
    const { user } = await startApp();
    const chat = await openChat(user);
    await user.type(within(chat).getByLabelText('Текст сообщения'), 'Тест{Enter}');
    await within(chat).findByRole('img', { name: 'Отправлено' });
    fake.push({ typeWebhook: 'outgoingMessageStatus', timestamp: nowSec(), chatId: CHAT, idMessage: 'srv-1', status: 'noAccount' });
    expect(await within(chat).findByText(/нет Telegram/)).toBeInTheDocument();
  });

  it('when the instance gets logged out of Telegram, sending is disabled with an explanation', async () => {
    const { user } = await startApp();
    const chat = await openChat(user);
    fake.push({ typeWebhook: 'stateInstanceChanged', timestamp: nowSec(), stateInstance: 'notAuthorized' });
    expect(await within(chat).findByRole('alert')).toHaveTextContent('Инстанс не авторизован в Telegram');
    expect(within(chat).getByLabelText('Текст сообщения')).toBeDisabled();
  });
});

describe('chat list', () => {
  it('keeps a draft per chat and marks it in the list', async () => {
    const { user } = await startApp();
    const first = await openChat(user, '77001234567');
    await user.type(within(first).getByLabelText('Текст сообщения'), 'не дописал');
    await openChat(user, '@anya_dev');
    expect(sidebar().getByText('Черновик:')).toBeInTheDocument();

    await user.click(sidebar().getByText('+7 700 123-45-67'));
    const back = await screen.findByRole('region', { name: /Чат с \+7 700/ });
    expect(within(back).getByLabelText('Текст сообщения')).toHaveValue('не дописал');
  });

  it('does not ask GREEN-API about the same missing number twice in a row', async () => {
    const { user } = await startApp();
    const field = await screen.findByLabelText('Номер телефона или @username получателя');
    for (let i = 0; i < 2; i++) {
      await user.clear(field);
      await user.type(field, '77000000000');
      await user.click(screen.getByRole('button', { name: 'Создать чат' }));
      await screen.findByText(/Не нашли Telegram/);
    }
    expect(fake.checks).toBe(1);
  });

  it('validates the recipient before any request', async () => {
    const { user } = await startApp();
    await user.type(await screen.findByLabelText('Номер телефона или @username получателя'), '@ab');
    await user.click(screen.getByRole('button', { name: 'Создать чат' }));
    expect(await screen.findByText('Некорректный @username')).toBeInTheDocument();
    expect(fake.checks).toBe(0);
  });

  it('the "back" button (phones) returns to the list', async () => {
    const { user } = await startApp();
    await openChat(user);
    await user.click(screen.getByRole('button', { name: 'Назад к списку чатов' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: /Чат с/ })).not.toBeInTheDocument());
    expect(await screen.findByText(/Выберите чат/)).toBeInTheDocument();
  });

  it('removes a chat via the header button too', async () => {
    const { user } = await startApp();
    const chat = await openChat(user);
    await user.click(within(chat).getByRole('button', { name: 'Удалить чат' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Удалить чат' }));
    await waitFor(() => expect(sidebar().queryByText('+7 700 123-45-67')).not.toBeInTheDocument());
  });
});

describe('deleting messages', () => {
  it('"только у меня" asks GREEN-API to delete on my side only', async () => {
    const { user } = await startApp();
    const chat = await openChat(user);
    await user.type(within(chat).getByLabelText('Текст сообщения'), 'Лишнее{Enter}');
    await within(chat).findByRole('img', { name: 'Отправлено' });
    fireEvent.contextMenu(within(chat).getByText('Лишнее'));
    await user.click(screen.getByRole('menuitem', { name: 'Удалить только у меня' }));
    await waitFor(() => expect(within(chat).queryByText('Лишнее')).not.toBeInTheDocument());
    expect(fake.deletedMessages).toEqual([{ chatId: CHAT, idMessage: 'srv-1', onlySenderDelete: true }]);
  });

  it('keeps the message and explains when deletion fails', async () => {
    server.use(
      http.post(`${base}/deleteMessage/:token`, () => HttpResponse.text('Message by id not found', { status: 400 })),
    );
    const { user } = await startApp();
    const chat = await openChat(user);
    await user.type(within(chat).getByLabelText('Текст сообщения'), 'Останусь{Enter}');
    await within(chat).findByRole('img', { name: 'Отправлено' });
    fireEvent.contextMenu(within(chat).getByText('Останусь'));
    await user.click(screen.getByRole('menuitem', { name: 'Удалить у всех' }));
    expect(await within(chat).findByText('Сообщение не найдено — возможно, оно уже удалено')).toBeInTheDocument();
    expect(within(chat).getByText('Останусь')).toBeInTheDocument();
  });

  it('closes the menu on Escape or a click outside', async () => {
    const { user } = await startApp();
    const chat = await openChat(user);
    await user.type(within(chat).getByLabelText('Текст сообщения'), 'Меню{Enter}');
    await within(chat).findByRole('img', { name: 'Отправлено' });

    fireEvent.contextMenu(within(chat).getByText('Меню'));
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());

    fireEvent.contextMenu(within(chat).getByText('Меню'));
    await screen.findByRole('menu');
    await new Promise((r) => setTimeout(r, 10)); // the outside-click listener attaches on the next tick
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });
});

describe('history', () => {
  it('shows an error with "Повторить" when history fails to load, and recovers', async () => {
    let fail = true;
    server.use(
      http.post(`${base}/getChatHistory/:token`, () =>
        fail ? new HttpResponse(null, { status: 500 }) : HttpResponse.json([]),
      ),
    );
    const { user } = await startApp();
    const chat = await openChat(user);
    expect(await within(chat).findByText(/Не удалось загрузить историю/)).toBeInTheDocument();
    fail = false;
    await user.click(within(chat).getByRole('button', { name: 'Повторить' }));
    expect(await within(chat).findByText('Здесь пока пусто')).toBeInTheDocument();
  });
});

describe('instance settings banner', () => {
  it('shows an error when GREEN-API refuses to save the settings, and can be dismissed', async () => {
    fake.settings.incomingWebhook = 'no';
    server.use(http.post(`${base}/setSettings/:token`, () => HttpResponse.json({ saveSettings: false })));
    const { user } = await startApp();
    const banner = await screen.findByRole('alert');
    await user.click(within(banner).getByRole('button', { name: 'Включить уведомления' }));
    expect(await within(banner).findByText('GREEN-API не сохранил настройки')).toBeInTheDocument();
    await user.click(within(banner).getByRole('button', { name: 'Скрыть' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});

