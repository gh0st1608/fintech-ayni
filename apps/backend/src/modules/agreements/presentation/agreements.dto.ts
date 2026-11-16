import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

import {
  AGREEMENT_DOCUMENTS,
  AGREEMENT_STATUSES,
  type AgreementDocument,
  type AgreementStatus,
} from '../domain/agreement';
import {
  type AgreementDocumentView,
  type AgreementView,
  type SignatureCodeView,
} from '../application/agreements.use-cases';

export class AgreementResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  circleId!: string;

  @ApiProperty({ example: 3, description: 'Turno de la unión' })
  position!: number;

  @ApiProperty({ enum: AGREEMENT_STATUSES })
  status!: AgreementStatus;

  @ApiProperty({ description: 'Plazo para firmar; vencido, el turno se libera' })
  expiresAt!: string;

  @ApiProperty({ nullable: true, type: String })
  signedAt!: string | null;

  @ApiProperty({
    enum: AGREEMENT_DOCUMENTS,
    isArray: true,
    description: 'Documentos sin leer; con la lista vacía se puede pedir el código',
  })
  unread!: AgreementDocument[];

  static from(view: AgreementView): AgreementResponse {
    return {
      id: view.id,
      circleId: view.circleId,
      position: view.position,
      status: view.status,
      expiresAt: view.expiresAt.toISOString(),
      signedAt: view.signedAt?.toISOString() ?? null,
      unread: view.unread,
    };
  }
}

export class AgreementsResponse {
  @ApiProperty({ type: [AgreementResponse] })
  agreements!: AgreementResponse[];

  static from(views: AgreementView[]): AgreementsResponse {
    return { agreements: views.map((view) => AgreementResponse.from(view)) };
  }
}

export class AgreementDocumentResponse {
  @ApiProperty({ enum: AGREEMENT_DOCUMENTS })
  document!: AgreementDocument;

  @ApiProperty({ example: 'contract-provisional-1' })
  version!: string;

  @ApiProperty({ description: 'Texto que se firma, tal como se guardó al unirse' })
  text!: string;

  @ApiProperty({ description: 'SHA-256 del texto', minLength: 64, maxLength: 64 })
  hash!: string;

  @ApiProperty({ nullable: true, type: String, description: 'Cuándo se marcó leído' })
  readAt!: string | null;

  static from(view: AgreementDocumentView): AgreementDocumentResponse {
    return {
      document: view.document,
      version: view.version,
      text: view.text,
      hash: view.hash,
      readAt: view.readAt?.toISOString() ?? null,
    };
  }
}

export class SignatureCodeResponse {
  @ApiProperty({ format: 'uuid' })
  challengeId!: string;

  @ApiProperty({ example: '+51 ••• ••• 321', description: 'Destino enmascarado del código' })
  maskedDestination!: string;

  @ApiProperty()
  expiresAt!: string;

  @ApiProperty()
  resendAvailableAt!: string;

  static from(view: SignatureCodeView): SignatureCodeResponse {
    return {
      challengeId: view.challengeId,
      maskedDestination: view.maskedDestination,
      expiresAt: view.expiresAt.toISOString(),
      resendAvailableAt: view.resendAvailableAt.toISOString(),
    };
  }
}

export class SignAgreementRequest {
  @ApiProperty({ example: '1234', description: 'Código de 4 dígitos que firma los dos documentos' })
  @IsString()
  @Length(4, 4)
  code!: string;
}
