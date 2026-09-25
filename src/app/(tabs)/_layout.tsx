import { Tabs } from 'expo-router';

import { TabBar } from '@/components/tab-bar';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: '#000000' } }}>
      {/* Order matters: `build` sits in the middle and becomes the raised button. */}
      <Tabs.Screen name="index" />
      <Tabs.Screen name="build" />
      <Tabs.Screen name="outfits" />
    </Tabs>
  );
}
