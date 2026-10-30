import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { UserProfile } from '@/domain/profile/UserProfile';
import { useContainer } from '@/presentation/providers/ContainerProvider';

export const profileQueryKey = ['profile', 'me'] as const;

/** Mi perfil (GET /v1/me). */
export function useProfile() {
  const { profile } = useContainer();
  return useQuery({
    queryKey: profileQueryKey,
    queryFn: ({ signal }) => profile.getMyProfile.execute(signal),
  });
}

/** Guarda nombre y apellido y deja la respuesta en la caché del perfil. */
export function useUpdatePersonalInfo() {
  const { profile } = useContainer();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (info: { firstName: string; lastName: string }) =>
      profile.updatePersonalInfo.execute(info),
    onSuccess: (saved: UserProfile) => queryClient.setQueryData(profileQueryKey, saved),
  });
}

export function useStartContactChange() {
  const { profile } = useContainer();
  return useMutation({ mutationFn: (raw: string) => profile.startContactChange.execute(raw) });
}

export function useVerifyContactChange() {
  const { profile } = useContainer();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ challengeId, code }: { challengeId: string; code: string }) =>
      profile.verifyContactChange.execute(challengeId, code),
    onSuccess: (saved: UserProfile) => {
      queryClient.setQueryData(profileQueryKey, saved);
      // Con un email nuevo ya se pueden guardar tarjetas (EMAIL_REQUIRED).
      void queryClient.invalidateQueries({ queryKey: ['payments', 'cards'] });
    },
  });
}
