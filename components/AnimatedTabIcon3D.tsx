import { StyleSheet, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ICON_MAP, type Icon3DName } from '@/components/ui/Icon3D';
import { colors } from '@/constants/theme';

type Tone = 'soft' | 'forest';

type Props = {
  name: Icon3DName;
  focused?: boolean;
  /** Kept for call-site compatibility — unused when static */
  delayMs?: number;
  size?: number;
  tone?: Tone;
  round?: boolean;
  style?: ViewStyle;
};

/** Soft 3D badge — static (no motion). */
export function AnimatedTabIcon3D({
  name,
  focused = false,
  size = 32,
  tone = 'soft',
  round = false,
  style,
}: Props) {
  const Icon = ICON_MAP[name] ?? ICON_MAP.package;
  const glyph = Math.round(size * (round ? 0.42 : 0.48));
  const depth = Math.max(2, Math.round(size * 0.08));
  const radius = round ? size / 2 : Math.round(size * 0.3);
  const isForest = tone === 'forest' || focused;

  return (
    <View
      style={[
        { width: size + depth + 2, height: size + depth + 2, alignItems: 'center' },
        style,
      ]}
    >
      <View style={[styles.stage, { width: size + depth, height: size + depth }]}>
        <View
          style={[
            styles.slab,
            {
              width: size,
              height: size,
              borderRadius: radius,
              top: depth,
              left: depth * 0.45,
              backgroundColor: isForest ? '#0A433C' : '#B8C0CC',
            },
          ]}
        />
        <LinearGradient
          colors={isForest ? ['#2A9A88', '#0F5C52'] : ['#FFFFFF', '#E8ECF1']}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={[
            styles.face,
            {
              width: size,
              height: size,
              borderRadius: radius,
              transform: focused && !round ? [{ scale: 1.04 }] : undefined,
            },
          ]}
        >
          <Icon
            size={glyph}
            color={isForest ? colors.forestOn : colors.forest}
            strokeWidth={2}
          />
        </LinearGradient>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  slab: {
    position: 'absolute',
  },
  face: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0B1220',
    shadowOpacity: 0.14,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
