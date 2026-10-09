import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import App from './App';
import { incoming, openChat, sidebar, startApp } from './test/helpers';
import { API, fake, ID, server, TOKEN } from './test/server';

beforeEach(() => fake.reset());

describe('login screen', () => {
  it('keeps "Войти" disabled until both fields look valid and strips non-digits from idInstance', async () => {
    const user = userEvent.setup();
    render(<App />);
    const id = screen.getByPlaceholderText('4100123456');
    const submit = screen.getByRole('button', { name: 'Войти' });
    expect(submit).toBeDisabled();
    await user.type(id, '41a00-123 456');
    expect(id).toHaveValue('4100123456');
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('apiTokenInstance'), 'x');
    expect(submit).toBeEnabled();
  });

  it('shows and hides the token', async () => {
    const user = userEvent.setup();
    render(<App />);
    const token = screen.getByLabelText('apiTokenInstance');
    expect(token).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Показать токен' }));
    expect(token).toHaveAttribute('type', 'text');
  });

  it('refuses to send the token to a host outside GREEN-API', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByPlaceholderText('4100123456'), ID);
    await user.type(screen.getByLabelText('apiTokenInstance'), TOKEN);
    await user.click(screen.getByRole('button', { name: /Дополнительно/ }));
    const url = await screen.findByLabelText('API URL');
    await user.clear(url);
    await user.type(url, 'https://evil.example.com');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('токен нельзя отправлять на другие сайты');
  });

  it.each([
    ['notAuthorized', 'Отсканируйте QR-код'],
    ['starting', 'ещё запускается'],
    ['blocked', 'состояние: blocked'],
  ])('explains the instance state "%s"', async (state, text) => {
    fake.state = state;
    await startApp();
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
  });

  it('explains a network failure', async () => {
    server.use(http.get(`${API}/waInstance${ID}/getStateInstance/:token`, () => HttpResponse.error()));
    await startApp();
    expect(await screen.findByRole('alert')).toHaveTextContent('Нет соединения с GREEN-API');
  });
});

describe('session and "remember me"', () => {
  it('without "remember me" nothing is written to the browser storage', async () => {
    const { user } = await startApp();
    await openChat(user);
    await new Promise((r) => setTimeout(r, 400)); // persistence is debounced
    expect(Object.keys(localStorage).filter((k) => !k.endsWith(':theme'))).toEqual([]);
  });

  it('with "remember me" the session and chats survive a reload; logout wipes them', async () => {
    const { user, unmount } = await startApp({ remember: true });
    const chat = await openChat(user);
    await user.type(within(chat).getByLabelText('Текст сообщения'), 'Черновик на потом');
    await new Promise((r) => setTimeout(r, 400));
    unmount();

    // "Reload": a fresh App starts already logged in with the chat and its draft.
    const user2 = userEvent.setup();
    render(<App />);
    expect(await sidebar().findByText('+7 700 123-45-67')).toBeInTheDocument();
    expect(sidebar().getByText('Черновик:')).toBeInTheDocument();

    await user2.click(screen.getByRole('button', { name: 'Выйти' }));
    expect(await screen.findByRole('button', { name: 'Войти' })).toBeInTheDocument();
    expect(Object.keys(localStorage).filter((k) => !k.endsWith(':theme'))).toEqual([]);
  });

  it('ignores a stored session that points outside GREEN-API (tampered storage)', () => {
    localStorage.setItem(
      'max-chat:session',
      JSON.stringify({
        credentials: { idInstance: ID, apiTokenInstance: TOKEN, apiUrl: 'https://evil.example.com' },
        remember: true,
      }),
    );
    render(<App />);
    expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument();
  });

  it('survives corrupted saved chats instead of crashing', async () => {
    localStorage.setItem(
      'max-chat:session',
      JSON.stringify({ credentials: { idInstance: ID, apiTokenInstance: TOKEN, apiUrl: API }, remember: true }),
    );
    localStorage.setItem(`max-chat:chats:${ID}`, JSON.stringify({ broken: { chatId: 'x', messages: 'oops' }, n: null }));
    render(<App />);
    expect(await screen.findByText('Пока нет чатов')).toBeInTheDocument();
  });
});

describe('theme', () => {
  it('cycles system → light → dark and remembers the choice', async () => {
    const { user } = await startApp();
    const toggle = await screen.findByRole('button', { name: /Тема: как в системе/ });
    await user.click(toggle);
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    await user.click(screen.getByRole('button', { name: /Тема: светлая/ }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem('max-chat:theme')).toBe('"dark"');
    await user.click(screen.getByRole('button', { name: /Тема: тёмная/ }));
    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });
});

describe('connection indicator', () => {
  it('shows "В сети" while polling works and a warning when the token stops working', async () => {
    await startApp();
    expect(await screen.findByText('В сети')).toBeInTheDocument();
    server.use(
      http.get(`${API}/waInstance${ID}/receiveNotification/:token`, () => new HttpResponse(null, { status: 401 })),
    );
    // The current long poll finishes, the next one fails with 401.
    fake.push(incoming('c', 'x', 'wake up'));
    expect(await screen.findByText('Неверные данные доступа', {}, { timeout: 3000 })).toBeInTheDocument();
  });
});

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

// Silence the expected "Failed to fetch" noise from the network-failure test.
beforeAll(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
afterAll(() => vi.restoreAllMocks());
