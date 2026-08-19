import { View, StyleSheet, ViewStyle } from 'react-native';
import {
  AirVent,
  Armchair,
  BedDouble,
  Bell,
  Bike,
  BookUser,
  Building2,
  CalendarDays,
  Camera,
  Car,
  ChartColumn,
  Check,
  Coffee,
  CreditCard,
  Dog,
  Droplets,
  Fan,
  FileText,
  Flame,
  Flower2,
  Hash,
  Headphones,
  Home,
  IdCard,
  KeyRound,
  Lamp,
  Laptop,
  ListChecks,
  Microwave,
  MessageCircle,
  Mic,
  Package,
  Pill,
  Plus,
  Receipt,
  Refrigerator,
  ScanBarcode,
  ScanLine,
  Search,
  Shield,
  Smartphone,
  Snowflake,
  Sparkles,
  Trees,
  Tv,
  Users,
  UtensilsCrossed,
  Wallet,
  WashingMachine,
  Watch,
  Wrench,
  type LucideIcon,
} from 'lucide-react-native';
import { useTheme } from '@/lib/ThemeContext';

/**
 * Semantic LifeOS icons — relevant glyphs only.
 * Every icon sits in the same soft square badge.
 */
export const ICON_MAP: Record<string, LucideIcon> = {
  house: Home,
  holiday: Trees,
  building: Building2,
  car: Car,
  folder: FileText,
  family: Users,
  search: Search,
  camera: Camera,
  sparkles: Sparkles,
  laptop: Laptop,
  passport: BookUser,
  tv: Tv,
  coffee: Coffee,
  sofa: Armchair,
  bed: BedDouble,
  kitchen: UtensilsCrossed,
  tools: Wrench,
  garden: Flower2,
  document: FileText,
  receipt: Receipt,
  barcode: ScanBarcode,
  plus: Plus,
  bell: Bell,
  vacuum: Fan,
  microwave: Microwave,
  fridge: Refrigerator,
  dishwasher: Droplets,
  ac: AirVent,
  phone: Smartphone,
  headphones: Headphones,
  watch: Watch,
  dog: Dog,
  key: KeyRound,
  shield: Shield,
  credit: CreditCard,
  package: Package,
  chair: Armchair,
  lamp: Lamp,
  washing: WashingMachine,
  grill: Flame,
  bicycle: Bike,
  id: IdCard,
  medical: Pill,
  today: CalendarDays,
  chat: MessageCircle,
  talk: Mic,
  spaces: Package,
  things: Package,
  serial: Hash,
  check: Check,
  send: Sparkles,
  memo: FileText,
  school: Building2,
  hospital: Pill,
  ledger: FileText,
  scroll: FileText,
  radio: Tv,
  scan: ScanLine,
  purifier: Snowflake,
  wallet: Wallet,
  tasks: ListChecks,
  chart: ChartColumn,
};

export type Icon3DName = keyof typeof ICON_MAP;

type Tone = 'soft' | 'forest' | 'plain';

export function AppIcon({
  name,
  size = 44,
  tone = 'soft',
  style,
}: {
  name: Icon3DName;
  size?: number;
  tone?: Tone;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const Icon = ICON_MAP[name] ?? Package;
  const glyph = Math.round(size * 0.45);
  const bg =
    tone === 'forest'
      ? colors.accent
      : tone === 'plain'
        ? 'transparent'
        : colors.surfaceSoft;
  const fg = tone === 'forest' ? colors.accentOn : colors.accent;

  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: Math.max(12, Math.round(size * 0.28)),
          backgroundColor: bg,
        },
        style,
      ]}
    >
      <Icon size={glyph} color={fg} strokeWidth={1.9} />
    </View>
  );
}

export function Icon3D({
  name,
  size = 40,
  style,
}: {
  name: Icon3DName;
  size?: number;
  style?: ViewStyle;
}) {
  return <AppIcon name={name} size={Math.max(size, 40)} tone="soft" style={style} />;
}

export function Icon3DBadge({
  name,
  size = 52,
}: {
  name: Icon3DName;
  size?: number;
  soft?: boolean;
}) {
  return <AppIcon name={name} size={size} tone="soft" />;
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
