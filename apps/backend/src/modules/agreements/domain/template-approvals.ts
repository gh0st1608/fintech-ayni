import { type CadenceId } from '../../circles/domain/value-objects/cadence';

/**
 * En qué se sustenta el texto que se firma.
 *
 * - `legal`: el área legal redactó y aprobó el documento renderizado de esa cadencia.
 * - `provisional-po`: el texto **no** lo redactó Legal y el PO aceptó emitirlo así, con el riesgo
 *   acotado por el tope de payout (pending-scope §3.3, decisión del 16/11/2026). Vale como
 *   reconocimiento de deuda, no como título valor con mérito ejecutivo.
 */
export const APPROVAL_BASES = ['legal', 'provisional-po'] as const;
export type ApprovalBasis = (typeof APPROVAL_BASES)[number];

/** Quién aprobó una plantilla, cuándo y sobre qué base (COPAYNI-119). */
export interface TemplateApproval {
  readonly basis: ApprovalBasis;
  /** Persona o área que aprobó; queda en la evidencia de cada firma. */
  readonly approvedBy: string;
  /** `YYYY-MM-DD`. */
  readonly approvedOn: string;
  /** Qué se aprobó, para poder rastrearlo. */
  readonly reference: string;
}

/**
 * Plantillas aprobadas por cadencia.
 *
 * El contrato y el pagaré describen la obligación que el miembro asume, así que su texto tiene
 * que coincidir con el calendario que el sistema aplica. Hoy solo la cadencia mensual tiene un
 * texto emitible, y lo tiene sobre base **provisional**: el aviso va dentro del propio documento.
 *
 * Una cadencia sin entrada aquí no se puede habilitar: la validación de entorno lo impide al
 * arrancar (COPAYNI-119 bloquea COPAYNI-116). Añadir una entrada con base `legal` es lo que
 * desbloquea esa cadencia, y el registro humano está en `docs/legal/plantillas-aprobadas.md`.
 */
export const TEMPLATE_APPROVALS: Readonly<Partial<Record<CadenceId, TemplateApproval>>> = {
  monthly: {
    basis: 'provisional-po',
    approvedBy: 'PO (Erick Galindo)',
    approvedOn: '2026-11-16',
    reference: 'pending-scope §3.3: lanzar con firma simple por OTP y tope de payout bajo',
  },
};

/** La aprobación vigente de esa cadencia, o `null` si no tiene plantilla emitible. */
export function approvalFor(cadence: CadenceId): TemplateApproval | null {
  return TEMPLATE_APPROVALS[cadence] ?? null;
}

/**
 * Cadencias que se pueden habilitar hoy sin firmar un documento falso.
 *
 * La mensual sale con su texto provisional porque es una decisión tomada y acotada; cualquier
 * otra necesita que Legal haya aprobado su documento, porque sus plantillas dirían «meses» y
 * «mes de cobro» sobre una obligación que vence por semanas.
 */
export function cadenceCanBeOffered(cadence: CadenceId): boolean {
  const approval = approvalFor(cadence);
  if (!approval) return false;
  return cadence === 'monthly' || approval.basis === 'legal';
}
