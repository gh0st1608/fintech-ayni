import { fillRatio, pauseActionFor } from '@/domain/circles/Circle';
import { AppError } from '@/domain/shared/AppError';
import { can, type StaffMember } from '@/domain/staff/Staff';
import { circle, InMemoryCircles, InMemoryStaffAuth, NOW } from '@test/fakes';

import { MAX_REASON_LENGTH, SetCirclePauseUseCase, SignInUseCase } from './usecases';

const staff = (roles: StaffMember['roles']): StaffMember => ({
  staffId: 's',
  email: null,
  roles,
  authenticatedAt: NOW,
});

describe('dominio', () => {
  it('los permisos siguen la matriz del plan', () => {
    expect(can(staff(['support']), 'circles.read')).toBe(true);
    expect(can(staff(['admin']), 'circles.read')).toBe(false);
    expect(can(staff(['operations']), 'circles.pause')).toBe(false);
    expect(can(staff(['admin', 'super_admin']), 'circles.pause')).toBe(true);
  });

  it('solo una junta en curso se pausa y solo una pausada se reanuda', () => {
    expect(pauseActionFor('contributing')).toBe('pause');
    expect(pauseActionFor('paused')).toBe('resume');
    expect(pauseActionFor('collecting')).toBeNull();
  });

  it('calcula los turnos ocupados sin pasar del 100 %', () => {
    expect(fillRatio({ members: 3, months: 6 })).toBe(0.5);
    expect(fillRatio({ members: 7, months: 6 })).toBe(1);
    expect(fillRatio({ members: 0, months: 0 })).toBe(0);
  });

  it('solo los errores transitorios se reintentan', () => {
    expect(new AppError('network', 'x').retryable).toBe(true);
    expect(new AppError('forbidden', 'x').retryable).toBe(false);
  });
});

describe('SignInUseCase', () => {
  it('normaliza el email', async () => {
    const auth = new InMemoryStaffAuth();
    const staffMember = await new SignInUseCase(auth).execute({
      email: '  Ops@Ayni.Local ',
      roles: ['operations'],
    });
    expect(staffMember.email).toBe('ops@ayni.local');
  });

  it('exige un email válido y al menos un rol', () => {
    const useCase = new SignInUseCase(new InMemoryStaffAuth());
    expect(() => useCase.execute({ email: 'no', roles: ['support'] })).toThrow(AppError);
    expect(() => useCase.execute({ email: 'a@b.pe', roles: [] })).toThrow('Elige al menos un rol');
  });
});

describe('SetCirclePauseUseCase', () => {
  const target = circle();

  it('envía el motivo sin espacios sobrantes', async () => {
    const circles = new InMemoryCircles([target]);
    await new SetCirclePauseUseCase(circles).execute(
      staff(['super_admin']),
      target.circleId,
      'pause',
      '  Reclamo  ',
    );
    expect(circles.pauses).toEqual([
      { circleId: target.circleId, action: 'pause', reason: 'Reclamo' },
    ]);
  });

  it('rechaza sin el rol, sin motivo o con un motivo demasiado largo', () => {
    const useCase = new SetCirclePauseUseCase(new InMemoryCircles([target]));
    expect(() => useCase.execute(staff(['operations']), target.circleId, 'pause', 'x')).toThrow(
      'Solo el admin general',
    );
    expect(() => useCase.execute(staff(['super_admin']), target.circleId, 'pause', '  ')).toThrow(
      'Escribe el motivo',
    );
    expect(() =>
      useCase.execute(
        staff(['super_admin']),
        target.circleId,
        'pause',
        'x'.repeat(MAX_REASON_LENGTH + 1),
      ),
    ).toThrow('hasta 500');
  });
});
