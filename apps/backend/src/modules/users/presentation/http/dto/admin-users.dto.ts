import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { MoneyResponse } from '../../../../circles/presentation/http/dto/join-config.response';
import { type KycDocumentState } from '../../../application/ports/admin-users-query.port';
import {
  type AdminUserDetailView,
  type AdminUserView,
} from '../../../application/use-cases/admin-users.use-cases';

const KYC_STATES: KycDocumentState[] = ['not_submitted', 'in_review', 'approved', 'rejected'];

export class AdminUsersQuery {
  @ApiProperty({
    description: 'Email completo, teléfono con código de país (+51…) o id. Solo búsqueda exacta',
    example: 'ana@mail.com',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  query!: string;
}

export class AdminUserResponse {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ enum: ['pending_verification', 'active'] })
  status!: string;

  @ApiProperty({ nullable: true, type: String, example: 'Juana P.' })
  name!: string | null;

  @ApiProperty({ nullable: true, type: String, example: 'j***@mail.com' })
  email!: string | null;

  @ApiProperty({ nullable: true, type: String, example: '+51******321' })
  phone!: string | null;

  @ApiProperty({ nullable: true, type: String, example: 'es' })
  preferredLanguage!: string | null;

  @ApiProperty()
  createdAt!: string;

  static from(user: AdminUserView): AdminUserResponse {
    return {
      userId: user.userId,
      status: user.status,
      name: user.name,
      email: user.email,
      phone: user.phone,
      preferredLanguage: user.preferredLanguage,
      createdAt: user.createdAt.toISOString(),
    };
  }
}

export class AdminUsersResponse {
  @ApiProperty({ type: [AdminUserResponse] })
  items!: AdminUserResponse[];
}

export class AdminUserKycResponse {
  @ApiProperty({ enum: KYC_STATES })
  national_id!: KycDocumentState;

  @ApiProperty({ enum: KYC_STATES })
  proof_of_income!: KycDocumentState;

  @ApiProperty({ enum: KYC_STATES })
  additional!: KycDocumentState;
}

export class AdminUserCircleResponse {
  @ApiProperty({ format: 'uuid' })
  circleId!: string;

  @ApiProperty({ example: 'contributing' })
  state!: string;

  @ApiProperty({ type: MoneyResponse })
  payout!: MoneyResponse;

  @ApiProperty()
  months!: number;

  @ApiProperty({ description: 'Turno' })
  position!: number;

  @ApiProperty()
  joinedAt!: string;

  @ApiProperty({ nullable: true, type: String })
  expelledAt!: string | null;
}

export class AdminUserDetailResponse extends AdminUserResponse {
  @ApiProperty({
    type: AdminUserKycResponse,
    description: 'Estado del último documento de cada tipo',
  })
  kyc!: AdminUserKycResponse;

  @ApiProperty({
    type: [AdminUserCircleResponse],
    description: 'Juntas, de la más reciente a la más antigua',
  })
  circles!: AdminUserCircleResponse[];

  static fromView(user: AdminUserDetailView): AdminUserDetailResponse {
    return {
      ...AdminUserResponse.from(user),
      kyc: { ...user.kyc },
      circles: user.circles.map((circle) => ({
        circleId: circle.circleId,
        state: circle.state,
        payout: MoneyResponse.from(circle.payout),
        months: circle.months,
        position: circle.position,
        joinedAt: circle.joinedAt.toISOString(),
        expelledAt: circle.expelledAt?.toISOString() ?? null,
      })),
    };
  }
}
