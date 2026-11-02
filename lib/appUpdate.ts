import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  isVersionBelow,
  softDismissIsActive,
  type SoftDismissState,
} from '@/lib/appUpdateVersion';

export {
  isVersionBelow,
  parseSemver,
  softDismissIsActive,
  type SoftDismissState,
} from '@/lib/appUpdateVersion';

const DISMISS_KEY = 'lifeos:update:softDismissed:v1';

export type AppUpdatePolicy = {
  minNativeVersion: string;
  minIosBuild: number | null;
  minAndroidVersionCode: number | null;
  softOtaEnabled: boolean;
  forceOta: boolean;
  softMessage: string;
  forceMessage: string;
  storeMessage: string;
  iosStoreUrl: string;
  androidStoreUrl: string;
};

export const DEFAULT_UPDATE_POLICY: AppUpdatePolicy = {
  minNativeVersion: '0.0.0',
  minIosBuild: null,
  minAndroidVersionCode: null,
  softOtaEnabled: true,
  forceOta: false,
  softMessage: 'A small update is ready. Restart to get the latest fixes.',
  forceMessage: 'A required update is ready with important improvements.',
  storeMessage:
    'A newer version is ready with improvements. Update to keep using the app.',
  iosStoreUrl: 'https://apps.apple.com/app/id6805518688',
  androidStoreUrl:
    'https://play.google.com/store/apps/details?id=com.praneshganesh.lifeos',
};

/** User-facing update copy: no em/en dashes (typography preference). */
export function sanitizeUpdateCopy(raw: string): string {
  return raw.replace(/[\u2014\u2013]/g, '-').replace(/\s+-\s+/g, ' - ').trim();
}

export function nativeAppVersion(): string {
  return (
    Application.nativeApplicationVersion ||
    Constants.nativeApplicationVersion ||
    Constants.expoConfig?.version ||
    '0.0.0'
  );
}

function parseBuildNumber(raw: string | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

export function nativeBuildNumber(): number | null {
  return (
    parseBuildNumber(Application.nativeBuildVersion) ??
    parseBuildNumber(Constants.nativeBuildVersion) ??
    parseBuildNumber(Constants.expoConfig?.ios?.buildNumber) ??
    parseBuildNumber(
      Constants.expoConfig?.android?.versionCode != null
        ? String(Constants.expoConfig.android.versionCode)
        : null
    )
  );
}

function parseOptionalInt(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.trunc(raw);
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function storeUrlForPlatform(policy: AppUpdatePolicy): string {
  return Platform.OS === 'ios' ? policy.iosStoreUrl : policy.androidStoreUrl;
}

/** Native binary is too old for this policy. */
export function needsStoreUpdate(policy: AppUpdatePolicy): boolean {
  if (isVersionBelow(nativeAppVersion(), policy.minNativeVersion)) return true;
  const build = nativeBuildNumber();
  if (build == null) return false;
  if (Platform.OS === 'ios' && policy.minIosBuild != null && build < policy.minIosBuild) {
    return true;
  }
  if (
    Platform.OS === 'android' &&
    policy.minAndroidVersionCode != null &&
    build < policy.minAndroidVersionCode
  ) {
    return true;
  }
  return false;
}

export async function fetchUpdatePolicy(): Promise<AppUpdatePolicy> {
  if (!isSupabaseConfigured() || !supabase) return { ...DEFAULT_UPDATE_POLICY };
  try {
    const { data, error } = await supabase
      .from('app_update_policy')
      .select(
        'min_native_version, min_ios_build, min_android_version_code, soft_ota_enabled, force_ota, soft_message, force_message, store_message, ios_store_url, android_store_url'
      )
      .eq('id', 'default')
      .maybeSingle();
    if (error || !data) return { ...DEFAULT_UPDATE_POLICY };
    const row = data as Record<string, unknown>;
    return {
      minNativeVersion:
        typeof row.min_native_version === 'string' && row.min_native_version.trim()
          ? row.min_native_version.trim()
          : DEFAULT_UPDATE_POLICY.minNativeVersion,
      minIosBuild: parseOptionalInt(row.min_ios_build),
      minAndroidVersionCode: parseOptionalInt(row.min_android_version_code),
      softOtaEnabled: row.soft_ota_enabled !== false,
      forceOta: row.force_ota === true,
      softMessage:
        typeof row.soft_message === 'string' && row.soft_message.trim()
          ? sanitizeUpdateCopy(row.soft_message)
          : DEFAULT_UPDATE_POLICY.softMessage,
      forceMessage:
        typeof row.force_message === 'string' && row.force_message.trim()
          ? sanitizeUpdateCopy(row.force_message)
          : DEFAULT_UPDATE_POLICY.forceMessage,
      storeMessage:
        typeof row.store_message === 'string' && row.store_message.trim()
          ? sanitizeUpdateCopy(row.store_message)
          : DEFAULT_UPDATE_POLICY.storeMessage,
      iosStoreUrl:
        typeof row.ios_store_url === 'string' && row.ios_store_url.trim()
          ? row.ios_store_url.trim()
          : DEFAULT_UPDATE_POLICY.iosStoreUrl,
      androidStoreUrl:
        typeof row.android_store_url === 'string' && row.android_store_url.trim()
          ? row.android_store_url.trim()
          : DEFAULT_UPDATE_POLICY.androidStoreUrl,
    };
  } catch {
    return { ...DEFAULT_UPDATE_POLICY };
  }
}

export async function loadSoftDismiss(): Promise<SoftDismissState | null> {
  try {
    const raw = await AsyncStorage.getItem(DISMISS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SoftDismissState;
    if (!parsed?.updateId || !parsed?.at) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveSoftDismiss(updateId: string): Promise<void> {
  const payload: SoftDismissState = {
    updateId,
    at: new Date().toISOString(),
  };
  await AsyncStorage.setItem(DISMISS_KEY, JSON.stringify(payload));
}

export async function clearSoftDismiss(): Promise<void> {
  await AsyncStorage.removeItem(DISMISS_KEY);
}
