/**
 * The signed-in phones list on Supabase: the `devices` table. Row-level
 * security keeps each account to its own phones.
 */
import type { DevicePlatform, DevicesApi } from '../../features/devices/store';
import { getSupabase } from './client';

interface DeviceRow {
  id: string;
  label: string | null;
  platform: DevicePlatform | null;
  last_seen_at: string;
}

export function supabaseDevicesApi(): DevicesApi | null {
  const supabase = getSupabase();
  if (!supabase) return null;

  return {
    async list() {
      const { data, error } = await supabase
        .from('devices')
        .select('id, label, platform, last_seen_at')
        .order('last_seen_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as DeviceRow[]).map((r) => ({
        id: r.id,
        label: r.label ?? 'Phone',
        platform: r.platform ?? 'android',
        lastSeenAt: r.last_seen_at,
      }));
    },

    async checkIn(device) {
      const { error } = await supabase.from('devices').upsert(
        {
          id: device.id,
          label: device.label,
          platform: device.platform,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );
      if (error) throw error;
    },

    async remove(id) {
      const { error } = await supabase.from('devices').delete().eq('id', id);
      if (error) throw error;
    },
  };
}
