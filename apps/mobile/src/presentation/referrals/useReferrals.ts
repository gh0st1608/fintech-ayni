import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import type { ReferralInvite } from '@/domain/referrals/Referral';
import { useContainer } from '@/presentation/providers/ContainerProvider';

export const myReferralQueryKey = ['referrals', 'mine'] as const;
export const referralsQueryKey = ['referrals', 'summary'] as const;

/** Mi código, enlace y beneficio (GET /me/referral). */
export function useMyReferral() {
  const { referrals } = useContainer();
  return useQuery({
    queryKey: myReferralQueryKey,
    queryFn: ({ signal }) => referrals.getMine.execute(signal),
    // El código no cambia: se conserva en caché para mostrarlo sin conexión.
    staleTime: Infinity,
  });
}

/** Saldo e invitados de My Referrals (GET /me/referrals), paginados por cursor. */
export function useReferrals(enabled = true) {
  const { referrals } = useContainer();
  return useInfiniteQuery({
    queryKey: referralsQueryKey,
    queryFn: ({ pageParam, signal }) => referrals.list.execute(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled,
  });
}

export function useCopyReferralCode() {
  const { referrals } = useContainer();
  return useMutation({
    mutationFn: (invite: ReferralInvite) => referrals.copyCode.execute(invite),
  });
}

export function useShareInvite() {
  const { referrals } = useContainer();
  return useMutation({
    mutationFn: ({ invite, message }: { invite: ReferralInvite; message: string }) =>
      referrals.shareInvite.execute(invite, message),
  });
}

/** Al entrar con sesión se envía el código de un enlace de invitación, si quedó pendiente. */
export function useClaimPendingReferral() {
  const { claimPending } = useContainer().referrals;
  useEffect(() => {
    void claimPending.execute();
  }, [claimPending]);
}
