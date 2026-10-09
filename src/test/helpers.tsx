import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { ID, TOKEN } from './server';

export type User = ReturnType<typeof userEvent.setup>;

/** Renders the app and logs in with the fake instance. */
export async function startApp(opts: { remember?: boolean; token?: string } = {}) {
  const user = userEvent.setup();
  const utils = render(<App />);
  await user.type(screen.getByPlaceholderText('4100123456'), ID);
  await user.type(screen.getByLabelText('apiTokenInstance'), opts.token ?? TOKEN);
  if (opts.remember) await user.click(screen.getByText('Запомнить меня на этом устройстве'));
  await user.click(screen.getByRole('button', { name: 'Войти' }));
  return { user, ...utils };
}

/** Opens (creates) a chat by phone or @username and returns its region. */
export async function openChat(user: User, recipient = '77001234567') {
  await user.type(await screen.findByLabelText('Номер телефона или @username получателя'), recipient);
  await user.click(screen.getByRole('button', { name: 'Создать чат' }));
  return screen.findByRole('region', { name: /Чат с/ });
}

export function sidebar() {
  return within(screen.getByRole('complementary', { name: 'Чаты' }));
}

export const nowSec = () => Math.floor(Date.now() / 1000);

export function incoming(chatId: string, idMessage: string, text: string, extra: Record<string, unknown> = {}) {
  return {
    typeWebhook: 'incomingMessageReceived' as const,
    timestamp: nowSec(),
    idMessage,
    senderData: { chatId, chatType: 'user', senderName: 'Аня', chatName: 'Аня' },
    messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: text } },
    ...extra,
  };
}
