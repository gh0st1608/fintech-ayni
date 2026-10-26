import { getLocales } from 'expo-localization';
import { I18nManager } from 'react-native';

import { ExpoDeviceLocale } from './ExpoDeviceLocale';
import { ReactNativeLayoutDirection } from './ReactNativeLayoutDirection';

describe('ExpoDeviceLocale', () => {
  it('devuelve los códigos de idioma en orden y omite los nulos', () => {
    jest
      .mocked(getLocales)
      .mockReturnValueOnce([
        { languageCode: 'en' },
        { languageCode: null },
        { languageCode: 'es' },
      ] as unknown as ReturnType<typeof getLocales>);
    expect(new ExpoDeviceLocale().preferredLanguageCodes()).toEqual(['en', 'es']);
  });
});

describe('ReactNativeLayoutDirection', () => {
  it('lee la dirección actual del layout nativo', () => {
    expect(new ReactNativeLayoutDirection().current()).toBe(I18nManager.isRTL ? 'rtl' : 'ltr');
  });

  it('aplica la dirección pedida al I18nManager', () => {
    const allowRTL = jest.spyOn(I18nManager, 'allowRTL').mockImplementation(() => {});
    const forceRTL = jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => {});
    new ReactNativeLayoutDirection().apply('rtl');
    expect(allowRTL).toHaveBeenCalledWith(true);
    expect(forceRTL).toHaveBeenCalledWith(true);
  });
});
