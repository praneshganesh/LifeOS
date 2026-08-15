import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  buildExpenseSummary,
  buildHabitSummary,
  buildInventorySummary,
  buildLastDoneSummary,
  buildSubscriptionSummary,
} from '@/lib/chat/prompt';
import { normalizeAgentResponse } from '@/lib/chat/applyActions';
import type {
  ChatAgentResponse,
  ChatMessage,
  ChatSessionFocus,
  InventorySummaryItem,
} from '@/lib/chat/types';

const DEFAULT_URL = 'http://localhost:8787/chat';
const FETCH_TIMEOUT_MS = 25_000;

export class ChatAgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatAgentError';
  }
}

function looksLikeLoopbackChatUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url);
  }
}

function isPrivateLanHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h.endsWith('.local')) return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(h)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(h)) return true;
  const m = h.match(/^172\.(\d+)\./);
  if (m) {
    const n = Number(m[1]);
    return n >= 16 && n <= 31;
  }
  return false;
}

function chatApiUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_CHAT_API_URL?.trim();
  let url = fromEnv || DEFAULT_URL;

  // Browsers often hang fetches from localhost → LAN IP (Private Network Access).
  // Keep LAN for physical devices; on web prefer loopback on the same machine.
  if (Platform.OS === 'web') {
    try {
      const parsed = new URL(url);
      if (isPrivateLanHost(parsed.hostname)) {
        parsed.hostname = '127.0.0.1';
        url = parsed.toString();
      }
    } catch {
      /* keep as-is */
    }
  }

  return url;
}

function isPhysicalDevice(): boolean {
  return Boolean(Constants.isDevice);
}

/**
 * Call the LifeOS chat proxy. Inventory stays on-device; only text + summary leave the device.
 */
export async function runChatAgent(params: {
  messages: ChatMessage[];
  inventory: InventorySummaryItem[] | Array<{
    id: string;
    name: string;
    brand: string;
    room: string;
    category: string;
    price?: string;
    purchasedFrom?: string;
    purchaseDate?: string;
    warrantyExpiry?: string;
    warrantyActive?: boolean;
    serial?: string;
    assignedTo?: string;
    createdAt?: string;
    timeline?: { date: string; event: string }[];
  }>;
  lastDone?: Array<{
    label: string;
    lastDoneAt?: string;
    remindAt?: string;
    inventoryItemId?: string;
    itemName?: string;
  }>;
  expenses?: Array<{
    id: string;
    title: string;
    amount: number;
    currency: string;
    category: string;
    date: string;
    merchant?: string;
  }>;
  habits?: Array<{
    id: string;
    title: string;
    category: string;
    streak: number;
    doneToday: boolean;
    rate30: number;
  }>;
  subscriptions?: Array<{
    id: string;
    title: string;
    amount: number;
    currency: string;
    cycle: string;
    renewsOn: string;
    category: string;
    provider?: string;
  }>;
  session?: ChatSessionFocus;
  household?: Array<{ id: string; name: string; relation: string; role: string }>;
}): Promise<ChatAgentResponse> {
  const url = chatApiUrl();
  const inventorySummary = buildInventorySummary(params.inventory);
  const lastDoneSummary = buildLastDoneSummary(params.lastDone ?? []);
  const expensesSummary = buildExpenseSummary(params.expenses ?? []);
  const habitsSummary = buildHabitSummary(params.habits ?? []);
  const subscriptionsSummary = buildSubscriptionSummary(params.subscriptions ?? []);
  const messages = params.messages.slice(-12).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  if (
    Platform.OS !== 'web' &&
    isPhysicalDevice() &&
    looksLikeLoopbackChatUrl(url)
  ) {
    throw new ChatAgentError(
      'Talk can’t reach chat-api from this phone via localhost. Set EXPO_PUBLIC_CHAT_API_URL to http://<your-mac-lan-ip>:8787/chat, run npm run chat-api, and restart Expo. Inventory stays on this device.'
    );
  }

  let res: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = process.env.EXPO_PUBLIC_CHAT_API_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        messages,
        inventorySummary,
        lastDoneSummary,
        expensesSummary,
        habitsSummary,
        subscriptionsSummary,
        session: params.session ?? {},
        household: params.household ?? [],
      }),
    });
  } catch (err) {
    const aborted =
      (err instanceof Error && err.name === 'AbortError') ||
      (typeof DOMException !== 'undefined' &&
        err instanceof DOMException &&
        err.name === 'AbortError');
    const hosted = url.startsWith('https://');
    throw new ChatAgentError(
      aborted
        ? hosted
          ? 'Talk timed out waiting for the chat service. Try again in a moment — inventory stays on this device.'
          : 'Talk timed out waiting for the chat service. Is npm run chat-api running? Your inventory stays on this device.'
        : hosted
          ? 'Talk can’t reach the chat service right now. Check your connection. Inventory stays on this device.'
          : 'Talk can’t reach the chat service right now. Check your connection, or start the local chat API. Your inventory stays on this device.'
    );
  } finally {
    clearTimeout(timer);
  }

  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    reply?: string;
    actions?: unknown;
  };

  if (!res.ok) {
    throw new ChatAgentError(
      data.error ||
        'Chat service returned an error. Try again in a moment — or use Capture offline.'
    );
  }

  return normalizeAgentResponse(data);
}
