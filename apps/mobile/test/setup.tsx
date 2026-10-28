/* eslint-disable @typescript-eslint/no-require-imports */
// Configuración pública válida para los tests (equivalente a .env.local).
process.env.EXPO_PUBLIC_APP_ENV = 'dev';
process.env.EXPO_PUBLIC_API_URL = 'https://api.test.local/v1';
process.env.EXPO_PUBLIC_DEFAULT_LANGUAGE = 'es';
process.env.EXPO_PUBLIC_DEFAULT_CURRENCY = 'PEN';
process.env.EXPO_PUBLIC_HTTP_TIMEOUT_MS = '15000';
process.env.EXPO_PUBLIC_AUTH_API = 'fake';
process.env.EXPO_PUBLIC_CIRCLES_API = 'fake';
process.env.EXPO_PUBLIC_PROFILE_API = 'fake';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// SecureStore en memoria: nunca se toca el keychain real en pruebas.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

// Los iconos cargan fuentes nativas que no existen en Jest; se sustituyen por un nodo vacío.
jest.mock('@expo/vector-icons/Ionicons', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: { name: string }) => <View testID={`icon-${props.name}`} />,
  };
});

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'es', languageTag: 'es-PE', textDirection: 'ltr' }]),
}));
