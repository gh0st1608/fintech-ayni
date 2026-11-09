import { Inject, Injectable } from '@nestjs/common';

import { maskEmail, maskName, maskPhone } from '../../../../shared/domain/services/mask-pii';
import { NotFoundError } from '../../../../shared/errors/app-error';
import {
  ADMIN_CIRCLES_QUERY,
  type AdminCircleDetail,
  type AdminCirclesFilter,
  type AdminCirclesPage,
  type AdminCirclesQueryPort,
} from '../ports/admin-circles-query.port';

/** Miembro como lo ve el personal: identificado, pero con sus datos personales enmascarados. */
export interface MaskedCircleMember {
  userId: string;
  position: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  joinedAt: Date;
  expelledAt: Date | null;
}

export type AdminCircleView = Omit<AdminCircleDetail, 'memberships'> & {
  memberships: MaskedCircleMember[];
};

/** `GET /admin/v1/circles`: los círculos por estado, del más nuevo al más antiguo. */
@Injectable()
export class ListAdminCirclesUseCase {
  constructor(@Inject(ADMIN_CIRCLES_QUERY) private readonly circles: AdminCirclesQueryPort) {}

  execute(filter: AdminCirclesFilter): Promise<AdminCirclesPage> {
    return this.circles.list(filter);
  }
}

/**
 * `GET /admin/v1/circles/:circleId`: el detalle con miembros, turnos y la propuesta de inicio. Los
 * datos personales salen enmascarados (docs/backoffice-plan.md §4).
 */
@Injectable()
export class GetAdminCircleUseCase {
  constructor(@Inject(ADMIN_CIRCLES_QUERY) private readonly circles: AdminCirclesQueryPort) {}

  async execute(circleId: string): Promise<AdminCircleView> {
    const circle = await this.circles.find(circleId);
    if (!circle) throw new NotFoundError('No existe ese círculo', 'CIRCLE_NOT_FOUND');
    return {
      ...circle,
      memberships: circle.memberships.map((member) => ({
        userId: member.userId,
        position: member.position,
        name: maskName(member.firstName, member.lastName),
        email: member.email ? maskEmail(member.email) : null,
        phone: member.phone ? maskPhone(member.phone) : null,
        joinedAt: member.joinedAt,
        expelledAt: member.expelledAt,
      })),
    };
  }
}
