import { useEffect } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { BackButton } from '../components/ui/BackButton';
import { Button, Card, Screen, Tag, Text } from '../components/ui';
import { useAuthStore } from '../features/auth';
import { useDevicesStore, type Device, type DevicePlatform } from '../features/devices';
import { colors, fonts, space } from '../theme';
import { formatShortDate } from '../utils/format';

const leave = () => (router.canGoBack() ? router.back() : router.replace('/settings'));

const PLATFORM: Record<DevicePlatform, string> = {
  android: 'Android',
  ios: 'iOS',
  web: 'Web',
};

const lastActive = (iso: string) => {
  const d = new Date(iso);
  return `Last active ${formatShortDate(d)}, ${d.toTimeString().slice(0, 5)}`;
};

/** The phones signed in to the account, this one first when it is the newest. */
export default function Devices() {
  const userId = useAuthStore((s) => s.session?.userId ?? null);
  const devices = useDevicesStore((s) => s.devices);
  const thisId = useDevicesStore((s) => s.thisId);
  const status = useDevicesStore((s) => s.status);
  const checkIn = useDevicesStore((s) => s.checkIn);
  const load = useDevicesStore((s) => s.load);

  const refresh = async () => {
    if (!userId) return;
    await checkIn(userId);
    await load(userId);
  };

  useEffect(() => {
    if (!userId) return;
    void (async () => {
      await checkIn(userId);
      await load(userId);
    })();
  }, [userId, checkIn, load]);

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          paddingTop: space[3],
          marginBottom: space[2],
        }}
      >
        <BackButton onPress={leave} />
        <Text variant="h2" accessibilityRole="header" style={{ flex: 1, fontSize: 20 }}>
          Signed-in phones
        </Text>
      </View>
      <Text variant="small" tone="muted" style={{ marginBottom: space[4] }}>
        Phones that use PesaIQ with your number. A phone leaves the list when it signs out.
      </Text>

      {status === 'failed' ? (
        <Card style={{ gap: space[3] }}>
          <Text variant="bodyMedium">{"Couldn't load the list. Check your connection."}</Text>
          <Button label="Try again" variant="secondary" onPress={() => void refresh()} />
        </Card>
      ) : devices.length === 0 ? (
        <Text variant="small" tone="muted" accessibilityLiveRegion="polite">
          {status === 'loading' || status === 'idle' ? 'Loading…' : 'No phones yet.'}
        </Text>
      ) : (
        <Card style={{ paddingVertical: space[1] }}>
          {devices.map((d, i) => (
            <DeviceRow
              key={d.id}
              device={d}
              isThis={d.id === thisId}
              last={i === devices.length - 1}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}

function DeviceRow({ device, isThis, last }: { device: Device; isThis: boolean; last: boolean }) {
  const when = isThis ? 'Active now' : lastActive(device.lastSeenAt);
  return (
    <View
      accessible
      accessibilityLabel={`${device.label}${isThis ? ', this phone' : ''}. ${PLATFORM[device.platform]}. ${when}.`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingVertical: space[3],
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.divider,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          variant="bodyMedium"
          numberOfLines={1}
          style={{ fontFamily: fonts.semibold, fontSize: 14 }}
        >
          {device.label}
        </Text>
        <Text variant="small" tone="muted" style={{ fontSize: 12 }}>
          {PLATFORM[device.platform]} · {when}
        </Text>
      </View>
      {isThis ? <Tag label="This phone" tone="positive" /> : null}
    </View>
  );
}
