import { ValidationPipe, type ValidationError as ClassValidatorError } from '@nestjs/common';

import { ValidationError } from '../../errors/app-error';

/** `{ "address.city": "city must be a string" }`: un mensaje por campo, con la ruta completa. */
export function toFieldErrors(
  errors: ClassValidatorError[],
  parentPath = '',
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const error of errors) {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;
    const [message] = Object.values(error.constraints ?? {});
    if (message) fields[path] = message;
    Object.assign(fields, toFieldErrors(error.children ?? [], path));
  }
  return fields;
}

/**
 * Validación global de las entradas con los DTOs: descarta y rechaza campos no declarados,
 * transforma a la clase del DTO y responde `VALIDATION_ERROR` con el detalle por campo.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transform: true,
    // Sin conversión implícita: los tipos se convierten solo con decoradores explícitos.
    transformOptions: { enableImplicitConversion: false },
    validationError: { target: false, value: false },
    exceptionFactory: (errors) =>
      new ValidationError('Los datos enviados no son válidos', toFieldErrors(errors)),
  });
}
