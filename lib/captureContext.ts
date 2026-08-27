import type { Href } from 'expo-router';
import type { Icon3DName } from '@/components/ui/Icon3D';
import { DEFAULT_SPACES } from '@/lib/spacesDefaults';

/** Optional live spaces list — set by SpacesProvider when ready. */
let liveSpaces: Array<{ id: string; name: string; kind: string }> | null = null;

export function setCaptureSpacesLookup(
  list: Array<{ id: string; name: string; kind: string }> | null
) {
  liveSpaces = list;
}

function spacesLookup() {
  return liveSpaces ?? DEFAULT_SPACES;
}

/** Where Capture was opened from — biases defaults, hints, and save target. */
export type CaptureContextKind =
  | 'general'
  | 'home'
  | 'vehicle'
  | 'documents'
  | 'family'
  | 'warranty'
  | 'insurance'
  | 'purchase'
  | 'subscription'
  | 'maintenance'
  | 'room';

export type CapturePreset = {
  kind: CaptureContextKind;
  label: string;
  hint: string;
  spaceId: string;
  room: string;
  category: string;
  icon: Icon3DName;
  /** Prefer document fields even without MRZ */
  preferDocument: boolean;
  defaultName: string;
  saveEvent: string;
};

type CaptureParams = {
  context?: string | string[];
  spaceId?: string | string[];
  room?: string | string[];
};

function one(v?: string | string[]) {
  return Array.isArray(v) ? v[0] : v;
}

const PRESETS: Record<CaptureContextKind, Omit<CapturePreset, 'spaceId' | 'room'> & { spaceId?: string; room?: string }> = {
  general: {
    kind: 'general',
    label: 'Saavi',
    hint: 'Point at the item or document',
    category: 'Uncategorized',
    icon: 'package',
    preferDocument: false,
    defaultName: 'New item',
    saveEvent: 'Item captured',
    spaceId: 's1',
    room: 'Inbox',
  },
  home: {
    kind: 'home',
    label: 'Home',
    hint: 'Photograph an appliance, furniture, or receipt',
    category: 'Home',
    icon: 'house',
    preferDocument: false,
    defaultName: 'New home item',
    saveEvent: 'Added to home',
    spaceId: 's1',
    room: 'Inbox',
  },
  vehicle: {
    kind: 'vehicle',
    label: 'Vehicles',
    hint: 'Photograph registration, insurance card, or the vehicle',
    category: 'Vehicle',
    icon: 'car',
    preferDocument: false,
    defaultName: 'New vehicle item',
    saveEvent: 'Added to vehicles',
    spaceId: 's4',
    room: 'Vehicles',
  },
  documents: {
    kind: 'documents',
    label: 'Documents',
    hint: 'Photograph the ID page or document',
    category: 'Documents',
    icon: 'document',
    preferDocument: true,
    defaultName: 'New document',
    saveEvent: 'Document captured · text read on device',
    spaceId: 's5',
    room: 'Personal Documents',
  },
  family: {
    kind: 'family',
    label: 'Family',
    hint: 'Photograph a device, ID, or medical record',
    category: 'Family',
    icon: 'family',
    preferDocument: false,
    defaultName: 'New family item',
    saveEvent: 'Added to family',
    spaceId: 's6',
    room: 'Family',
  },
  warranty: {
    kind: 'warranty',
    label: 'Warranties',
    hint: 'Photograph the warranty card or receipt',
    category: 'Warranty',
    icon: 'receipt',
    preferDocument: true,
    defaultName: 'Warranty document',
    saveEvent: 'Warranty document captured',
    spaceId: 's1',
    room: 'Warranties',
  },
  insurance: {
    kind: 'insurance',
    label: 'Insurance',
    hint: 'Photograph the policy schedule or card',
    category: 'Insurance',
    icon: 'shield',
    preferDocument: true,
    defaultName: 'Insurance document',
    saveEvent: 'Insurance document captured',
    spaceId: 's5',
    room: 'Insurance',
  },
  purchase: {
    kind: 'purchase',
    label: 'Purchases',
    hint: 'Photograph the receipt or the item',
    category: 'Purchase',
    icon: 'receipt',
    preferDocument: false,
    defaultName: 'New purchase',
    saveEvent: 'Purchase captured',
    spaceId: 's1',
    room: 'Inbox',
  },
  subscription: {
    kind: 'subscription',
    label: 'Subscriptions',
    hint: 'Photograph a billing email screenshot or statement',
    category: 'Subscription',
    icon: 'credit',
    preferDocument: false,
    defaultName: 'New subscription',
    saveEvent: 'Subscription captured',
    spaceId: 's1',
    room: 'Subscriptions',
  },
  maintenance: {
    kind: 'maintenance',
    label: 'Maintenance',
    hint: 'Photograph the appliance, filter, or service invoice',
    category: 'Maintenance',
    icon: 'tools',
    preferDocument: false,
    defaultName: 'Maintenance item',
    saveEvent: 'Maintenance capture',
    spaceId: 's1',
    room: 'Inbox',
  },
  room: {
    kind: 'room',
    label: 'Room',
    hint: 'Photograph something in this room',
    category: 'Home',
    icon: 'package',
    preferDocument: false,
    defaultName: 'New item',
    saveEvent: 'Added to room',
    spaceId: 's1',
    room: 'Inbox',
  },
};

