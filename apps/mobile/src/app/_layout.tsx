import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';

import { createContainer } from '@/bootstrap/container';
import { loadEnv } from '@/bootstrap/env';
import { AppProviders } from '@/presentation/providers/AppProviders';
import { useSession } from '@/presentation/providers/SessionProvider';

// El splash nativo cubre la carga de idioma, fuentes y sesión: nunca se ve una pantalla en blanco.
SplashScreen.preventAutoHideAsync().catch(() => {});

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
  const ready = status !== 'checking';

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;
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
