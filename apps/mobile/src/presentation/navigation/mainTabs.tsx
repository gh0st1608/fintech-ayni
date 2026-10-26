import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColorValue } from 'react-native';

import { JoinTabButton } from '@/presentation/shared/components/JoinTabButton';
import { colors } from '@/presentation/theme/tokens';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface TabIconProps {
  color: ColorValue;
  size: number;
}

export interface MainTab {
  /** Nombre de la ruta hija del navegador de pestañas. */
  name: 'home' | 'circles' | 'join-action' | 'payment' | 'profile';
  options: {
    title: string;
    tabBarIcon?: (props: TabIconProps) => React.ReactNode;
    tabBarButton?: () => React.ReactNode;
  };
}

export const MAIN_TABS_SCREEN_OPTIONS = {
  headerShown: false,
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.black,
} as const;

function icon(name: IconName) {
  return function TabIcon({ color, size }: TabIconProps) {
    return (
      <Ionicons name={name} color={typeof color === 'string' ? color : undefined} size={size} />
    );
  };
}

/**
 * Pestañas del Figma: Home, Circles, botón central "+", Payment y Profile.
 * La navegación del botón central la decide la ruta (onJoinPress); la UI no conoce URLs.
 */
export function useMainTabs({ onJoinPress }: { onJoinPress: () => void }): MainTab[] {
  const { t } = useTranslation();

  return useMemo(
    () => [
      { name: 'home', options: { title: t('tabs.home'), tabBarIcon: icon('home-outline') } },
      {
        name: 'circles',
        options: { title: t('tabs.circles'), tabBarIcon: icon('aperture-outline') },
      },
      {
        name: 'join-action',
        options: {
          title: t('tabs.join'),
          tabBarButton: () => (
            <JoinTabButton accessibilityLabel={t('join.a11yButton')} onPress={onJoinPress} />
          ),
        },
      },
      {
        name: 'payment',
        options: { title: t('tabs.payment'), tabBarIcon: icon('wallet-outline') },
      },
      {
        name: 'profile',
        options: { title: t('tabs.profile'), tabBarIcon: icon('person-circle-outline') },
      },
    ],
    [t, onJoinPress],
  );
}
