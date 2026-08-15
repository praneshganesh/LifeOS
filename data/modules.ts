import type { Icon3DName } from '@/components/ui/Icon3D';

export type Subscription = {
  id: string;
  name: string;
  provider: string;
  cost: number;
  currency: string;
  cycle: 'monthly' | 'yearly';
  renewsOn: string;
  autoRenew: boolean;
  cancelNoticeDays: number;
  category: string;
  icon: Icon3DName;
  notes?: string;
};

export type InsurancePolicy = {
  id: string;
  name: string;
  category: 'home' | 'vehicle' | 'medical' | 'travel' | 'life';
  provider: string;
  policyNumber: string;
  premium: string;
  renewsOn: string;
  status: 'active' | 'expiring' | 'expired';
  linkedTo?: string;
  icon: Icon3DName;
  claims: number;
};

export type FamilyMember = {
  id: string;
  name: string;
  role: 'adult' | 'child' | 'parent' | 'pet';
  relation: string;
  avatarLetter: string;
  documents: number;
  devices: number;
  medicalNotes?: string;
  icon: Icon3DName;
};

export type Purchase = {
  id: string;
  name: string;
  store: string;
  date: string;
  price: string;
  paymentMethod: string;
  assetId?: string;
  returnDeadline?: string;
  exchangeDeadline?: string;
  hasReceipt: boolean;
  icon: Icon3DName;
};

export type WarrantyRecord = {
  id: string;
  assetId: string;
  assetName: string;
  brand: string;
  status: 'active' | 'expiring' | 'expired' | 'missing';
  expiresOn: string;
  daysLeft: number;
  icon: Icon3DName;
  room: string;
};

export type AppTask = {
  id: string;
  title: string;
  subtitle: string;
  due: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
  done: boolean;
  href?: string;
  icon: Icon3DName;
};

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  when: string;
  unread: boolean;
  type: 'warranty' | 'insurance' | 'return' | 'maintenance' | 'document' | 'family';
  href?: string;
};

export type ReportDef = {
  id: string;
  title: string;
  description: string;
  icon: Icon3DName;
};

export type EmergencyContact = {
  id: string;
  name: string;
  relation: string;
  phone: string;
};

export const subscriptions: Subscription[] = [
  {
    id: 'sub-netflix',
    name: 'Netflix',
    provider: 'Netflix',
    cost: 56,
    currency: 'AED',
    cycle: 'monthly',
    renewsOn: '2026-08-05',
    autoRenew: true,
    cancelNoticeDays: 0,
    category: 'Entertainment',
    icon: 'tv',
  },
  {
    id: 'sub-spotify',
    name: 'Spotify Family',
    provider: 'Spotify',
    cost: 37,
    currency: 'AED',
    cycle: 'monthly',
    renewsOn: '2026-08-12',
    autoRenew: true,
    cancelNoticeDays: 0,
    category: 'Entertainment',
    icon: 'headphones',
  },
  {
    id: 'sub-adobe',
    name: 'Adobe Creative Cloud',
    provider: 'Adobe',
    cost: 239,
    currency: 'AED',
    cycle: 'monthly',
    renewsOn: '2026-08-18',
    autoRenew: true,
    cancelNoticeDays: 14,
    category: 'Productivity',
    icon: 'laptop',
  },
  {
    id: 'sub-gym',
    name: 'Gym Membership',
    provider: 'Fitness First',
    cost: 320,
    currency: 'AED',
    cycle: 'monthly',
    renewsOn: '2026-08-01',
    autoRenew: true,
    cancelNoticeDays: 30,
    category: 'Health',
    icon: 'medical',
  },
  {
    id: 'sub-icloud',
    name: 'iCloud+',
    provider: 'Apple',
    cost: 35,
    currency: 'AED',
    cycle: 'monthly',
    renewsOn: '2026-08-22',
    autoRenew: true,
    cancelNoticeDays: 0,
    category: 'Storage',
    icon: 'phone',
  },
  {
    id: 'sub-chatgpt',
    name: 'ChatGPT Plus',
    provider: 'OpenAI',
    cost: 80,
    currency: 'AED',
    cycle: 'monthly',
    renewsOn: '2026-08-09',
    autoRenew: true,
    cancelNoticeDays: 0,
    category: 'Productivity',
    icon: 'sparkles',
  },
];