/** Remember last module so the tab Capture FAB stays context-aware. */
let remembered: { kind: CaptureContextKind; spaceId?: string; room?: string } = {
  kind: 'general',
};

export function rememberCaptureContext(
  kind: CaptureContextKind,
  opts?: { spaceId?: string; room?: string }
) {
  remembered = { kind, spaceId: opts?.spaceId, room: opts?.room };
}

export function getRememberedCaptureContext() {
  return remembered;
}

export function kindFromSpace(
  spaceKind?: 'home' | 'vehicle' | 'documents' | 'family'
): CaptureContextKind {
  if (spaceKind === 'vehicle') return 'vehicle';
  if (spaceKind === 'documents') return 'documents';
  if (spaceKind === 'family') return 'family';
  if (spaceKind === 'home') return 'home';
  return 'general';
}

export function resolveCapturePreset(params?: CaptureParams): CapturePreset {
  const raw = (one(params?.context) || 'general') as CaptureContextKind;
  const kind = raw in PRESETS ? raw : 'general';
  const base = PRESETS[kind];
  const spaceId = one(params?.spaceId) || base.spaceId || 's1';
  const room = one(params?.room) || base.room || 'Inbox';
  const space = spacesLookup().find((s) => s.id === spaceId);

  return {
    ...base,
    kind,
    spaceId,
    room,
    label: space && kind !== 'general' && (kind === 'home' || kind === 'room')
      ? space.name
      : base.label,
  };
}

export function captureHref(input?: {
  kind?: CaptureContextKind;
  spaceId?: string;
  room?: string;
  /** Attach photo/receipt to this existing inventory item */
  linkItemId?: string;
  /** Soft hint for UI copy */
  attach?: 'photo' | 'receipt';
}): Href {
  const kind = input?.kind ?? 'general';
  rememberCaptureContext(kind, { spaceId: input?.spaceId, room: input?.room });
  const params: Record<string, string> = {};
  if (kind !== 'general') params.context = kind;
  if (input?.spaceId) params.spaceId = input.spaceId;
  if (input?.room) params.room = input.room;
  if (input?.linkItemId) params.linkItemId = input.linkItemId;
  if (input?.attach) params.attach = input.attach;

  if (Object.keys(params).length === 0) {
    return '/capture' as Href;
  }
  return {
    pathname: '/capture',
    params,
  } as Href;
}

/** Open Capture using the last remembered module context (tab FAB). */
export function rememberedCaptureHref(): Href {
  const r = getRememberedCaptureContext();
  return captureHref({
    kind: r.kind,
    spaceId: r.spaceId,
    room: r.room,
  });
}
