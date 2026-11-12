import type {
  AppNotification,
  NotificationsPage,
  NotificationTab,
} from '@/domain/notifications/Notification';
import type { NotificationRepositoryPort } from '@/domain/notifications/NotificationRepositoryPort';
import { Money } from '@/domain/shared/value-objects/Money';
import { simulateLatency } from '@/infrastructure/fake/simulateLatency';

export interface InMemoryNotificationOptions {
  latencyMs?: number;
  items?: AppNotification[];
  pageSize?: number;
}

/** Ejemplos del Figma (2052:2373) para el modo dev sin backend. */
function samples(currency: string, now: Date): AppNotification[] {
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
  const base = { circleId: 'c-1', dueOn: null, period: null, documentType: null, read: false };
  return [
    {
      ...base,
      id: 'n-1',
      type: 'installmentDueSoon',
      category: 'payments',
      amount: Money.fromMajor(560, currency),
      dueOn: '2026-12-01',
      occurredAt: hoursAgo(1),
    },
    {
      ...base,
      id: 'n-2',
      type: 'payoutTurn',
      category: 'payments',
      amount: Money.fromMajor(24_000, currency),
      period: '2026-11',
      occurredAt: hoursAgo(3),
    },
    {
      ...base,
      id: 'n-3',
      type: 'documentApproved',
      category: 'account',
      circleId: null,
      amount: null,
      documentType: 'national_id',
      occurredAt: hoursAgo(72),
      read: true,
    },
    {
      ...base,
      id: 'n-4',
      type: 'circleMemberJoined',
      category: 'circles',
      amount: null,
      occurredAt: hoursAgo(96),
      read: true,
    },
  ];
}

/** Bandeja falsa (solo dev y pruebas), con la misma paginación y filtros que el backend. */
export class InMemoryNotificationRepository implements NotificationRepositoryPort {
  items: AppNotification[];
  private readonly latencyMs: number;
  private readonly pageSize: number;

  constructor(currency: string, options: InMemoryNotificationOptions = {}) {
    this.latencyMs = options.latencyMs ?? 300;
    this.pageSize = options.pageSize ?? 20;
    this.items = options.items ?? samples(currency, new Date());
  }

  async list(
    filter: { tab: NotificationTab; cursor: string | null },
    signal?: AbortSignal,
  ): Promise<NotificationsPage> {
    await simulateLatency(this.latencyMs, signal);
    const matching = this.items
      .filter((item) => filter.tab === 'all' || item.category === filter.tab)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    const start = filter.cursor ? Number(filter.cursor) : 0;
    const next = start + this.pageSize;
    return {
      items: matching.slice(start, next).map((item) => ({ ...item })),
      nextCursor: next < matching.length ? String(next) : null,
      unread: this.unread(),
    };
  }

  async unreadCount(signal?: AbortSignal): Promise<number> {
    await simulateLatency(this.latencyMs, signal);
    return this.unread();
  }

  async markRead(ids: readonly string[] | null): Promise<number> {
    await simulateLatency(this.latencyMs);
    this.items = this.items.map((item) =>
      ids === null || ids.includes(item.id) ? { ...item, read: true } : item,
    );
    return this.unread();
  }

  private unread(): number {
    return this.items.filter((item) => !item.read).length;
  }
}
