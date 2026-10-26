import { router, Tabs } from 'expo-router';
import { useCallback } from 'react';

import { MAIN_TABS_SCREEN_OPTIONS, useMainTabs } from '@/presentation/navigation/mainTabs';

export default function TabsLayout() {
  const openJoin = useCallback(() => router.push('/join'), []);
  const tabs = useMainTabs({ onJoinPress: openJoin });

  return (
    <Tabs screenOptions={MAIN_TABS_SCREEN_OPTIONS}>
      {tabs.map(({ name, options }) => (
        <Tabs.Screen key={name} name={name} options={options} />
      ))}
    </Tabs>
  );
}
