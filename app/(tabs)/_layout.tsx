import { Tabs } from 'expo-router/tabs';

import { TabBar } from '../../components/navigation/TabBar';
import { colors } from '../../theme';

/**
 * The five main tabs.
 *
 * The bar is custom (`TabBar`) because the design puts a pill behind the active
 * icon and a count badge on Review. Order here is the order on screen.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
    >
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="transactions" />
      <Tabs.Screen name="parser-lab" />
      <Tabs.Screen name="review" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
