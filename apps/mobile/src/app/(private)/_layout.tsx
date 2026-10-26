import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function PrivateLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="join"
        options={{ title: t('join.title'), headerBackButtonDisplayMode: 'minimal' }}
      />
    </Stack>
  );
}
