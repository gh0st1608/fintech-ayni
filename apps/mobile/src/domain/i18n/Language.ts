import { DomainError } from '@/domain/shared/errors/DomainError';

export type TextDirection = 'ltr' | 'rtl';

export interface SupportedLanguage {
  code: string;
  direction: TextDirection;
}

export class UnsupportedLanguageError extends DomainError {
  readonly code = 'UNSUPPORTED_LANGUAGE';
}
