import { useMemo } from 'react';
import { useExpenses } from '@/lib/ExpensesContext';
import { useInventory } from '@/lib/InventoryContext';
import { useSubscriptions } from '@/lib/SubscriptionsContext';
import { rememberedLabels } from '@/lib/fieldSuggestions';

export function useBrandSuggestions(): string[] {
  const { items } = useInventory();
  return useMemo(() => rememberedLabels(items.map((item) => item.brand)), [items]);
}

/** Stores already used as an expense merchant or a thing’s “bought from”. */
export function useStoreSuggestions(): string[] {
  const { items } = useInventory();
  const { expenses } = useExpenses();
  return useMemo(
    () =>
      rememberedLabels([
        ...expenses.map((expense) => expense.merchant),
        ...items.map((item) => item.purchasedFrom),
      ]),
    [expenses, items]
  );
}

export function useProviderSuggestions(): string[] {
  const { subscriptions } = useSubscriptions();
  const brands = useBrandSuggestions();
  return useMemo(
    () => rememberedLabels([...subscriptions.map((row) => row.provider), ...brands]),
    [subscriptions, brands]
  );
}
