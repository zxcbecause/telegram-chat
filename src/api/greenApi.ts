import type {
  CheckAccountResponse,
  Credentials,
  HistoryItem,
  Notification,
  SendMessageRequest,
  SendMessageResponse,
  StateInstanceResponse,
  InstanceSettings,
} from './types';

/** Error with an HTTP status attached, so the UI can show a precise message. */
export class GreenApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GreenApiError';
    this.status = status;
  }
}

/**
 * Best guess of the instance host. GREEN-API places instances on clusters
 * named after the first 4 digits of idInstance (e.g. 3100xxxxxx → 3100).
 * The exact value is shown in the GREEN-API console, so the UI lets the user
 * override it.
 */
export function guessApiUrl(idInstance: string): string {
  const cluster = idInstance.trim().slice(0, 4);
  return /^\d{4}$/.test(cluster) ? `https://${cluster}.api.green-api.com` : 'https://api.green-api.com';
}

type Method = 'GET' | 'POST' | 'DELETE';

/**
 * Thin typed wrapper over the GREEN-API HTTP API.
 * Every call accepts an AbortSignal so React effects can cancel requests on unmount.
 */
export class GreenApiClient {
  private readonly base: string;
  private readonly token: string;

  constructor(credentials: Credentials) {
    const apiUrl = credentials.apiUrl.trim().replace(/\/+$/, '');
    this.base = `${apiUrl}/waInstance${credentials.idInstance.trim()}`;
    this.token = credentials.apiTokenInstance.trim();
  }

  private async request<T>(
    method: Method,
    path: string,
    {
      body,
      query,
      suffix,
      signal,
    }: { body?: unknown; query?: string; suffix?: string; signal?: AbortSignal } = {},
  ): Promise<T> {
    const url = `${this.base}/${path}/${this.token}${suffix ? `/${suffix}` : ''}${query ? `?${query}` : ''}`;
    const res = await fetch(url, {
      method,
      signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!res.ok) {
      throw new GreenApiError(describeHttpError(res.status, await safeText(res)), res.status);
    }

    const text = await res.text();
    // receiveNotification returns an empty body (or "null") when the queue is empty.
    if (!text || text === 'null') return null as T;
    return JSON.parse(text) as T;
  }

  getStateInstance(signal?: AbortSignal) {
    return this.request<StateInstanceResponse>('GET', 'getStateInstance', { signal });
  }

  sendMessage(payload: SendMessageRequest, signal?: AbortSignal) {
    return this.request<SendMessageResponse>('POST', 'sendMessage', { body: payload, signal });
  }

  /** Resolves a Telegram chatId by phone number (digits) or @username. */
  async checkAccount(target: { phoneNumber: string } | { username: string }, signal?: AbortSignal) {
    const body = 'phoneNumber' in target ? { phoneNumber: Number(target.phoneNumber) } : { username: target.username };
    const res = await this.request<
      CheckAccountResponse & { status?: boolean; reason?: string; data?: { reason?: string } }
    >('POST', 'checkAccount', { body, signal });
    // The API reports some failures with 200 + { status: false, reason }.
    if (res && res.status === false) {
      throw new GreenApiError(translateReason(res.reason ?? res.data?.reason), 200);
    }
    return res;
  }

  getSettings(signal?: AbortSignal) {
    return this.request<InstanceSettings>('GET', 'getSettings', { signal });
  }

  /** Changes instance settings. GREEN-API restarts the instance; takes effect within ~5 minutes. */
  setSettings(settings: InstanceSettings, signal?: AbortSignal) {
    return this.request<{ saveSettings: boolean }>('POST', 'setSettings', { body: settings, signal });
  }

  getChatHistory(chatId: string, count = 50, signal?: AbortSignal) {
    return this.request<HistoryItem[]>('POST', 'getChatHistory', { body: { chatId, count }, signal });
  }

  /** Long polling: resolves after a notification arrives or `timeoutSec` passes (then null). */
  receiveNotification(timeoutSec = 20, signal?: AbortSignal) {
    return this.request<Notification | null>('GET', 'receiveNotification', {
      query: `receiveTimeout=${timeoutSec}`,
      signal,
    });
  }

  /** Acknowledges a notification: DELETE /deleteNotification/{token}/{receiptId}. */
  deleteNotification(receiptId: number, signal?: AbortSignal) {
    return this.request<{ result: boolean }>('DELETE', 'deleteNotification', {
      suffix: String(receiptId),
      signal,
    });
  }
}

/**
 * What the UI needs from a messenger backend. The real GreenApiClient and the
 * in-browser DemoClient both implement it, so the app doesn't know the difference.
 */
export type ApiClient = Pick<
  GreenApiClient,
  | 'getStateInstance'
  | 'sendMessage'
  | 'checkAccount'
  | 'getChatHistory'
  | 'receiveNotification'
  | 'deleteNotification'
  | 'getSettings'
  | 'setSettings'
>;

/** What the chat needs to receive messages live through the HTTP API. */
export const REQUIRED_SETTINGS = {
  webhookUrl: '',
  incomingWebhook: 'yes',
  outgoingWebhook: 'yes',
  outgoingMessageWebhook: 'yes',
  outgoingAPIMessageWebhook: 'yes',
} as const satisfies InstanceSettings;

const SETTING_NAMES: Record<keyof typeof REQUIRED_SETTINGS, string> = {
  webhookUrl: 'задан Webhook URL — HTTP API не отдаёт уведомления',
  incomingWebhook: 'выключены уведомления о входящих сообщениях',
  outgoingWebhook: 'выключены статусы отправленных сообщений',
  outgoingMessageWebhook: 'выключены уведомления о сообщениях, отправленных с телефона',
  outgoingAPIMessageWebhook: 'выключены уведомления о сообщениях, отправленных через API',
};

/** Human-readable list of settings that stop messages from arriving live. */
export function settingsProblems(s: InstanceSettings | null | undefined): string[] {
  if (!s) return [];
  return (Object.keys(REQUIRED_SETTINGS) as Array<keyof typeof REQUIRED_SETTINGS>)
    .filter((key) => (key === 'webhookUrl' ? !!s.webhookUrl : s[key] !== 'yes'))
    .map((key) => SETTING_NAMES[key]);
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function translateReason(reason?: string): string {
  if (!reason) return 'Не удалось выполнить запрос';
  if (reason.includes('not authorized') || reason.includes('starting')) {
    return 'Инстанс не авторизован в Telegram или ещё запускается';
  }
  if (reason.includes('limit')) return 'Слишком много проверок номеров. Telegram просит подождать';
  return reason;
}

function describeHttpError(status: number, body: string): string {
  switch (status) {
    case 400:
      return body.includes('webhook')
        ? 'В настройках инстанса задан Webhook URL — очистите его, чтобы получать сообщения'
        : `Некорректный запрос${body ? `: ${body.slice(0, 120)}` : ''}`;
    case 401:
    case 403:
      return 'Неверный idInstance или apiTokenInstance';
    case 404:
      return 'Инстанс не найден. Проверьте API URL и idInstance';
    case 429:
      return 'Слишком много запросов, подождите немного';
    case 466:
      return 'Достигнут лимит тарифа GREEN-API';
    case 469:
      return 'Telegram временно ограничил проверку номеров, попробуйте позже';
    default:
      return status >= 500 ? 'Сервер GREEN-API временно недоступен' : `Ошибка ${status}`;
  }
}
