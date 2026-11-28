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
 * que coincidir con el calendario que el sistema aplica. Las tres cadencias tienen hoy un texto
 * emitible y las tres lo tienen sobre base **provisional**: el aviso va dentro del propio
 * documento, y lo que acota la exposición es el tope de payout.
 *
 * Una cadencia sin entrada aquí no se puede habilitar: la validación de entorno lo impide al
 * arrancar (COPAYNI-119 bloquea COPAYNI-116). El registro humano, con quién aprobó qué y sobre
 * qué base, está en `docs/legal/plantillas-aprobadas.md`; los dos tienen que decir lo mismo.
 */
export const TEMPLATE_APPROVALS: Readonly<Partial<Record<CadenceId, TemplateApproval>>> = {
  monthly: {
    basis: 'provisional-po',
    approvedBy: 'PO (Erick Galindo)',
    approvedOn: '2026-11-16',
    reference: 'pending-scope §3.3: lanzar con firma simple por OTP y tope de payout bajo',
  },
  biweekly: {
    basis: 'provisional-po',
    approvedBy: 'PO (Erick Galindo)',
    approvedOn: '2026-11-28',
    reference: 'docs/legal/ejemplos/quincenal-4-turnos.txt, revisado por el PO (COPAYNI-119)',
  },
  weekly: {
    basis: 'provisional-po',
    approvedBy: 'PO (Erick Galindo)',
    approvedOn: '2026-11-28',
    reference:
      'docs/legal/ejemplos/semanal-4-turnos.txt y semanal-12-turnos.txt, revisados por el PO (COPAYNI-119)',
  },
};

/** La aprobación vigente de esa cadencia, o `null` si no tiene plantilla emitible. */
export function approvalFor(cadence: CadenceId): TemplateApproval | null {
  return TEMPLATE_APPROVALS[cadence] ?? null;
}

/**
 * Cadencias que se pueden habilitar hoy sin firmar un documento falso.
 *
 * Basta con que la cadencia tenga una aprobación registrada, de Legal o del PO. Hasta el 28 de
 * noviembre de 2026 la base provisional solo valía para la mensual, porque las plantillas de
 * entonces decían «meses» y «mes de cobro» sobre una obligación que vence por semanas: emitirlas
 * en semanal habría sido firmar un texto falso. Eso dejó de ser cierto con COPAYNI-119: el
 * documento se renderiza por cadencia, con sus turnos, sus fechas reales de vencimiento, su
 * retención y su cargo por mora, y los cuatro ejemplos están en `docs/legal/ejemplos/`. Sobre
 * ese texto, el PO asumió para las tres cadencias la misma decisión que ya había tomado para la
 * mensual (pending-scope §3.3), con la exposición acotada por el tope de payout.
 *
 * Lo que **no** cambia: una base `provisional-po` sigue valiendo como reconocimiento de deuda
 * firmado y no como título valor con mérito ejecutivo, y el aviso sigue dentro del documento.
 * Las preguntas de ejecutabilidad del pagaré siguen abiertas en COPAYNI-99.
 */
export function cadenceCanBeOffered(cadence: CadenceId): boolean {
  return approvalFor(cadence) !== null;
}
