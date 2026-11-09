import type {
  CircleDetail,
  CirclesPage,
  CircleSummary,
  PauseAction,
  PauseResult,
} from '@/domain/circles/Circle';
import type {
  CirclesFilter,
  CirclesRepositoryPort,
  DevCredentials,
  StaffAuthPort,
} from '@/domain/ports';
import { AppError } from '@/domain/shared/AppError';
import type { StaffMember } from '@/domain/staff/Staff';

export const NOW = new Date('2026-11-09T15:00:00Z');

export class InMemoryStaffAuth implements StaffAuthPort {
  staff: StaffMember | null = null;

  signIn(credentials: DevCredentials): Promise<StaffMember> {
    this.staff = {
      staffId: `dev:${credentials.email}`,
      email: credentials.email,
      roles: credentials.roles,
      authenticatedAt: NOW,
    };
    return Promise.resolve(this.staff);
  }

  current(): Promise<StaffMember | null> {
    return Promise.resolve(this.staff);
  }

  signOut(): void {
    this.staff = null;
  }
}

let sequence = 0;

export function circle(overrides: Partial<CircleDetail> = {}): CircleDetail {
  sequence += 1;
  const id = `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
  return {
    circleId: id,
    state: 'contributing',
    payout: { amount: 600_000, currency: 'PEN' },
    months: 6,
    startsOn: '2026-12',
    members: 4,
    createdAt: NOW,
    currentPeriod: '2026-12',
    pausedOn: null,
    memberships: [
      {
        userId: '11111111-1111-4111-8111-111111111111',
        position: 1,
        name: 'Juana P.',
        email: 'j***@mail.com',
        phone: '+51******321',
        joinedAt: NOW,
        expelledAt: null,
      },
    ],
    startProposal: null,
    ...overrides,
  };
}

export class InMemoryCircles implements CirclesRepositoryPort {
  readonly pauses: { circleId: string; action: PauseAction; reason: string }[] = [];
  pageSize = 25;

  constructor(public circles: CircleDetail[] = []) {}

  list(filter: CirclesFilter): Promise<CirclesPage> {
    const matching = this.circles.filter(({ state }) => !filter.state || state === filter.state);
    const start = filter.cursor ? Number(filter.cursor) : 0;
    const items: CircleSummary[] = structuredClone(matching.slice(start, start + this.pageSize));
    const next = start + this.pageSize;
    return Promise.resolve({ items, nextCursor: next < matching.length ? String(next) : null });
  }

  get(circleId: string): Promise<CircleDetail> {
    const found = this.circles.find((item) => item.circleId === circleId);
    // Copias, como un backend real: el doble modifica sus juntas al pausar.
    return found
      ? Promise.resolve(structuredClone(found))
      : Promise.reject(new AppError('not_found', 'No existe', 'CIRCLE_NOT_FOUND'));
  }

  setPause(circleId: string, action: PauseAction, reason: string): Promise<PauseResult> {
    this.pauses.push({ circleId, action, reason });
    const found = this.circles.find((item) => item.circleId === circleId);
    if (found) found.state = action === 'pause' ? 'paused' : 'contributing';
    return Promise.resolve({ state: found?.state ?? 'paused', changed: true });
  }
}
