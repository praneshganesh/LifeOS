import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  getRuntimeDefaultCurrency,
  normalizeCurrencyCode,
  resolveDefaultCurrency,
  setRuntimeDefaultCurrency,
} from '@/lib/currency';
import { loadLocalProfile, saveLocalProfile } from '@/lib/profile';

type CurrencyContextValue = {
  currency: string;
  ready: boolean;
  setCurrency: (code: string) => Promise<void>;
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState(getRuntimeDefaultCurrency);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadLocalProfile().then((p) => {
      if (!alive) return;
      const next = resolveDefaultCurrency(p.currency);
      setRuntimeDefaultCurrency(next);
      setCurrencyState(next);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const setCurrency = useCallback(async (code: string) => {
    const next = normalizeCurrencyCode(code) || resolveDefaultCurrency();
    const existing = await loadLocalProfile();
    await saveLocalProfile({ ...existing, currency: next });
    setRuntimeDefaultCurrency(next);
    setCurrencyState(next);
  }, []);

  const value = useMemo(
    () => ({ currency, ready, setCurrency }),
    [currency, ready, setCurrency]
  );

  return (
    <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    throw new Error('useCurrency must be used within CurrencyProvider');
  }
  return ctx;
}
