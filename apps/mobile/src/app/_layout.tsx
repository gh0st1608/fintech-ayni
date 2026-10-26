import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';

import { createContainer } from '@/bootstrap/container';
import { loadEnv } from '@/bootstrap/env';
import { AppProviders } from '@/presentation/providers/AppProviders';
import { useSession } from '@/presentation/providers/SessionProvider';

export default function RootLayout() {
  const [{ env, container }] = useState(() => {
    const env = loadEnv();
    return { env, container: createContainer(env) };
  });

  return (
    <AppProviders container={container} fallbackLanguage={env.defaultLanguage}>
      <RootNavigator />
    </AppProviders>
  );
}

/** Única política de guardas: el área privada solo existe con sesión autenticada. */
function RootNavigator() {
  const { status } = useSession();
  if (status === 'checking') return null;
  const isAuthenticated = status === 'authenticated';

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={isAuthenticated}>
          <Stack.Screen name="(private)" />
        </Stack.Protected>
        <Stack.Protected guard={!isAuthenticated}>
          <Stack.Screen name="(public)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
