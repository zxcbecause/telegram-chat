import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { fake, ID, TOKEN } from './test/server';

beforeEach(() => fake.reset());

async function login(user: ReturnType<typeof userEvent.setup>, token = TOKEN) {
  await user.type(screen.getByPlaceholderText('4100123456'), ID);
  await user.type(screen.getByLabelText('apiTokenInstance'), token);
  await user.click(screen.getByRole('button', { name: 'Войти' }));
}

describe('App (end-to-end against a fake GREEN-API)', () => {
  it('shows a readable error for wrong credentials', async () => {
    const user = userEvent.setup();
    render(<App />);
    await login(user, 'wrong');
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный idInstance или apiTokenInstance');
  });

  it('logs in, creates a chat by phone, sends a message and shows the reply', async () => {
    const user = userEvent.setup();
    render(<App />);
    await login(user);

    // Create a chat by phone number.
    const phone = await screen.findByLabelText('Номер телефона или @username получателя');
    await user.type(phone, '87001234567');
    await user.click(screen.getByRole('button', { name: 'Создать чат' }));
    const chat = await screen.findByRole('region', { name: /Чат с \+7 700 123-45-67/ });

    // Send a message.
    await user.type(within(chat).getByLabelText('Текст сообщения'), 'Привет!{Enter}');
    await waitFor(() => expect(fake.sent).toEqual([{ chatId: 'chat-77001234567', message: 'Привет!' }]));
    expect(within(chat).getByText('Привет!')).toBeInTheDocument();

    // The recipient answers in Telegram → it arrives through receiveNotification.
    fake.push({
      typeWebhook: 'incomingMessageReceived',
      timestamp: Math.floor(Date.now() / 1000),
      idMessage: 'in-1',
      senderData: { chatId: 'chat-77001234567', senderName: 'Аня' },
      messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'Привет, вижу!' } },
    });
    expect(await within(chat).findByText('Привет, вижу!')).toBeInTheDocument();

    // ...and the status of our message moves to "read".
    fake.push({
      typeWebhook: 'outgoingMessageStatus',
      timestamp: Math.floor(Date.now() / 1000),
      chatId: 'chat-77001234567',
      idMessage: 'srv-1',
      status: 'read',
    });
    expect(await within(chat).findByRole('img', { name: 'Прочитано' })).toBeInTheDocument();

    // Every notification was acknowledged so the queue doesn't stall.
    await waitFor(() => expect(fake.deleted).toEqual([1, 2]));
  });

  it('tells the user when the number has no Telegram account', async () => {
    const user = userEvent.setup();
    render(<App />);
    await login(user);
    await user.type(await screen.findByLabelText('Номер телефона или @username получателя'), '77000000000');
    await user.click(screen.getByRole('button', { name: 'Создать чат' }));
    expect(
      await screen.findByText('Не нашли Telegram на этом номере (или номер скрыт настройками приватности)'),
    ).toBeInTheDocument();
  });

  it('starts a chat by @username', async () => {
    const user = userEvent.setup();
    render(<App />);
    await login(user);
    await user.type(await screen.findByLabelText('Номер телефона или @username получателя'), '@Anya_Dev');
    await user.click(screen.getByRole('button', { name: 'Создать чат' }));
    const chat = await screen.findByRole('region', { name: 'Чат с @anya_dev' });
    expect(within(chat).getByText('+7 999 111-22-33')).toBeInTheDocument();
  });
});
