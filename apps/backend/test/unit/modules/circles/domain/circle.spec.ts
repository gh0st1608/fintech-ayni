import { Circle, type Membership } from '@src/modules/circles/domain/entities/circle';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';

const terms = (months = 3): CircleTerms =>
  CircleTerms.create({
    payout: Money.of(300_000 * months, 'PEN'),
    months,
    startsOn: Period.of(2026, 11),
  });

const request = (
  userId: string,
  position: number,
  idempotencyKey = `key-${userId}`,
): Membership => ({
  userId,
  position,
  idempotencyKey,
});

describe('Circle', () => {
  it('se abre sin miembros y con todos los slots disponibles', () => {
    const circle = Circle.open({ id: 'c-1', terms: terms() });

    expect(circle.status).toBe('open');
    expect(circle.memberships).toEqual([]);
    expect(circle.availablePositions()).toEqual([1, 2, 3]);
  });

  it('reserva un slot y queda completo al tomarse el último', () => {
    const circle = Circle.open({ id: 'c-1', terms: terms(2) });

    expect(circle.join(request('ana', 2))).toEqual({
      membership: request('ana', 2),
      created: true,
    });
    expect(circle.availablePositions()).toEqual([1]);
    circle.join(request('beto', 1));

    expect(circle.status).toBe('full');
    expect(circle.availablePositions()).toEqual([]);
  });

  it('un reintento con la misma clave devuelve la membresía sin duplicarla', () => {
    const circle = Circle.open({ id: 'c-1', terms: terms() });
    circle.join(request('ana', 1));

    expect(circle.join(request('ana', 1))).toEqual({
      membership: request('ana', 1),
      created: false,
    });
    expect(circle.memberships).toHaveLength(1);
  });

  it.each([
    ['otro usuario toma el slot', request('beto', 1), 'SLOT_TAKEN'],
    ['el usuario ya tiene un slot', request('ana', 2, 'otra-clave'), 'ALREADY_MEMBER'],
    ['la clave se reutiliza con otro slot', request('ana', 2), 'IDEMPOTENCY_KEY_REUSED'],
    [
      'la clave se reutiliza con otro usuario',
      request('beto', 2, 'key-ana'),
      'IDEMPOTENCY_KEY_REUSED',
    ],
  ])('responde 409 si %s', (_case, attempt, code) => {
    const circle = Circle.open({ id: 'c-1', terms: terms() });
    circle.join(request('ana', 1));

    expect(() => circle.join(attempt)).toThrow(expect.objectContaining({ code, kind: 'conflict' }));
    expect(circle.memberships).toHaveLength(1);
  });

  it.each([0, 4, 1.5])('rechaza el slot %p fuera de rango', (position) => {
    const circle = Circle.open({ id: 'c-1', terms: terms() });
    expect(() => circle.join(request('ana', position))).toThrow(
      expect.objectContaining({ code: 'SLOT_OUT_OF_RANGE', kind: 'domain' }),
    );
  });

  it('no expone sus membresías para modificarlas desde afuera', () => {
    const circle = Circle.open({ id: 'c-1', terms: terms() });
    const { membership } = circle.join(request('ana', 1));
    (membership as { position: number }).position = 3;

    expect(circle.availablePositions()).toEqual([2, 3]);
  });

  it('restaura un círculo guardado', () => {
    const circle = Circle.restore({
      id: 'c-1',
      terms: terms(),
      memberships: [request('ana', 1), request('beto', 3)],
    });
    expect(circle.availablePositions()).toEqual([2]);
  });

  it.each([
    ['sin id', ' ', []],
    ['slot fuera de rango', 'c-1', [request('ana', 4)]],
    ['slot repetido', 'c-1', [request('ana', 1), request('beto', 1)]],
    ['usuario repetido', 'c-1', [request('ana', 1), request('ana', 2, 'k2')]],
    ['clave repetida', 'c-1', [request('ana', 1, 'k'), request('beto', 2, 'k')]],
  ])('rechaza restaurar un círculo %s', (_case, id, memberships) => {
    expect(() => Circle.restore({ id, terms: terms(), memberships })).toThrow(
      expect.objectContaining({ code: 'INVALID_CIRCLE' }),
    );
  });
});
