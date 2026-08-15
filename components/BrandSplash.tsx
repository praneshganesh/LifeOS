import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { colors, fonts } from '@/constants/theme';

type Props = {
  /** Called after the brand moment finishes (native splash already hidden). */
  onFinished: () => void;
};

const NATIVE_DRIVER = Platform.OS !== 'web';

/**
 * Soft in-app brand beat after the native splash — linen field, LifeOS wordmark.
 */
export function BrandSplash({ onFinished }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(10)).current;
  const markScale = useRef(new Animated.Value(0.92)).current;
  const finishedRef = useRef(false);

  useEffect(() => {
    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onFinished();
    };

    // Web can stall native-driver animations — always bail out.
    const failSafe = setTimeout(finish, 2600);

    const enter = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: NATIVE_DRIVER,
      }),
      Animated.timing(lift, {
        toValue: 0,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: NATIVE_DRIVER,
      }),
      Animated.spring(markScale, {
        toValue: 1,
        friction: 8,
        tension: 80,
        useNativeDriver: NATIVE_DRIVER,
      }),
    ]);

    const hold = Animated.delay(900);

    const exit = Animated.timing(opacity, {
      toValue: 0,
      duration: 380,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: NATIVE_DRIVER,
    });

    const seq = Animated.sequence([enter, hold, exit]);
    seq.start(({ finished }) => {
      if (finished) finish();
    });

    return () => {
      clearTimeout(failSafe);
      seq.stop();
    };
  }, [lift, markScale, onFinished, opacity]);

  return (
    <View style={styles.root} accessibilityLabel="LifeOS">
      <View style={styles.glow} />
      <Animated.View
        style={[
          styles.center,
          {
            opacity,
            transform: [{ translateY: lift }],
          },
        ]}
      >
        <Animated.View style={{ transform: [{ scale: markScale }] }}>
          <Image
            source={require('@/assets/images/splash-icon.png')}
            style={styles.mark}
            resizeMode="contain"
          />
        </Animated.View>
        <Text style={styles.wordmark}>LifeOS</Text>
        <Text style={styles.tag}>Everything you own, in one place</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  glow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: colors.forestWash,
    top: '38%',
    marginTop: -140,
  },
  center: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  mark: {
    width: 132,
    height: 132,
    marginBottom: 18,
  },
  wordmark: {
    fontFamily: fonts.sansSemi,
    fontSize: 36,
    letterSpacing: -1.2,
    color: colors.ink,
  },
  tag: {
    marginTop: 8,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.mute,
    textAlign: 'center',
  },
});
