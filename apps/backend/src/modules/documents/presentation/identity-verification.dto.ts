import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

import { type IdentityVerification } from '../application/identity-verification.ports';
import {
  IDENTITY_REJECTION_REASON_CODES,
  IDENTITY_REJECTION_REASONS,
  type IdentityRejectionReason,
  IDENTITY_VERIFICATION_STATUSES,
  maskDocument,
} from '../domain/identity-verification';

export class StartIdentityVerificationRequest {
  @ApiProperty({ example: '45678912', description: 'DNI de 8 dígitos' })
  @IsString()
  @MaxLength(12)
  documentNumber!: string;

  @ApiProperty({
    example: '2026-11',
    description: 'Versión del consentimiento aceptada (`consentVersion` del GET)',
  })
  @IsString()
  @MaxLength(32)
  consentVersion!: string;
}

const STATUSES = ['not_started', ...IDENTITY_VERIFICATION_STATUSES] as const;

export class IdentityVerificationResponse {
  @ApiProperty({ enum: STATUSES })
  status!: (typeof STATUSES)[number];

  @ApiProperty({ description: 'Versión vigente del consentimiento biométrico, para aceptarla' })
  consentVersion!: string;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  id!: string | null;

  @ApiProperty({ example: '•••••912', nullable: true, type: String })
  documentNumber!: string | null;

  @ApiProperty({ enum: IDENTITY_REJECTION_REASON_CODES, nullable: true })
  reason!: IdentityRejectionReason | null;

  @ApiProperty({ nullable: true, type: String, description: 'Texto del rechazo para mostrar' })
  message!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Enlace del flujo biométrico del proveedor; solo mientras está in_progress',
  })
  verificationUrl!: string | null;

  @ApiProperty({ nullable: true, type: String })
  createdAt!: string | null;

  @ApiProperty({ nullable: true, type: String })
  decidedAt!: string | null;

  static from(
    verification: IdentityVerification | null,
    consentVersion: string,
  ): IdentityVerificationResponse {
    if (verification === null) {
      return {
        status: 'not_started',
        consentVersion,
        id: null,
        documentNumber: null,
        reason: null,
        message: null,
        verificationUrl: null,
        createdAt: null,
        decidedAt: null,
      };
    }
    return {
      status: verification.status,
      consentVersion,
      id: verification.id,
      documentNumber: maskDocument(verification.documentNumber),
      reason: verification.reason,
      message: verification.reason ? IDENTITY_REJECTION_REASONS[verification.reason] : null,
      verificationUrl: verification.status === 'in_progress' ? verification.verificationUrl : null,
      createdAt: verification.createdAt.toISOString(),
      decidedAt: verification.decidedAt?.toISOString() ?? null,
    };
  }
}
