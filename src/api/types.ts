/**
 * Types for the subset of the GREEN-API (MAX, v3) HTTP API used by this app.
 * Docs: https://green-api.com/v3/docs/api/
 */

export interface Credentials {
  apiUrl: string;
  idInstance: string;
  apiTokenInstance: string;
}

export type InstanceState =
  | 'authorized'
  | 'notAuthorized'
  | 'blocked'
  | 'starting'
  | 'yellowCard'
  | string;

export interface StateInstanceResponse {
  stateInstance: InstanceState;
}

export interface SendMessageRequest {
  chatId: string;
  message: string;
  quotedMessageId?: string;
}

export interface SendMessageResponse {
  idMessage: string;
}

export interface CheckAccountResponse {
  exist: boolean;
  chatId: string;
  fromCache?: boolean;
}

export interface QuotedMessage {
  stanzaId: string;
  participant?: string;
  typeMessage?: string;
  textMessage?: string;
}

export interface MessageData {
  typeMessage: string;
  textMessageData?: { textMessage: string };
  extendedTextMessageData?: { text: string };
  quotedMessage?: QuotedMessage;
}

export interface SenderData {
  chatId: string;
  chatName?: string;
  sender?: string;
  senderName?: string;
  senderContactName?: string;
  senderPhoneNumber?: number;
}

interface BaseWebhook {
  typeWebhook: string;
  timestamp: number;
}

export interface MessageWebhook extends BaseWebhook {
  typeWebhook: 'incomingMessageReceived' | 'outgoingMessageReceived' | 'outgoingAPIMessageReceived';
  idMessage: string;
  senderData: SenderData;
  messageData: MessageData;
}

export type OutgoingStatus = 'sent' | 'delivered' | 'read' | 'failed' | 'noAccount' | 'notInGroup';

export interface StatusWebhook extends BaseWebhook {
  typeWebhook: 'outgoingMessageStatus';
  chatId: string;
  idMessage: string;
  status: OutgoingStatus;
  description?: string;
}

export interface StateWebhook extends BaseWebhook {
  typeWebhook: 'stateInstanceChanged';
  stateInstance: InstanceState;
}

export type Webhook = MessageWebhook | StatusWebhook | StateWebhook | (BaseWebhook & Record<string, unknown>);

export interface Notification {
  receiptId: number;
  body: Webhook;
}

export interface HistoryItem {
  type: 'incoming' | 'outgoing';
  idMessage: string;
  timestamp: number;
  typeMessage: string;
  chatId: string;
  textMessage?: string;
  extendedTextMessage?: { text: string };
  statusMessage?: string;
  senderName?: string;
  quotedMessage?: QuotedMessage;
}
