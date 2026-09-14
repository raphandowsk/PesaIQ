import { Platform } from 'react-native';

import { deviceIds } from '../../services/deviceId';
import { supabaseDevicesApi } from '../../services/supabase/devicesApi';
import { describePhone } from './describe';
import { createDevicesStore } from './store';

const constants = (Platform.constants ?? {}) as {
  Brand?: string;
  Model?: string;
  interfaceIdiom?: string;
};

/** The phones signed in to the account. */
export const useDevicesStore = createDevicesStore(supabaseDevicesApi(), deviceIds, () =>
  describePhone({
    os: Platform.OS,
    brand: constants.Brand,
    model: constants.Model,
    idiom: constants.interfaceIdiom,
  }),
);
