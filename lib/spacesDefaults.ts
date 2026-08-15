import type { Icon3DName } from '@/components/ui/Icon3D';

/** Canonical space / room shapes — owned by SpacesContext, not demo mock. */
export type Space = {
  id: string;
  name: string;
  kind: 'home' | 'vehicle' | 'documents' | 'family';
  icon: Icon3DName;
  meta: string;
  items: number;
};

export type Room = {
  id: string;
  name: string;
  icon: Icon3DName;
  spaceId: string;
  /** Legacy field — room contents come from inventory, not this list */
  assetIds: string[];
};

/** First-run spaces. Stable ids (s1/s4/s5/s6) keep Capture presets working. */
export const DEFAULT_SPACES: Space[] = [
  { id: 's1', name: 'Home', kind: 'home', icon: 'house', meta: 'Your place', items: 0 },
  { id: 's4', name: 'Vehicles', kind: 'vehicle', icon: 'car', meta: 'Cars & bikes', items: 0 },
  {
    id: 's5',
    name: 'Personal Documents',
    kind: 'documents',
    icon: 'folder',
    meta: 'IDs & legal',
    items: 0,
  },
  { id: 's6', name: 'Family', kind: 'family', icon: 'family', meta: 'People & pets', items: 0 },
];

/** Default rooms for Home — empty assetIds; inventory is the source of truth. */
export const DEFAULT_ROOMS: Room[] = [
  { id: 'rm1', name: 'Living Room', icon: 'sofa', spaceId: 's1', assetIds: [] },
  { id: 'rm2', name: 'Kitchen', icon: 'kitchen', spaceId: 's1', assetIds: [] },
  { id: 'rm3', name: 'Bedroom', icon: 'bed', spaceId: 's1', assetIds: [] },
  { id: 'rm4', name: 'Garage', icon: 'tools', spaceId: 's1', assetIds: [] },
  { id: 'rm5', name: 'Garden', icon: 'garden', spaceId: 's1', assetIds: [] },
  { id: 'rm6', name: 'Office', icon: 'laptop', spaceId: 's1', assetIds: [] },
  { id: 'rm-inbox', name: 'Inbox', icon: 'package', spaceId: 's1', assetIds: [] },
  { id: 'rm-vehicles', name: 'Vehicles', icon: 'car', spaceId: 's4', assetIds: [] },
  {
    id: 'rm-docs',
    name: 'Personal Documents',
    icon: 'folder',
    spaceId: 's5',
    assetIds: [],
  },
  { id: 'rm-family', name: 'Family', icon: 'family', spaceId: 's6', assetIds: [] },
];

export function defaultSpacesPayload() {
  return {
    spaces: DEFAULT_SPACES.map((s) => ({ ...s, custom: false as const })),
    rooms: DEFAULT_ROOMS.map((r) => ({ ...r, custom: false as const })),
  };
}
