import { z } from 'zod';

import type { PayoutMethodRepositoryPort } from '@/domain/payouts/ports/PayoutMethodRepositoryPort';
import {
  PayoutMethod,
  type PayoutMethods,
  type PayoutMethodType,
} from '@/domain/payouts/value-objects/PayoutMethod';
import type { HttpClientPort } from '@/domain/shared/ports/HttpClientPort';
import { moneyDto, toMoney } from '@/infrastructure/circles/moneyDto';

const TYPE_BY_DTO = {
  digital_wallet: 'digitalWallet',
  prepaid_card: 'prepaidCard',
  bank_transfer: 'bankTransfer',
  fawry: 'fawry',
} as const satisfies Record<string, PayoutMethodType>;

type PayoutMethodDtoType = keyof typeof TYPE_BY_DTO;
const DTO_TYPES = Object.keys(TYPE_BY_DTO) as [PayoutMethodDtoType, ...PayoutMethodDtoType[]];
const DTO_BY_TYPE = Object.fromEntries(
  Object.entries(TYPE_BY_DTO).map(([dto, type]) => [type, dto]),
) as Record<PayoutMethodType, PayoutMethodDtoType>;

/** DTO de GET y PUT /me/payout-method (docs/api/payouts.md). */
const payoutMethodsDto = z.object({
  methods: z.array(
    z.object({
      type: z.enum(DTO_TYPES),
      available: z.boolean(),
      // Badges que la app todavía no conoce se ignoran.
      badges: z.array(z.string()),
      limit: moneyDto.nullable(),
    }),
  ),
  selected: z.enum(DTO_TYPES).nullable(),
});

const toPayoutMethods = (dto: z.infer<typeof payoutMethodsDto>): PayoutMethods => ({
  methods: dto.methods.map((method) =>
    PayoutMethod.create({
      type: TYPE_BY_DTO[method.type],
      available: method.available,
      badges: method.badges.includes('no_charge') ? ['noCharge'] : [],
      limit: method.limit ? toMoney(method.limit) : null,
    }),
  ),
  selected: dto.selected ? TYPE_BY_DTO[dto.selected] : null,
});

/** Adaptador HTTP de los métodos de cobro (COPAYNI-37). */
export class PayoutMethodApiRepository implements PayoutMethodRepositoryPort {
  constructor(private readonly http: HttpClientPort) {}

  async list(signal?: AbortSignal): Promise<PayoutMethods> {
    const dto = await this.http.get('/me/payout-method', {
      signal,
      parse: (data) => payoutMethodsDto.parse(data),
    });
    return toPayoutMethods(dto);
  }

  async select(type: PayoutMethodType): Promise<PayoutMethods> {
    const dto = await this.http.put('/me/payout-method', {
      body: { method: DTO_BY_TYPE[type] },
      parse: (data) => payoutMethodsDto.parse(data),
    });
    return toPayoutMethods(dto);
  }
}
