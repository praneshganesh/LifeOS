import { useTheme } from '@/lib/ThemeContext';
import { useMemo, useEffect, useRef } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, View } from 'react-native';
import { type ThemeColors } from '@/constants/theme';

type Props = {
  /** Called after the brand moment finishes (native splash already hidden). */
  onFinished: () => void;
};

const NATIVE_DRIVER = Platform.OS !== 'web';

/** In-app brand beat — HDR lockup on the linen field, no pattern behind it. */
export function BrandSplash({ onFinished }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const opacity = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(8)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  const finishedRef = useRef(false);

  useEffect(() => {
    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onFinished();
    };

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
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: NATIVE_DRIVER,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 8,
        tension: 72,
        useNativeDriver: NATIVE_DRIVER,
      }),
    ]);

    const hold = Animated.delay(900);
    const exit = Animated.timing(opacity, {
      toValue: 0,
      duration: 360,
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
  }, [lift, onFinished, opacity, scale]);

  return (
    <View style={styles.root} accessibilityLabel="Saavi">
      <Animated.View
        style={[
          styles.center,
          {
            opacity,
            transform: [{ translateY: lift }, { scale }],
          },
        ]}
      >
        <Image
          source={require('@/assets/brand/lifeos-logo-hdr-home.jpg')}
          style={styles.mark}
          resizeMode="contain"
        />
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
    center: {
      alignItems: 'center',
    },
    mark: {
      width: 280,
      height: 280,
    },
  });
}
