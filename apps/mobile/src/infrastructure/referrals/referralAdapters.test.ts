import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';

import type { HttpBodyRequestOptions, HttpClientPort } from '@/domain/shared/ports/HttpClientPort';
import { Money } from '@/domain/shared/value-objects/Money';

import {
  AsyncStoragePendingReferral,
  ExpoClipboard,
  ReactNativeShare,
} from './DeviceReferralAdapters';
import { InMemoryReferralRepository } from './InMemoryReferralRepository';
import { ReferralApiRepository } from './ReferralApiRepository';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

function httpReturning(data: unknown) {
  const calls: { path: string; options: HttpBodyRequestOptions<unknown> }[] = [];
  const respond = (path: string, options: HttpBodyRequestOptions<unknown> = {}) => {
    calls.push({ path, options });
    return Promise.resolve(options.parse ? options.parse(data) : data);
  };
  return {
    http: { get: jest.fn(respond), post: jest.fn(respond) } as unknown as HttpClientPort,
    calls,
  };
}

const pen = (amount: number) => ({ amount, currency: 'PEN' });

describe('ReferralApiRepository', () => {
  it('traduce mi código y el beneficio', async () => {
    const { http, calls } = httpReturning({
      code: 'K7M2Q9XA',
      link: 'ayni://invite?code=K7M2Q9XA',
      reward: pen(15000),
    });
    await expect(new ReferralApiRepository(http).getMine()).resolves.toEqual({
      code: 'K7M2Q9XA',
      link: 'ayni://invite?code=K7M2Q9XA',
      reward: Money.of(15000, 'PEN'),
    });
    expect(calls[0]!.path).toBe('/me/referral');
  });

  it('traduce el saldo y los estados de los invitados, con el cursor', async () => {
    const { http, calls } = httpReturning({
      earned: pen(30000),
      redeemed: pen(10000),
      balance: pen(20000),
      invitees: [
        {
          displayName: 'Ana Q.',
          status: 'first_pay_in_paid',
          claimedAt: '2026-11-02T15:00:00.000Z',
        },
        { displayName: 'Luis R.', status: 'joined_circle', claimedAt: '2026-11-01T15:00:00.000Z' },
      ],
      nextCursor: 'c-2',
    });
    const page = await new ReferralApiRepository(http).listReferrals('c-1');
    expect(calls[0]).toMatchObject({
      path: '/me/referrals',
      options: { query: { cursor: 'c-1' } },
    });
    expect(page.summary.balance).toEqual(Money.of(20000, 'PEN'));
    expect(page.invitees.map(({ status }) => status)).toEqual(['firstPayInPaid', 'joinedCircle']);
    expect(page.invitees[0]!.claimedAt).toEqual(new Date('2026-11-02T15:00:00.000Z'));
    expect(page.nextCursor).toBe('c-2');
  });

  it('rechaza un estado desconocido', async () => {
    const { http } = httpReturning({
      earned: pen(0),
      redeemed: pen(0),
      balance: pen(0),
      invitees: [{ displayName: 'X', status: 'vip', claimedAt: '2026-11-02T15:00:00.000Z' }],
      nextCursor: null,
    });
    await expect(new ReferralApiRepository(http).listReferrals(null)).rejects.toThrow();
  });

  it('envía el código y devuelve el descuento', async () => {
    const { http, calls } = httpReturning({ reward: pen(15000) });
    await expect(new ReferralApiRepository(http).claim('K7M2Q9XB')).resolves.toEqual(
      Money.of(15000, 'PEN'),
    );
    expect(calls[0]).toMatchObject({
      path: '/me/referral/claim',
      options: { body: { code: 'K7M2Q9XB' } },
    });
  });
});

describe('InMemoryReferralRepository', () => {
  it('suma el beneficio propio al usar un código y no deja usar otro', async () => {
    const referrals = new InMemoryReferralRepository({ latencyMs: 0, currency: 'PEN' });
    await referrals.claim('K7M2Q9XB');
    const page = await referrals.listReferrals(null);
    expect(page.summary.earned).toEqual(Money.of(30000, 'PEN'));
    await expect(referrals.claim('K7M2Q9XC')).rejects.toMatchObject({
      code: 'REFERRAL_ALREADY_CLAIMED',
    });
  });
});

describe('adaptadores del dispositivo', () => {
  afterEach(() => jest.restoreAllMocks());

  it('compartir dice si el usuario cerró la hoja sin compartir', async () => {
    const share = jest.spyOn(Share, 'share');
    share.mockResolvedValueOnce({ action: Share.sharedAction, activityType: undefined });
    share.mockResolvedValueOnce({ action: Share.dismissedAction, activityType: undefined });
    const sharer = new ReactNativeShare();
    await expect(sharer.share('hola')).resolves.toBe(true);
    await expect(sharer.share('hola')).resolves.toBe(false);
    expect(share).toHaveBeenCalledWith({ message: 'hola' });
  });

  it('copia con expo-clipboard', async () => {
    await new ExpoClipboard().copy('K7M2Q9XA');
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('K7M2Q9XA');
  });

  it('guarda, lee y borra el código pendiente', async () => {
    const pending = new AsyncStoragePendingReferral();
    await pending.save('K7M2Q9XB');
    await expect(pending.get()).resolves.toBe('K7M2Q9XB');
    await pending.clear();
    await expect(AsyncStorage.getItem('referral.pendingCode')).resolves.toBeNull();
  });
});
