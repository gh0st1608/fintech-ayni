import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  AgreementDocument,
  MembershipAgreement,
  SignatureChallenge,
} from '@/domain/agreements/MembershipAgreement';
import { payoutEligibilityQueryKey } from '@/presentation/payment/usePayments';
import { useContainer } from '@/presentation/providers/ContainerProvider';

export const agreementsQueryKey = ['agreements'] as const;

/** Mis contratos y pagarés (GET /me/agreements). */
export function useAgreements() {
  const { agreements } = useContainer();
  return useQuery({
    queryKey: agreementsQueryKey,
    queryFn: ({ signal }) => agreements.list.execute(signal),
  });
}

/** Un acuerdo concreto de la lista ya cargada, sin un endpoint de detalle. */
export function useAgreement(agreementId: string | undefined) {
  const query = useAgreements();
  return {
    ...query,
    agreement: query.data?.find(({ id }) => id === agreementId),
  };
}

/** Leer un documento lo marca leído, así que al volver cambia lo que falta por leer. */
export function useReadAgreementDocument(agreementId: string, document: AgreementDocument) {
  const { agreements } = useContainer();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: [...agreementsQueryKey, agreementId, document] as const,
    queryFn: async ({ signal }) => {
      const text = await agreements.readDocument.execute(agreementId, document, signal);
      void queryClient.invalidateQueries({ queryKey: agreementsQueryKey });
      return text;
    },
  });
}

/** Pide o reenvía el código de firma. */
export function useRequestSignatureCode() {
  const { agreements } = useContainer();
  return useMutation<SignatureChallenge, Error, MembershipAgreement>({
    mutationFn: (agreement) => agreements.requestSignatureCode.execute(agreement),
  });
}

/**
 * Firma los dos documentos. Al firmar, la unión queda firme: se refrescan los acuerdos y el
 * checklist de elegibilidad, donde el contrato y el pagaré pasan a cumplidos.
 */
export function useSignAgreement() {
  const { agreements } = useContainer();
  const queryClient = useQueryClient();
  return useMutation<MembershipAgreement, Error, { agreementId: string; code: string }>({
    mutationFn: ({ agreementId, code }) => agreements.sign.execute(agreementId, code),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: agreementsQueryKey });
      void queryClient.invalidateQueries({ queryKey: payoutEligibilityQueryKey });
    },
  });
}
