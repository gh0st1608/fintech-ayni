import { type CadenceId } from '../../domain/value-objects/cadence';
import { type Money } from '../../../../shared/domain/value-objects/money';

export const MEMBERSHIP_AGREEMENTS = Symbol('MEMBERSHIP_AGREEMENTS');

/** Datos del turno con los que se redactan el contrato y el pagaré (COPAYNI-89). */
export interface AgreementTerms {
  readonly payout: Money;
  readonly months: number;
  readonly position: number;
  readonly baseInstallment: Money;
  readonly totalPaid: Money;
  readonly retention: Money;
  /** Mes de inicio del círculo, `YYYY-MM`. */
  readonly startsOn: string;
  /** Mes en que le toca cobrar, `YYYY-MM`. */
  readonly payoutPeriod: string;
  /**
   * Lo que el documento necesita para describir la obligación real (COPAYNI-119): la frecuencia,
   * los turnos, las fechas de cada vencimiento y los parámetros de morosidad de esa cadencia.
   * Sin esto el contrato hablaría de meses sobre una junta que vence por semanas.
   */
  readonly cadence: CadenceId;
  readonly turns: number;
  readonly unit: string;
  /** `YYYY-MM-DD` del primer y del último turno. */
  readonly startsOnDate: string;
  readonly endsOnDate: string;
  /** `YYYY-MM-DD` en que cobra el pozo. */
  readonly payoutOn: string;
  /** El pozo menos la retención: lo que recibe de inmediato. */
  readonly netPayout: Money;
  readonly dueDates: readonly { readonly turn: number; readonly dueOn: string }[];
  readonly graceDays: number;
  readonly lateFeeBps: number;
}

/** Una membresía que venció sin firmar: su turno se libera. */
export interface UnsignedMembership {
  readonly agreementId: string;
  readonly userId: string;
  readonly circleId: string;
  readonly position: number;
}

/**
 * Lo que los círculos necesitan de la firma del contrato y del pagaré (COPAYNI-89). Lo implementa
 * el módulo `agreements`; la dependencia va en un solo sentido, como con `JOIN_ELIGIBILITY`.
 */
export interface MembershipAgreementsPort {
  /** Abre los dos acuerdos pendientes de firma al unirse, con el plazo configurado. */
  openFor(props: {
    userId: string;
    circleId: string;
    position: number;
    terms: AgreementTerms;
  }): Promise<void>;
  /** Si la persona ya firmó el contrato y el pagaré de ese círculo. */
  signedFor(userId: string, circleId: string): Promise<boolean>;
  /**
   * Si a la persona le queda algún acuerdo sin firmar, para el checklist de elegibilidad. Quien
   * se unió antes de COPAYNI-89 no tiene acuerdos: no se le exige una firma retroactiva.
   */
  hasUnsigned(userId: string): Promise<boolean>;
  /**
   * Marca vencidos los acuerdos que pasaron su plazo sin firma y devuelve las membresías cuyo
   * turno hay que liberar. Idempotente.
   */
  expire(): Promise<UnsignedMembership[]>;
}
