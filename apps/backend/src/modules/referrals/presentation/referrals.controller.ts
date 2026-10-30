import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { type Principal } from '../../../shared/application/ports/access-token-verifier.port';
import { CurrentPrincipal } from '../../../shared/presentation/decorators/current-principal.decorator';
import { MoneyResponse } from '../../circles/presentation/http/dto/join-config.response';
import {
  ClaimReferralUseCase,
  GetMyReferralUseCase,
} from '../application/use-cases/referral.use-cases';
import { ClaimReferralRequest, ClaimReferralResponse, MyReferralResponse } from './referrals.dto';

/** Referidos (COPAYNI-51 a 53, docs/api/referrals.md). */
@ApiTags('referrals')
@ApiBearerAuth()
@Controller({ path: 'me', version: '1' })
export class ReferralsController {
  constructor(
    @Inject(GetMyReferralUseCase) private readonly getMine: GetMyReferralUseCase,
    @Inject(ClaimReferralUseCase) private readonly claim: ClaimReferralUseCase,
  ) {}

  @Get('referral')
  @ApiOkResponse({
    type: MyReferralResponse,
    description: 'Envuelto en { success, data, traceId }',
  })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async mine(@CurrentPrincipal() principal: Principal): Promise<MyReferralResponse> {
    return MyReferralResponse.from(await this.getMine.execute(principal));
  }

  @Post('referral/claim')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ClaimReferralResponse,
    description: 'Envuelto en { success, data, traceId }',
  })
  @ApiNotFoundResponse({ description: 'REFERRAL_CODE_NOT_FOUND' })
  @ApiConflictResponse({ description: 'REFERRAL_ALREADY_CLAIMED o REFERRAL_NOT_ELIGIBLE' })
  @ApiUnprocessableEntityResponse({ description: 'OWN_REFERRAL_CODE' })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async claimCode(
    @CurrentPrincipal() principal: Principal,
    @Body() body: ClaimReferralRequest,
  ): Promise<ClaimReferralResponse> {
    return { reward: MoneyResponse.from(await this.claim.execute(principal, body.code)) };
  }
}
