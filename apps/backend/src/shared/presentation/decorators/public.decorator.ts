import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = Symbol('IS_PUBLIC');

/** Ruta sin autenticación (p. ej. inicio del login). Todo lo demás exige Bearer token. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
