import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsEmail, IsIn } from 'class-validator';

import {
  STAFF_ROLES,
  type StaffPrincipal,
  type StaffRole,
} from '../../../application/ports/staff-authenticator.port';

export class StaffMeResponse {
  @ApiProperty()
  staffId!: string;

  @ApiProperty({ required: false, nullable: true })
  email!: string | null;

  @ApiProperty({ enum: STAFF_ROLES, isArray: true })
  roles!: StaffRole[];

  @ApiProperty({ description: 'Última autenticación real, para el step-up' })
  authenticatedAt!: string;

  static from(staff: StaffPrincipal): StaffMeResponse {
    return {
      staffId: staff.staffId,
      email: staff.email ?? null,
      roles: [...staff.roles],
      authenticatedAt: staff.authenticatedAt.toISOString(),
    };
  }
}

/** Solo con `STAFF_AUTH_PROVIDER=dev`. */
export class DevStaffSessionRequest {
  @ApiProperty({ example: 'ops@ayni.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: STAFF_ROLES, isArray: true, example: ['operations'] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(STAFF_ROLES, { each: true })
  roles!: StaffRole[];
}

export class DevStaffSessionResponse {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ example: 3600 })
  expiresIn!: number;
}
