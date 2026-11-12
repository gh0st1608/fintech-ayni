import { fireEvent, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { filterFaqs } from '@/domain/help/Help';
import { FetchHttpClient } from '@/infrastructure/http/FetchHttpClient';
import { HelpApiRepository } from '@/infrastructure/help/HelpApiRepository';
import { InMemoryHelpRepository } from '@/infrastructure/help/InMemoryHelpRepository';
import { PaymentScreen } from '@/presentation/payment/screens/PaymentScreen';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

import { HelpScreen } from './HelpScreen';
import { PaymentPolicyScreen } from './PaymentPolicyScreen';

const FAQS = [
  { id: 'a', question: '¿Qué pasa si no pago a tiempo?', answer: 'Tienes 3 días de gracia.' },
  { id: 'b', question: '¿Cuándo recibo mi pozo?', answer: 'En tu mes de cobro.' },
];

function setup(overrides: Partial<InMemoryHelpRepository['content']> = {}) {
  const help = new InMemoryHelpRepository(
    {
      language: 'es',
      faqs: FAQS,
      paymentPolicy: null,
      whatsappUrl: 'https://wa.me/51999999999',
      ...overrides,
    },
    0,
  );
  return { help, container: createTestContainer({ help }) };
}

describe('filterFaqs', () => {
  it('busca en la pregunta y la respuesta, sin tildes ni mayúsculas', () => {
    expect(filterFaqs(FAQS, 'GRACIA').map((faq) => faq.id)).toEqual(['a']);
    expect(filterFaqs(FAQS, 'cuando')).toEqual([FAQS[1]]);
    expect(filterFaqs(FAQS, '  ')).toEqual(FAQS);
  });
});

describe('HelpApiRepository', () => {
  it('pide el idioma y solo acepta enlaces de WhatsApp', async () => {
    const respond = (support: unknown) => {
      const fetchImpl = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
      fetchImpl.mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: { language: 'es', faqs: FAQS, paymentPolicy: null, support },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      const http = new FetchHttpClient({
        baseUrl: 'https://api.test/v1',
        timeoutMs: 1000,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      return { fetchImpl, repository: new HelpApiRepository(http) };
    };
    const ok = respond({ whatsapp: 'https://wa.me/51999999999' });
    await expect(ok.repository.get('en')).resolves.toMatchObject({
      faqs: FAQS,
      whatsappUrl: 'https://wa.me/51999999999',
    });
    expect(String(ok.fetchImpl.mock.calls[0]![0])).toBe('https://api.test/v1/help?lang=en');
    await expect(
      respond({ whatsapp: 'https://evil.example/x' }).repository.get('es'),
    ).rejects.toBeDefined();
  });
});

describe('HelpScreen', () => {
  it('filtra con la búsqueda y despliega la respuesta al tocar', async () => {
    await renderWithProviders(<HelpScreen onOpenPolicy={jest.fn()} />, setup().container);

    expect(await screen.findByText('¿Qué pasa si no pago a tiempo?')).toBeOnTheScreen();
    expect(screen.queryByText('Tienes 3 días de gracia.')).toBeNull();
    await fireEvent.press(screen.getByTestId('faq-a'));
    expect(screen.getByText('Tienes 3 días de gracia.')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByTestId('help-search'), 'pozo');
    expect(screen.queryByText('¿Qué pasa si no pago a tiempo?')).toBeNull();
    expect(screen.getByText('¿Cuándo recibo mi pozo?')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('help-search'), 'xyz');
    expect(screen.getByText('No encontramos preguntas con ese texto.')).toBeOnTheScreen();
  });

  it('abre WhatsApp y la política de pagos; sin canal no ofrece WhatsApp', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const onOpenPolicy = jest.fn();
    await renderWithProviders(<HelpScreen onOpenPolicy={onOpenPolicy} />, setup().container);
    await fireEvent.press(await screen.findByRole('button', { name: 'Escríbenos por WhatsApp' }));
    expect(openURL).toHaveBeenCalledWith('https://wa.me/51999999999');
    await fireEvent.press(screen.getByRole('button', { name: 'Política de pagos' }));
    expect(onOpenPolicy).toHaveBeenCalled();

    await renderWithProviders(
      <HelpScreen onOpenPolicy={jest.fn()} />,
      setup({ whatsappUrl: null }).container,
    );
    expect(await screen.findByText('¿Cuándo recibo mi pozo?')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Escríbenos por WhatsApp' })).toBeNull();
  });
});

describe('PaymentPolicyScreen', () => {
  it('muestra los párrafos de la política o que está en preparación', async () => {
    await renderWithProviders(
      <PaymentPolicyScreen />,
      setup({
        paymentPolicy: {
          body: 'Las cuotas vencen el día 1.\n\nTienes 3 días de gracia.',
          updatedAt: new Date(2026, 10, 12),
        },
      }).container,
    );
    expect(await screen.findByText('Las cuotas vencen el día 1.')).toBeOnTheScreen();
    expect(screen.getByText('Tienes 3 días de gracia.')).toBeOnTheScreen();

    await renderWithProviders(<PaymentPolicyScreen />, setup().container);
    expect(await screen.findByTestId('policy-pending')).toBeOnTheScreen();
  });
});

describe('PaymentScreen', () => {
  it('los accesos de Ayuda y Política de pagos llevan a sus pantallas', async () => {
    const onOpenHelp = jest.fn();
    const onOpenPolicy = jest.fn();
    await renderWithProviders(
      <PaymentScreen
        onJoin={jest.fn()}
        onOpenHistory={jest.fn()}
        onOpenHelp={onOpenHelp}
        onOpenPolicy={onOpenPolicy}
      />,
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Ayuda' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Política de pagos' }));
    expect(onOpenHelp).toHaveBeenCalled();
    expect(onOpenPolicy).toHaveBeenCalled();
  });
});
