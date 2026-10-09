import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { demoTiming } from './demoClient';

beforeEach(() => {
  demoTiming.scale = 0.01; // run the imitation ~100× faster
});

afterEach(() => {
  demoTiming.scale = 1;
});

describe('Demo mode', () => {
  it('opens from the login screen with seeded chats and unread counters', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Посмотреть демо без инстанса' }));

    const list = await screen.findByRole('complementary', { name: 'Чаты' });
    for (const name of ['Анна Смирнова', 'Служба доставки', 'Эхо-бот', 'Проверка ошибок']) {
      expect(await within(list).findByText(name)).toBeInTheDocument();
    }
    expect(await within(list).findByLabelText('3 непрочитанных')).toBeInTheDocument();
  });

  it('echo bot: message goes through all statuses and the answer arrives', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Посмотреть демо без инстанса' }));
    await user.click(await screen.findByText('Эхо-бот'));

    const chat = await screen.findByRole('region', { name: 'Чат с Эхо-бот' });
    await within(chat).findByText(/Напиши что угодно/);
    await user.type(within(chat).getByLabelText('Текст сообщения'), 'Проверка связи{Enter}');

    expect(await within(chat).findByText('Эхо: Проверка связи')).toBeInTheDocument();
    expect(within(chat).getByRole('img', { name: 'Прочитано' })).toBeInTheDocument();
  });

  it('flaky chat: first attempt fails, retry succeeds', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Посмотреть демо без инстанса' }));
    await user.click(await screen.findByText('Проверка ошибок'));

    const chat = await screen.findByRole('region', { name: 'Чат с Проверка ошибок' });
    await within(chat).findByText(/первая попытка/);
    await user.type(within(chat).getByLabelText('Текст сообщения'), 'Важное{Enter}');

    await user.click(await within(chat).findByRole('button', { name: /Повторить/ }));
    expect(await within(chat).findByText('Со второй попытки дошло ✅')).toBeInTheDocument();
    await waitFor(() => expect(within(chat).queryByRole('button', { name: /Повторить/ })).not.toBeInTheDocument());
  });
});