export const insurancePolicies: InsurancePolicy[] = [
  {
    id: 'ins-home',
    name: 'Home Contents',
    category: 'home',
    provider: 'AXA Gulf',
    policyNumber: 'AXA-H-88421',
    premium: 'AED 2,400 / year',
    renewsOn: '2026-11-12',
    status: 'active',
    linkedTo: 'Home · Jumeirah 1',
    icon: 'house',
    claims: 0,
  },
  {
    id: 'ins-prado',
    name: 'Vehicle Comprehensive',
    category: 'vehicle',
    provider: 'AXA Gulf',
    policyNumber: 'AXA-V-22901',
    premium: 'AED 4,850 / year',
    renewsOn: '2026-08-23',
    status: 'expiring',
    linkedTo: 'Land Cruiser Prado',
    icon: 'car',
    claims: 1,
  },
  {
    id: 'ins-medical',
    name: 'Family Medical',
    category: 'medical',
    provider: 'Daman',
    policyNumber: 'DMN-F-1102',
    premium: 'AED 18,000 / year',
    renewsOn: '2027-01-01',
    status: 'active',
    linkedTo: 'Family',
    icon: 'medical',
    claims: 2,
  },
  {
    id: 'ins-travel',
    name: 'Annual Travel',
    category: 'travel',
    provider: 'Allianz',
    policyNumber: 'ALZ-T-441',
    premium: 'AED 890 / year',
    renewsOn: '2026-03-01',
    status: 'expired',
    icon: 'passport',
    claims: 0,
  },
];

export const familyMembers: FamilyMember[] = [
  {
    id: 'fm-pranesh',
    name: 'Pranesh',
    role: 'adult',
    relation: 'You',
    avatarLetter: 'P',
    documents: 6,
    devices: 4,
    icon: 'family',
  },
  {
    id: 'fm-partner',
    name: 'Ananya',
    role: 'adult',
    relation: 'Partner',
    avatarLetter: 'A',
    documents: 5,
    devices: 3,
    medicalNotes: 'Blood type O+',
    icon: 'family',
  },
  {
    id: 'fm-kid',
    name: 'Aarav',
    role: 'child',
    relation: 'Son',
    avatarLetter: 'Aa',
    documents: 2,
    devices: 1,
    medicalNotes: 'Vaccinations up to date',
    icon: 'school',
  },
  {
    id: 'fm-bruno',
    name: 'Bruno',
    role: 'pet',
    relation: 'Dog',
    avatarLetter: 'B',
    documents: 1,
    devices: 0,
    medicalNotes: 'Next vaccine due Oct 2026',
    icon: 'dog',
  },
];

export const purchases: Purchase[] = [
  {
    id: 'pur-1',
    name: 'WH-1000XM5',
    store: 'Amazon.ae',
    date: '2026-07-20',
    price: 'AED 1,299',
    paymentMethod: 'Visa ••42',
    assetId: 'a-headphones',
    returnDeadline: '2026-08-03',
    exchangeDeadline: '2026-08-03',
    hasReceipt: true,
    icon: 'headphones',
  },
  {
    id: 'pur-2',
    name: 'TP09 Purifier',
    store: 'Dyson Store',
    date: '2025-01-21',
    price: 'AED 2,499',
    paymentMethod: 'Mastercard ••19',
    assetId: 'a-purifier',
    hasReceipt: true,
    icon: 'purifier',
  },
  {
    id: 'pur-3',
    name: 'Barista Express',
    store: 'Sharaf DG',
    date: '2024-11-02',
    price: 'AED 2,199',
    paymentMethod: 'Visa ••42',
    assetId: 'a-coffee',
    hasReceipt: true,
    icon: 'coffee',
  },
  {
    id: 'pur-4',
    name: 'OLED TV 65"',
    store: 'Jacky’s',
    date: '2024-06-12',
    price: 'AED 6,499',
    paymentMethod: 'Tabby',
    assetId: 'a-tv',
    hasReceipt: true,
    icon: 'tv',
  },
];

export const warrantyRecords: WarrantyRecord[] = [
  {
    id: 'w1',
    assetId: 'a-tv',
    assetName: 'OLED TV 65"',
    brand: 'LG',
    status: 'active',
    expiresOn: 'Jun 2027',
    daysLeft: 310,
    icon: 'tv',
    room: 'Living Room',
  },
  {
    id: 'w2',
    assetId: 'a-vacuum',
    assetName: 'V15 Detect',
    brand: 'Dyson',
    status: 'active',
    expiresOn: 'Mar 2027',
    daysLeft: 220,
    icon: 'vacuum',
    room: 'Home',
  },
  {
    id: 'w3',
    assetId: 'a-headphones',
    assetName: 'WH-1000XM5',
    brand: 'Sony',
    status: 'expiring',
    expiresOn: 'Aug 2026',
    daysLeft: 18,
    icon: 'headphones',
    room: 'Personal',
  },
  {
    id: 'w4',
    assetId: 'a-ac',
    assetName: 'Split AC 1.5 Ton',
    brand: 'Daikin',
    status: 'expired',
    expiresOn: 'Apr 2024',
    daysLeft: -120,
    icon: 'ac',
    room: 'Bedroom',
  },
  {
    id: 'w5',
    assetId: 'a-grill',
    assetName: 'Genesis II Grill',
    brand: 'Weber',
    status: 'missing',
    expiresOn: '—',
    daysLeft: 0,
    icon: 'grill',
    room: 'Garden',
  },
];

