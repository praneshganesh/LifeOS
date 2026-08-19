import { useTheme } from '@/lib/ThemeContext';
import { useMemo, useEffect, useRef } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, View } from 'react-native';
import { type ThemeColors } from '@/constants/theme';

type Props = {
  /** Called after the brand moment finishes (native splash already hidden). */
  onFinished: () => void;
};

const NATIVE_DRIVER = Platform.OS !== 'web';

/**
 * In-app brand beat — HDR house lockup on an HDR wave field (BT.2100 PQ jpeg).
 */
export function BrandSplash({ onFinished }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const opacity = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(10)).current;
  const markScale = useRef(new Animated.Value(0.94)).current;
  const field = useRef(new Animated.Value(0.35)).current;
  const finishedRef = useRef(false);

  useEffect(() => {
    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onFinished();
    };

    const failSafe = setTimeout(finish, 2800);

    const enter = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 480,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: NATIVE_DRIVER,
      }),
      Animated.timing(lift, {
        toValue: 0,
        duration: 560,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: NATIVE_DRIVER,
      }),
      Animated.spring(markScale, {
        toValue: 1,
        friction: 8,
        tension: 70,
        useNativeDriver: NATIVE_DRIVER,
      }),
      Animated.timing(field, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.quad),
        useNativeDriver: NATIVE_DRIVER,
      }),
    ]);

    const hold = Animated.delay(1100);

    const exit = Animated.timing(opacity, {
      toValue: 0,
      duration: 400,
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
  }, [field, lift, markScale, onFinished, opacity]);

  return (
    <View style={styles.root} accessibilityLabel="LifeOS">
      <Animated.Image
        source={require('@/assets/brand/lifeos-splash-waves-hdr.jpg')}
        style={[styles.waves, { opacity: field }]}
        resizeMode="cover"
      />
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
            source={require('@/assets/brand/lifeos-logo-hdr-home.jpg')}
            style={styles.mark}
            resizeMode="contain"
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
    },
    waves: {
      ...StyleSheet.absoluteFill,
      width: '100%',
      height: '100%',
    },
    center: {
      alignItems: 'center',
    },
    mark: {
      width: 300,
      height: 300,
    },
  });
}
