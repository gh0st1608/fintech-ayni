import { z } from 'zod';

import type {
  AppNotification,
  NotificationsPage,
  NotificationTab,
  NotificationType,
} from '@/domain/notifications/Notification';
import type { NotificationRepositoryPort } from '@/domain/notifications/NotificationRepositoryPort';
import type { HttpClientPort } from '@/domain/shared/ports/HttpClientPort';
import { moneyDto, toMoney } from '@/infrastructure/circles/moneyDto';

const TYPE_BY_DTO: Record<string, NotificationType> = {
  installment_due_soon: 'installmentDueSoon',
  installment_due_today: 'installmentDueToday',
  payment_received: 'paymentReceived',
  payment_failed: 'paymentFailed',
  payout_turn: 'payoutTurn',
  payout_disbursed: 'payoutDisbursed',
  document_approved: 'documentApproved',
  document_rejected: 'documentRejected',
  circle_started: 'circleStarted',
  circle_paused: 'circlePaused',
  circle_resumed: 'circleResumed',
  circle_member_joined: 'circleMemberJoined',
};

const notificationDto = z.object({
  id: z.string().min(1),
  type: z.string(),
  category: z.enum(['payments', 'circles', 'account']),
  data: z.object({
    circleId: z.string().optional(),
    amount: moneyDto.optional(),
    dueOn: z.string().optional(),
    period: z.string().optional(),
    documentType: z.string().optional(),
  }),
  occurredAt: z.iso.datetime({ offset: true }),
  read: z.boolean(),
});

const pageDto = z.object({
  items: z.array(notificationDto),
  nextCursor: z.string().nullable(),
  unread: z.number().int().nonnegative(),
});

const unreadDto = z.object({ unread: z.number().int().nonnegative() });

/** Un tipo que esta versión de la app no conoce se omite en vez de mostrarse vacío. */
function toNotification(dto: z.infer<typeof notificationDto>): AppNotification | null {
  const type = TYPE_BY_DTO[dto.type];
  if (!type) return null;
  return {
    id: dto.id,
    type,
    category: dto.category,
    circleId: dto.data.circleId ?? null,
    amount: dto.data.amount ? toMoney(dto.data.amount) : null,
    dueOn: dto.data.dueOn ?? null,
    period: dto.data.period ?? null,
    documentType: dto.data.documentType ?? null,
    occurredAt: new Date(dto.occurredAt),
    read: dto.read,
  };
}

/** Adaptador HTTP de la bandeja (COPAYNI-84). */
export class NotificationApiRepository implements NotificationRepositoryPort {
  constructor(private readonly http: HttpClientPort) {}

  async list(
    filter: { tab: NotificationTab; cursor: string | null },
    signal?: AbortSignal,
  ): Promise<NotificationsPage> {
    const query = new URLSearchParams();
    if (filter.tab !== 'all') query.set('category', filter.tab);
    if (filter.cursor) query.set('cursor', filter.cursor);
    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    const dto = await this.http.get(`/me/notifications${suffix}`, {
      signal,
      parse: (data) => pageDto.parse(data),
    });
    return {
      items: dto.items.map(toNotification).filter((item) => item !== null),
      nextCursor: dto.nextCursor,
      unread: dto.unread,
    };
  }

  async unreadCount(signal?: AbortSignal): Promise<number> {
    const { unread } = await this.http.get('/me/notifications/unread-count', {
      signal,
      parse: (data) => unreadDto.parse(data),
    });
    return unread;
  }

  async markRead(ids: readonly string[] | null): Promise<number> {
    const { unread } = await this.http.post('/me/notifications/read', {
      body: ids ? { ids } : {},
      parse: (data) => unreadDto.parse(data),
    });
    return unread;
  }
}
