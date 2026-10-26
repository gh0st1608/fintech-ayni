import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ColorValue } from 'react-native';

import { colors } from '@/presentation/theme/tokens';
import { JoinTabButton } from '@/presentation/shared/components/JoinTabButton';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IconName) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return (
      <Ionicons name={name} color={typeof color === 'string' ? color : undefined} size={size} />
    );
  };
}

/** Tab bar del Figma: Home, Circles, botón central "+" (Choose a Service), Payment, Profile. */
export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.black,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: t('tabs.home'), tabBarIcon: tabIcon('home-outline') }}
      />
      <Tabs.Screen
        name="circles"
        options={{ title: t('tabs.circles'), tabBarIcon: tabIcon('aperture-outline') }}
      />
      <Tabs.Screen
        name="join-action"
        options={{
          title: t('tabs.join'),
          tabBarButton: () => (
            <JoinTabButton
              accessibilityLabel={t('join.a11yButton')}
              onPress={() => router.push('/join')}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="payment"
        options={{ title: t('tabs.payment'), tabBarIcon: tabIcon('wallet-outline') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t('tabs.profile'), tabBarIcon: tabIcon('person-circle-outline') }}
      />
    </Tabs>
  );
}
