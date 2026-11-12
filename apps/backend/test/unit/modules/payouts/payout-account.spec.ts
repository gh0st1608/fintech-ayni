import {
  type NewPayoutAccount,
  type PayoutAccountOwner,
  type PayoutAccountRepositoryPort,
} from '@src/modules/payouts/application/ports/payout.ports';
import {
  GetAdminPayoutAccountsUseCase,
  RegisterPayoutAccountUseCase,
} from '@src/modules/payouts/application/use-cases/payout-account.use-cases';
import {
  holderMatches,
  isValidCci,
  maskedLabel,
  type PayoutAccount,
  validatePayoutAccount,
} from '@src/modules/payouts/domain/payout-account';
import { Period } from '@src/shared/domain/value-objects/period';
import { AesGcmFieldCipher } from '@src/shared/infrastructure/crypto/aes-gcm-field-cipher';
import { TestClock } from '@test/support/create-test-app';

/** CCI válidos: BCP (002) y BBVA (011), con sus dos dígitos de control. */
const BCP_CCI = '00219300165123456715';
const BBVA_CCI = '01181400020012345612';
const NOW = new Date('2026-11-15T15:00:00Z');
const JUANA = { firstName: 'Juana', lastName: 'Torres' };
const STAFF = { staffId: 'staff-1', email: 'ops@ayni.pe' };
const BANK = {
  kind: 'bank_account' as const,
  bankCode: '002',
  accountType: 'savings',
  cci: BCP_CCI,
  holderName: 'Juana María Torres Pérez',
};

describe('cuenta de cobro: dominio', () => {
  it('valida los dos dígitos de control del CCI', () => {
    expect(isValidCci(BCP_CCI)).toBe(true);
    expect(isValidCci(BBVA_CCI)).toBe(true);
    expect(isValidCci('00219300165123456705')).toBe(false);
    expect(isValidCci('00219300165123456716')).toBe(false);
    expect(isValidCci('0021930016512345671')).toBe(false);
    expect(isValidCci('0021930016512345671a')).toBe(false);
  });

  it('normaliza la cuenta bancaria y exige que el CCI sea del banco elegido', () => {
    expect(validatePayoutAccount({ ...BANK, cci: '002-193-001651234567-15' })).toEqual({
      kind: 'bank_account',
      bankCode: '002',
      accountType: 'savings',
      walletProvider: null,
      number: BCP_CCI,
      last4: '4567',
      holderName: 'Juana María Torres Pérez',
    });
    expect(() => validatePayoutAccount({ ...BANK, bankCode: '011' })).toThrow(
      expect.objectContaining({ details: { cci: 'bank_mismatch' } }),
    );
    expect(() => validatePayoutAccount({ ...BANK, bankCode: '999' })).toThrow(
      expect.objectContaining({ details: { bankCode: 'invalid' } }),
    );
    expect(() => validatePayoutAccount({ ...BANK, accountType: 'cts' })).toThrow(
      expect.objectContaining({ details: { accountType: 'invalid' } }),
    );
    expect(() => validatePayoutAccount({ ...BANK, cci: '00219300165123456716' })).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR', details: { cci: 'invalid' } }),
    );
    expect(() => validatePayoutAccount({ ...BANK, holderName: 'Juana' })).toThrow(
      expect.objectContaining({ details: { holderName: 'invalid' } }),
    );
  });

  it('valida la billetera por su celular, con o sin +51', () => {
    const wallet = { kind: 'wallet' as const, provider: 'yape', holderName: 'Juana Torres' };
    expect(validatePayoutAccount({ ...wallet, phone: '+51 987 654 321' })).toMatchObject({
      walletProvider: 'yape',
      number: '987654321',
      last4: '4321',
    });
    expect(() => validatePayoutAccount({ ...wallet, phone: '187654321' })).toThrow(
      expect.objectContaining({ details: { phone: 'invalid' } }),
    );
    expect(() =>
      validatePayoutAccount({ ...wallet, provider: 'tunki', phone: '987654321' }),
    ).toThrow(expect.objectContaining({ details: { provider: 'invalid' } }));
  });

  it('el titular contiene el nombre y el apellido del perfil, sin importar tildes', () => {
    expect(holderMatches('JUANA MARIA TORRES PEREZ', JUANA)).toBe(true);
    expect(holderMatches('Juana Tórres', JUANA)).toBe(true);
    expect(holderMatches('Juana Pérez', JUANA)).toBe(false);
    expect(holderMatches('Ana Torres', JUANA)).toBe(false);
  });

  it('muestra solo el banco o la billetera y los 4 últimos dígitos', () => {
    expect(
      maskedLabel({ kind: 'bank_account', bankCode: '002', walletProvider: null, last4: '4567' }),
    ).toBe('BCP •••• 4567');
    expect(
      maskedLabel({ kind: 'wallet', bankCode: null, walletProvider: 'plin', last4: '4321' }),
    ).toBe('Plin •••• 4321');
  });
});

