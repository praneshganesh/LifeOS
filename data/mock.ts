import type { Icon3DName } from '@/components/ui/Icon3D';
import type { Space, Room } from '@/lib/spacesDefaults';

export type { Space, Room };

export type Urgency = 'urgent' | 'soon' | 'info' | 'ok';

export type AttentionItem = {
  id: string;
  title: string;
  subtitle: string;
  urgency: Urgency;
  category: string;
  icon: Icon3DName;
  daysLeft?: number;
  href?: string;
};

export type Insight = {
  id: string;
  text: string;
  icon: Icon3DName;
};

export type Asset = {
  id: string;
  name: string;
  brand: string;
  category: string;
  room: string;
  spaceId: string;
  icon: Icon3DName;
  purchaseDate: string;
  price: string;
  purchasedFrom?: string;
  manualUrl?: string;
  assignedTo?: string;
  personId?: string;
  warrantyExpiry: string;
  warrantyActive: boolean;
  condition: string;
  serial: string;
  estimatedValue: string;
  insight?: string;
  timeline: { date: string; event: string }[];
};

export const user = {
  firstName: 'You',
};

export function greetingForNow(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** @deprecated Use buildAttentionItems — kept empty for F5 */
export const attentionItems: AttentionItem[] = [];
export const insights: Insight[] = [];

/** Spaces/rooms live in SpacesContext (`lib/spacesDefaults`). */
export const spaces: Space[] = [];
export const rooms: Room[] = [];

/** @deprecated Inventory is the source of truth */
export const assets: Asset[] = [];
export const recentAssets: Asset[] = [];

export function assetsInSpace(_spaceId: string): Asset[] {
  return [];
}

export function assetsInRoom(_roomId: string): Asset[] {
  return [];
}

export const searchChips = [
  'Documents',
  'Kitchen',
  'Vehicles',
  'Warranty',
  'Family',
];

export const recentSearches: string[] = [];

export const aiSuggestions = [
  'Do I still have warranty on my TV?',
  'Find my passport.',
  'What did I spend on food?',
  'When did I last service the coffee machine?',
];

export const captureSteps = [
  'Brand',
  'Model',
  'Purchase Date',
  'Purchase Price',
  'Warranty',
  'Serial Number',
];

export function urgencyTone(urgency: Urgency) {
  switch (urgency) {
    case 'urgent':
      return { fg: '#D1433B', bg: 'rgba(209, 67, 59, 0.12)' };
    case 'soon':
      return { fg: '#C47B1E', bg: 'rgba(196, 123, 30, 0.14)' };
    case 'info':
      return { fg: '#3D6F99', bg: 'rgba(61, 111, 153, 0.12)' };
    case 'ok':
      return { fg: '#0F5C52', bg: 'rgba(15, 92, 82, 0.12)' };
  }
}
