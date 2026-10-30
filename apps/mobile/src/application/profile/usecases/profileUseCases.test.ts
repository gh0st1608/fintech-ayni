import { InvalidLoginIdentifierError } from '@/domain/auth/value-objects/LoginIdentifier';
import { OtpVerificationError } from '@/domain/auth/errors/OtpVerificationError';
import { initialsOf } from '@/domain/profile/UserProfile';
import { InMemoryUserProfileRepository } from '@/infrastructure/profile/InMemoryUserProfileRepository';

import {
  GetMyProfileUseCase,
  InvalidPersonNameError,
  StartContactChangeUseCase,
  UpdatePersonalInfoUseCase,
  VerifyContactChangeUseCase,
} from './profileUseCases';

const repository = () => new InMemoryUserProfileRepository({ latencyMs: 0, currency: 'PEN' });

describe('Casos de uso del perfil', () => {
  it('lee el perfil con el límite mensual', async () => {
    const profile = await new GetMyProfileUseCase(repository()).execute();
    expect(profile.email).toBe('ana@mail.com');
    expect(profile.monthlyPayInLimit).not.toBeNull();
  });

  it('guarda nombre y apellido recortados y rechaza nombres inválidos', async () => {
    const profiles = repository();
    const update = new UpdatePersonalInfoUseCase(profiles);
    await expect(
      update.execute({ firstName: '  Rosa ', lastName: 'Mamani' }),
    ).resolves.toMatchObject({
      firstName: 'Rosa',
      fullName: 'Rosa Mamani',
    });
    await expect(update.execute({ firstName: '', lastName: '<b>' })).rejects.toEqual(
      new InvalidPersonNameError(['firstName', 'lastName']),
    );
  });

  it('cambia el email verificando el código enviado al dato nuevo', async () => {
    const profiles = repository();
    const challenge = await new StartContactChangeUseCase(profiles).execute('nueva@mail.com');
    expect(challenge.maskedDestination).toMatch(/\*/);
    const verify = new VerifyContactChangeUseCase(profiles);
    await expect(verify.execute(challenge.challengeId, '0000')).rejects.toBeInstanceOf(
      OtpVerificationError,
    );
    await expect(verify.execute(challenge.challengeId, '1234')).resolves.toMatchObject({
      email: 'nueva@mail.com',
    });
  });

  it('valida el formato del dato nuevo y avisa si otra cuenta lo usa', async () => {
    const profiles = repository();
    await expect(new StartContactChangeUseCase(profiles).execute('987')).rejects.toBeInstanceOf(
      InvalidLoginIdentifierError,
    );
    const challenge = await new StartContactChangeUseCase(profiles).execute('usado@mail.com');
    await expect(
      new VerifyContactChangeUseCase(profiles).execute(challenge.challengeId, '1234'),
    ).rejects.toMatchObject({ code: 'CONTACT_TAKEN' });
  });

  it('las iniciales salen del nombre o, si no hay, del email', () => {
    expect(initialsOf({ firstName: 'ana', lastName: 'Quispe', email: null })).toBe('AQ');
    expect(initialsOf({ firstName: null, lastName: null, email: 'rosa@mail.com' })).toBe('R');
  });
});
