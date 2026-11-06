import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { BiometricAvailability } from '@/domain/auth/ports/BiometricPorts';
import { useContainer } from '@/presentation/providers/ContainerProvider';
import { AppText } from '@/presentation/shared/components/AppText';
import { Toggle } from '@/presentation/shared/components/Toggle';
import { colors, spacing } from '@/presentation/theme/tokens';

const BIOMETRIC_STATUS_KEY = ['biometric-status'] as const;

const UNAVAILABLE_KEYS = {
  no_hardware: 'profile.biometrics.noHardware',
  not_enrolled: 'profile.biometrics.notEnrolled',
} as const satisfies Record<Exclude<BiometricAvailability, 'available'>, string>;

/** "Enable Biometrics" del Perfil (Figma 55:10201, COPAYNI-22). */
export function BiometricToggle() {
  const { t } = useTranslation();
  const { auth } = useContainer();
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: BIOMETRIC_STATUS_KEY,
    queryFn: () => auth.getBiometricStatus.execute(),
  });
  const toggle = useMutation({
    mutationFn: async (enable: boolean) => {
      if (!enable) {
        await auth.disableBiometricUnlock.execute();
        return 'success';
      }
      return auth.enableBiometricUnlock.execute({
        message: t('profile.biometrics.prompt'),
        cancelLabel: t('common.cancel'),
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: BIOMETRIC_STATUS_KEY }),
  });

  if (!status.data) return null;
  const { availability, enabled } = status.data;
  const rejected =
    toggle.isError ||
    (toggle.data !== undefined && !['success', 'cancelled'].includes(toggle.data));

  return (
    <View style={{ gap: spacing.xs }}>
      <Toggle
        label={t('profile.biometrics.label')}
        description={availability === 'available' ? undefined : t(UNAVAILABLE_KEYS[availability])}
        value={enabled}
        onValueChange={(value) => toggle.mutate(value)}
        disabled={availability !== 'available' || toggle.isPending}
        testID="biometric-toggle"
      />
      {rejected && (
        <AppText accessibilityRole="alert" color={colors.error}>
          {t('profile.biometrics.failed')}
        </AppText>
      )}
    </View>
  );
}
