import { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow, StatStrip } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { CaptureContextButton } from '@/components/CaptureContextButton';
import { useInventory } from '@/lib/InventoryContext';
import { useSpaces } from '@/lib/SpacesContext';
import { useLastDone } from '@/lib/LastDoneContext';
import {
  daysUntil,
  forInventoryItem,
  formatRelativeDone,
  getLastDoneAt,
} from '@/lib/lastDone';
import {
  isPrimaryVehicle,
  isVehicleItem,
  spaceIdByKind,
} from '@/lib/moduleFilters';
import { colors } from '@/constants/theme';

export default function VehiclesScreen() {
  const router = useRouter();
  const { items } = useInventory();
  const { spaces } = useSpaces();
  const { items: lastDone } = useLastDone();
  const vehicleSpaceId = spaceIdByKind(spaces, 'vehicle');

  const vehicles = useMemo(
    () => items.filter((i) => isVehicleItem(i, vehicleSpaceId)),
    [items, vehicleSpaceId]
  );

  const fleet = useMemo(() => {
    const primary = vehicles.filter(isPrimaryVehicle);
    return primary.length ? primary : vehicles;
  }, [vehicles]);

  const linked = useMemo(
    () => vehicles.filter((v) => !fleet.some((f) => f.id === v.id)),
    [vehicles, fleet]
  );

  const dueSoon = useMemo(() => {
    let n = 0;
    for (const v of fleet) {
      const linkedDone = forInventoryItem(lastDone, v.id);
      for (const a of linkedDone) {
        if (!a.remindAt) continue;
        if (daysUntil(a.remindAt) <= 14) n += 1;
      }
      if (v.warrantyExpiry && v.warrantyExpiry !== '—') {
        const d = daysUntil(
          v.warrantyExpiry.match(/^\d{4}-\d{2}-\d{2}/)
            ? `${v.warrantyExpiry.slice(0, 10)}T12:00:00`
            : v.warrantyExpiry
        );
        if (d <= 90) n += 1;
      }
    }
    return n;
  }, [fleet, lastDone]);

  function serviceMeta(vehicleId: string): string | undefined {
    const linkedDone = forInventoryItem(lastDone, vehicleId);
    if (!linkedDone.length) return undefined;
    const top = linkedDone[0];
    if (top.remindAt) {
      const d = daysUntil(top.remindAt);
      if (d < 0) return 'Service overdue';
      if (d === 0) return 'Service today';
      if (d <= 14) return `Service ${d}d`;
    }
    return formatRelativeDone(getLastDoneAt(top));
  }

  return (
    <ModuleScreen
      title="Vehicles"
      subtitle="Fleet, service, and linked gear — from your inventory."
      right={
        <CaptureContextButton
          kind="vehicle"
          spaceId={vehicleSpaceId}
          label="Capture for vehicles"
        />
      }
    >
      <StatStrip
        items={[
          { label: 'Vehicles', value: String(fleet.length) },
          { label: 'Linked', value: String(linked.length) },
          { label: 'Due soon', value: String(dueSoon) },
        ]}
      />

      <ModuleSection label="Fleet" count={fleet.length}>
        {fleet.length === 0 ? (
          <View style={{ paddingVertical: 12 }}>
            <Text variant="body" style={{ color: colors.mute }}>
              No vehicles yet. Use + → Capture → Vehicle, or say “I got a Prado” in Talk.
            </Text>
          </View>
        ) : (
          <ListCard>
            {fleet.map((v, i) => {
              const service = serviceMeta(v.id);
              return (
                <ListRow
                  key={v.id}
                  icon={v.icon}
                  title={v.name}
                  subtitle={[v.brand, v.room]
                    .filter((x) => x && x !== '—')
                    .join(' · ')}
                  meta={service || (v.condition !== '—' ? v.condition : undefined)}
                  tone={
                    service?.includes('overdue') || service?.includes('today')
                      ? colors.coral
                      : service?.includes('Service')
                        ? colors.amber
                        : undefined
                  }
                  onPress={() => router.push(`/asset/${v.id}` as Href)}
                  last={i === fleet.length - 1}
                />
              );
            })}
          </ListCard>
        )}
      </ModuleSection>

      {linked.length ? (
        <ModuleSection label="Linked items" count={linked.length}>
          <ListCard>
            {linked.map((v, i) => (
              <ListRow
                key={v.id}
                icon={v.icon}
                title={v.name}
                subtitle={v.brand !== '—' ? v.brand : 'Accessory'}
                meta={v.condition !== '—' ? v.condition : undefined}
                onPress={() => router.push(`/asset/${v.id}` as Href)}
                last={i === linked.length - 1}
              />
            ))}
          </ListCard>
        </ModuleSection>
      ) : null}
    </ModuleScreen>
  );
}