export const tasks: AppTask[] = [
  {
    id: 't1',
    title: 'Return WH-1000XM5 if needed',
    subtitle: 'Amazon return window',
    due: 'Tomorrow',
    priority: 'high',
    category: 'Returns',
    done: false,
    href: '/purchases',
    icon: 'headphones',
  },
  {
    id: 't2',
    title: 'Renew Prado insurance',
    subtitle: 'AXA Gulf',
    due: 'In 19 days',
    priority: 'high',
    category: 'Insurance',
    done: false,
    href: '/insurance',
    icon: 'shield',
  },
  {
    id: 't3',
    title: 'Descale coffee machine',
    subtitle: 'Breville · Kitchen',
    due: 'This week',
    priority: 'medium',
    category: 'Maintenance',
    done: false,
    href: '/last-done',
    icon: 'coffee',
  },
  {
    id: 't4',
    title: 'Replace AC filter',
    subtitle: 'Bedroom split',
    due: 'Overdue',
    priority: 'medium',
    category: 'Maintenance',
    done: false,
    href: '/asset/a-ac',
    icon: 'ac',
  },
  {
    id: 't5',
    title: 'Upload title deed scan',
    subtitle: 'Property documents',
    due: 'Whenever',
    priority: 'low',
    category: 'Documents',
    done: true,
    href: '/documents',
    icon: 'document',
  },
];

export const notifications: NotificationItem[] = [
  {
    id: 'n1',
    title: 'Return window closing',
    body: 'WH-1000XM5 — 2 days left to return on Amazon.',
    when: 'Just now',
    unread: true,
    type: 'return',
    href: '/purchases',
  },
  {
    id: 'n2',
    title: 'Insurance renews soon',
    body: 'Prado comprehensive renews in 19 days.',
    when: '2h ago',
    unread: true,
    type: 'insurance',
    href: '/insurance',
  },
  {
    id: 'n3',
    title: 'Maintenance due',
    body: 'Coffee machine descaling is recommended.',
    when: 'Yesterday',
    unread: false,
    type: 'maintenance',
    href: '/last-done',
  },
  {
    id: 'n4',
    title: 'Document expiry',
    body: 'Passport expires in about 8 months.',
    when: '2 days ago',
    unread: false,
    type: 'document',
    href: '/asset/a-passport',
  },
];

export const reports: ReportDef[] = [
  {
    id: 'r-inventory',
    title: 'Home inventory',
    description: 'Everything you own by space and room',
    icon: 'house',
  },
  {
    id: 'r-insurance',
    title: 'Insurance inventory',
    description: 'Policies, premiums, and linked assets',
    icon: 'shield',
  },
  {
    id: 'r-warranty',
    title: 'Warranty report',
    description: 'Active, expiring, and expired coverage',
    icon: 'receipt',
  },
  {
    id: 'r-maintenance',
    title: 'Maintenance history',
    description: 'From your Last Done logs',
    icon: 'tools',
  },
  {
    id: 'r-purchases',
    title: 'Purchase history',
    description: 'Stores, prices, and return windows',
    icon: 'credit',
  },
  {
    id: 'r-valuation',
    title: 'Asset valuation',
    description: 'Estimated value across your homes',
    icon: 'ledger',
  },
  {
    id: 'r-moving',
    title: 'Moving checklist',
    description: 'Room-by-room packing list',
    icon: 'package',
  },
  {
    id: 'r-estate',
    title: 'Estate inventory',
    description: 'High-value items and documents',
    icon: 'folder',
  },
];

export const emergencyContacts: EmergencyContact[] = [
  { id: 'ec1', name: 'Ananya', relation: 'Partner', phone: '+971 50 000 0001' },
  { id: 'ec2', name: 'Dad', relation: 'Father', phone: '+91 98 0000 0002' },
  { id: 'ec3', name: 'Family doctor', relation: 'Clinic', phone: '+971 4 000 0003' },
];

export const profile = {
  fullName: 'Pranesh Krishnan',
  email: 'pranesh@lifeos.app',
  phone: '+971 50 123 4567',
  plan: 'Pro',
  memberSince: 'Jan 2025',
  homes: 3,
  assets: 48,
  documents: 16,
  locale: 'Dubai, UAE',
};

export function subscriptionTotals(list: Subscription[] = subscriptions) {
  const monthly = list
    .filter((s) => s.cycle === 'monthly')
    .reduce((sum, s) => sum + s.cost, 0);
  const yearlyFromMonthly = monthly * 12;
  const yearly = list
    .filter((s) => s.cycle === 'yearly')
    .reduce((sum, s) => sum + s.cost, 0);
  return {
    monthly,
    yearly: yearlyFromMonthly + yearly,
  };
}
