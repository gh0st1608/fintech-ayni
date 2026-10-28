import { type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { type AccessTokenVerifierPort } from '@src/shared/application/ports/access-token-verifier.port';
import { UnauthorizedError } from '@src/shared/errors/app-error';
import { principalOf } from '@src/shared/presentation/decorators/current-principal.decorator';
import { BearerAuthGuard } from '@src/shared/presentation/guards/bearer-auth.guard';
import { type AppRequest } from '@src/shared/presentation/http/app-request';

function contextFor(request: Partial<AppRequest>): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('BearerAuthGuard', () => {
  function setup(isPublic?: boolean) {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(isPublic);
    const verifier: jest.Mocked<AccessTokenVerifierPort> = {
      verify: jest.fn().mockResolvedValue({ userId: 'user-1' }),
    };
    return { guard: new BearerAuthGuard(reflector, verifier), verifier };
  }

  it('deja pasar las rutas públicas sin token', async () => {
    const { guard, verifier } = setup(true);
    await expect(guard.canActivate(contextFor({ headers: {} }))).resolves.toBe(true);
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('verifica el Bearer token y guarda el usuario en la petición', async () => {
    const { guard, verifier } = setup();
    const request: Partial<AppRequest> = { headers: { authorization: 'Bearer abc.def' } };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(verifier.verify).toHaveBeenCalledWith('abc.def');
    expect(principalOf(request as AppRequest)).toEqual({ userId: 'user-1' });
  });

  it.each([[undefined], ['abc.def'], ['Basic dXNlcjpwYXNz'], ['Bearer '], ['Bearer a b']])(
    'rechaza la cabecera Authorization %p',
    async (authorization) => {
      const { guard, verifier } = setup();
      await expect(
        guard.canActivate(contextFor({ headers: { authorization } })),
      ).rejects.toBeInstanceOf(UnauthorizedError);
      expect(verifier.verify).not.toHaveBeenCalled();
    },
  );

  it('propaga el rechazo del verificador', async () => {
    const { guard, verifier } = setup();
    verifier.verify.mockRejectedValue(new UnauthorizedError());
    await expect(
      guard.canActivate(contextFor({ headers: { authorization: 'Bearer expirado' } })),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('principalOf', () => {
  it('exige un usuario autenticado', () => {
    expect(() => principalOf({} as AppRequest)).toThrow(UnauthorizedError);
  });
});
