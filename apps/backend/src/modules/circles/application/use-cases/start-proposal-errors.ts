import { ConflictError } from '../../../../shared/errors/app-error';

/** La propuesta pasó a otra ronda: el miembro debe revisar las condiciones nuevas (COPAYNI-62). */
export const startProposalChanged = (): ConflictError =>
  new ConflictError(
    'START_PROPOSAL_CHANGED',
    'La propuesta cambió porque alguien salió del círculo: revisa las condiciones nuevas',
  );
