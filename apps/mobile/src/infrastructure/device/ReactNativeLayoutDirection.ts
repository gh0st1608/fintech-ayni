import { I18nManager } from 'react-native';

import type { TextDirection } from '@/domain/i18n/Language';
import type { LayoutDirectionPort } from '@/domain/i18n/ports/LayoutDirectionPort';

/** Dirección del layout nativo. No tiene efecto en Expo Go; requiere reiniciar la app. */
export class ReactNativeLayoutDirection implements LayoutDirectionPort {
  current(): TextDirection {
    return I18nManager.isRTL ? 'rtl' : 'ltr';
  }

  apply(direction: TextDirection): void {
    const rtl = direction === 'rtl';
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
  }
}
