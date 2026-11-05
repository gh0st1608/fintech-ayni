import type { CircleMembershipRepositoryPort } from '@/domain/circles/ports/CircleMembershipRepositoryPort';
import type { StartDecision, StartProposal } from '@/domain/circles/StartProposal';

export class ListStartProposalsUseCase {
  constructor(private readonly repository: CircleMembershipRepositoryPort) {}

  execute(signal?: AbortSignal): Promise<StartProposal[]> {
    return this.repository.listStartProposals(signal);
  }
}

export class RespondStartProposalUseCase {
  constructor(private readonly repository: CircleMembershipRepositoryPort) {}

  execute(circleId: string, decision: StartDecision): Promise<void> {
    return this.repository.respondStartProposal(circleId, decision);
  }
}
