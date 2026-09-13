import { useId, useState } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Mask,
  Pattern,
  Rect,
  Stop,
} from 'react-native-svg';
import { useTheme } from '@/lib/ThemeContext';

export type DotTone = {
  /** Solid card fill (pastel / tinted surface) */
  bg: string;
  /** Dot ink */
  dot: string;
};

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.replace('#', '').trim();
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw.slice(0, 6);
  if (full.length < 6) return null;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
}

function rgbToHsl(r: number, g: number, b: number) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number) {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

/** True when the swatch is nearly gray (ink / mono themes). */
export function isNearGray(hex: string): boolean {
  const rgb = parseHex(hex);
  if (!rgb) return true;
  return rgbToHsl(rgb.r, rgb.g, rgb.b).s < 0.12;
}

/**
 * Soft card fill — muted, not candy.
 * Light → airy low-chroma wash. Dark → deep low-chroma wash.
 */
export function softCardBg(
  hex: string,
  light: boolean,
  _amount?: number
): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  let { h, s } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  if (s < 0.12) s = 0.22;
  else s = Math.min(light ? 0.28 : 0.32, Math.max(0.16, s * (light ? 0.55 : 0.65)));
  const l = light ? 0.9 : 0.22;
  const out = hslToRgb(h, s, l);
  return `rgb(${out.r}, ${out.g}, ${out.b})`;
}

/** Prefer theme accent; if it's gray (ink theme), use a muted fallback hue. */
export function hubCardBg(themeHex: string, light: boolean, vivid: string): string {
  return softCardBg(isNearGray(themeHex) ? vivid : themeHex, light);
}

/**
 * Dense dotted field — tight grid, stronger top-left, fades to bottom-right.
 */
export function DotField({
  tone,
  style,
}: {
  tone: DotTone;
  style?: StyleProp<ViewStyle>;
}) {
  const { resolved } = useTheme();
  const uid = useId().replace(/:/g, '');
  const [{ w, h }, setSize] = useState({ w: 0, h: 0 });
  const pitch = 2.75;
  const r = 0.55;
  const fillOpacity = resolved === 'light' ? 0.62 : 0.4;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== w || height !== h) setSize({ w: width, h: height });
  };

  return (
    <View
      pointerEvents="none"
      onLayout={onLayout}
      style={[StyleSheet.absoluteFill, { backgroundColor: tone.bg }, style]}
    >
      {w > 0 && h > 0 ? (
        <Svg width={w} height={h}>
          <Defs>
            <Pattern
              id={`${uid}-dots`}
              width={pitch}
              height={pitch}
              patternUnits="userSpaceOnUse"
            >
              <Circle cx={pitch / 2} cy={pitch / 2} r={r} fill={tone.dot} />
            </Pattern>
            <LinearGradient
              id={`${uid}-fade`}
              x1="0"
              y1="0"
              x2={w}
              y2={h}
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
              <Stop offset="38%" stopColor="#FFFFFF" stopOpacity="0.7" />
              <Stop offset="72%" stopColor="#FFFFFF" stopOpacity="0.2" />
              <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </LinearGradient>
            <Mask
              id={`${uid}-mask`}
              maskUnits="userSpaceOnUse"
              x={0}
              y={0}
              width={w}
              height={h}
            >
              <Rect x={0} y={0} width={w} height={h} fill={`url(#${uid}-fade)`} />
            </Mask>
          </Defs>
          <Rect
            x={0}
            y={0}
            width={w}
            height={h}
            fill={`url(#${uid}-dots)`}
            fillOpacity={fillOpacity}
            mask={`url(#${uid}-mask)`}
          />
        </Svg>
      ) : null}
    </View>
  );
}