describe('AesGcmFieldCipher', () => {
  it('cifra con IV aleatorio, descifra y rechaza un dato alterado', () => {
    const cipher = AesGcmFieldCipher.fromBase64(Buffer.alloc(32, 7).toString('base64'));
    const first = cipher.encrypt(BCP_CCI);
    expect(first).not.toContain(BCP_CCI);
    expect(cipher.encrypt(BCP_CCI)).not.toBe(first);
    expect(cipher.decrypt(first)).toBe(BCP_CCI);
    const [version, iv, tag, data] = first.split('.');
    const flipped = data!.startsWith('A') ? `B${data!.slice(1)}` : `A${data!.slice(1)}`;
    expect(() => cipher.decrypt([version, iv, tag, flipped].join('.'))).toThrow();
    expect(() => AesGcmFieldCipher.fromBase64('corta')).toThrow();
  });
});

function setup(
  options: { owner?: PayoutAccountOwner | null; current?: boolean; payoutPeriods?: Period[] } = {},
) {
  const saved: NewPayoutAccount[] = [];
  const existing: PayoutAccount[] = options.current
    ? [
        {
          id: 'old',
          userId: 'u1',
          kind: 'wallet',
          bankCode: null,
          accountType: null,
          walletProvider: 'yape',
          last4: '4321',
          holderName: 'Juana Torres',
          registeredBy: 'staff-0',
          registeredByEmail: null,
          createdAt: new Date('2026-10-01T00:00:00Z'),
          replacedAt: null,
        },
      ]
    : [];
  const accounts: PayoutAccountRepositoryPort = {
    current: () => Promise.resolve(existing.find((account) => !account.replacedAt) ?? null),
    history: () => Promise.resolve(existing),
    register: (account) => {
      saved.push(account);
      return Promise.resolve({ ...account, createdAt: account.at, replacedAt: null });
    },
  };
  const owner = options.owner === undefined ? { ...JUANA, identityVerified: true } : options.owner;
  const owners = { find: () => Promise.resolve(owner) };
  const schedule = { payoutPeriodsOf: () => Promise.resolve(options.payoutPeriods ?? []) };
  const cipher = AesGcmFieldCipher.forDevelopment('test');
  return {
    saved,
    cipher,
    register: new RegisterPayoutAccountUseCase(
      accounts,
      owners,
      schedule,
      { timeZone: 'America/Lima' },
      cipher,
      new TestClock(NOW),
    ),
    get: new GetAdminPayoutAccountsUseCase(accounts, owners),
  };
}

const command = (overrides: { reason?: string; holderName?: string } = {}) => ({
  userId: 'u1',
  account: { ...BANK, holderName: overrides.holderName ?? BANK.holderName },
  reason: overrides.reason ?? 'Constancia de CCI enviada por soporte',
  staff: STAFF,
});

describe('RegisterPayoutAccountUseCase', () => {
  it('guarda el CCI cifrado, el método que le corresponde y quién la registró', async () => {
    const { register, saved, cipher } = setup();
    const account = await register.execute(command());
    expect(account).toMatchObject({ kind: 'bank_account', last4: '4567', bankCode: '002' });
    expect(saved[0]).toMatchObject({
      method: 'bank_transfer',
      registeredBy: 'staff-1',
      registeredByEmail: 'ops@ayni.pe',
      reason: 'Constancia de CCI enviada por soporte',
      at: NOW,
    });
    expect(saved[0]!.encryptedNumber).not.toContain(BCP_CCI);
    expect(cipher.decrypt(saved[0]!.encryptedNumber)).toBe(BCP_CCI);
  });

  it('exige motivo, identidad verificada y un titular que sea la persona', async () => {
    await expect(setup().register.execute(command({ reason: ' ' }))).rejects.toMatchObject({
      details: { reason: 'required' },
    });
    await expect(
      setup({ owner: { ...JUANA, identityVerified: false } }).register.execute(command()),
    ).rejects.toMatchObject({ code: 'PAYOUT_ACCOUNT_IDENTITY_REQUIRED' });
    await expect(
      setup().register.execute(command({ holderName: 'Pedro Torres Pérez' })),
    ).rejects.toMatchObject({ code: 'PAYOUT_ACCOUNT_HOLDER_MISMATCH' });
    await expect(setup({ owner: null }).register.execute(command())).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    });
  });

  it('en el mes de cobro no cambia una cuenta registrada, pero sí registra la primera', async () => {
    const thisMonth = [Period.parse('2026-11')];
    await expect(
      setup({ current: true, payoutPeriods: thisMonth }).register.execute(command()),
    ).rejects.toMatchObject({ code: 'PAYOUT_ACCOUNT_CHANGE_NOT_ALLOWED' });
    await expect(
      setup({ payoutPeriods: thisMonth }).register.execute(command()),
    ).resolves.toMatchObject({ kind: 'bank_account' });
    await expect(
      setup({ current: true, payoutPeriods: [Period.parse('2026-12')] }).register.execute(
        command(),
      ),
    ).resolves.toMatchObject({ kind: 'bank_account' });
  });
});

describe('GetAdminPayoutAccountsUseCase', () => {
  it('devuelve la vigente y el historial, o USER_NOT_FOUND', async () => {
    await expect(setup({ current: true }).get.execute('u1')).resolves.toMatchObject({
      current: { id: 'old' },
      history: [{ id: 'old' }],
    });
    await expect(setup({ owner: null }).get.execute('u1')).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    });
  });
});
