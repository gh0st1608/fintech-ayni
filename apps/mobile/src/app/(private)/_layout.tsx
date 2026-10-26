import { Stack } from 'expo-router';

import { useJoinScreenOptions } from '@/presentation/navigation/screenOptions';

export default function PrivateLayout() {
  const joinOptions = useJoinScreenOptions();
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="join" options={joinOptions} />
    </Stack>
  );
}
