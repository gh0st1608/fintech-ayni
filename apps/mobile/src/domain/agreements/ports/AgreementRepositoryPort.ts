import type {
  AgreementDocument,
  AgreementDocumentText,
  MembershipAgreement,
  SignatureChallenge,
} from '../MembershipAgreement';

/** Firma del contrato y del pagaré del backend (docs/api/agreements.md). */
export interface AgreementRepositoryPort {
  list(signal?: AbortSignal): Promise<MembershipAgreement[]>;
  /** Devuelve el texto y **lo marca leído**: abrirlo es lo que cuenta como leerlo. */
  readDocument(
    agreementId: string,
    document: AgreementDocument,
    signal?: AbortSignal,
  ): Promise<AgreementDocumentText>;
  /** Envía el código al celular; repetirlo lo reenvía con la ventana del OTP. */
  requestSignatureCode(agreementId: string): Promise<SignatureChallenge>;
  /** Firma los dos documentos a la vez; el backend guarda la evidencia. */
  sign(agreementId: string, code: string): Promise<MembershipAgreement>;
}
