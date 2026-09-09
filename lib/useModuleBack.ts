import { useCallback } from 'react';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { blurActiveElement } from '@/lib/a11y';
import {
  type ModuleOrigin,
  ORIGIN_META,
  parseModuleOrigin,
} from '@/lib/moduleNav';

export function useModuleBack(options?: {
  /** Used when there is no `from` query param (deep link / replace). */
  defaultOrigin?: ModuleOrigin;
  /** Parent module label — overrides origin for detail screens (e.g. "Expenses"). */
  backLabel?: string;
  backFallbackHref?: Href;
  onBack?: () => void;
}) {
  const { from: fromParam } = useLocalSearchParams<{ from?: string }>();
  const router = useRouter();
  const fromOrigin = parseModuleOrigin(fromParam) ?? options?.defaultOrigin ?? 'today';
  const originMeta = ORIGIN_META[fromOrigin];

  const backLabel = options?.backLabel ?? originMeta.label;
  const backFallbackHref = options?.backFallbackHref ?? originMeta.href;

  const onBack = useCallback(() => {
    blurActiveElement();
    if (options?.onBack) {
      options.onBack();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace(backFallbackHref);
  }, [options?.onBack, router, backFallbackHref]);

  return { backLabel, backFallbackHref, onBack, fromOrigin };
}
