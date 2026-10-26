import { Stack } from 'expo-router';

import {
  useCatalogScreenOptions,
  useIsDevEnvironment,
  useJoinScreenOptions,
} from '@/presentation/navigation/screenOptions';

export default function PrivateLayout() {
  const joinOptions = useJoinScreenOptions();
  const catalogOptions = useCatalogScreenOptions();
  const isDev = useIsDevEnvironment();

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="join" options={joinOptions} />
      <Stack.Protected guard={isDev}>
        <Stack.Screen name="catalog" options={catalogOptions} />
      </Stack.Protected>
    </Stack>
  );
}
