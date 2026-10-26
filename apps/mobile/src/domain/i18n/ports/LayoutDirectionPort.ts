import type { TextDirection } from '@/domain/i18n/Language';

export interface LayoutDirectionPort {
  current(): TextDirection;
  /** El cambio de dirección del layout solo se aplica tras reiniciar la app. */
  apply(direction: TextDirection): void;
}
