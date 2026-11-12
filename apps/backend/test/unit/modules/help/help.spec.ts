import {
  GetHelpUseCase,
  type HelpContent,
  type HelpContentPort,
  type HelpLanguage,
  UpdateHelpUseCase,
} from '@src/modules/help/application/help';
import { TestClock } from '@test/support/create-test-app';

const content = (language: HelpLanguage, faqs = 1): HelpContent => ({
  language,
  faqs: Array.from({ length: faqs }, (_, index) => ({
    id: `${language}-${index}`,
    question: `¿Pregunta ${index}?`,
    answer: 'Respuesta',
  })),
  paymentPolicy: null,
  updatedAt: null,
  updatedBy: null,
});

function port(stored: Partial<Record<HelpLanguage, HelpContent>>) {
  const replace = jest.fn<
    ReturnType<HelpContentPort['replace']>,
    Parameters<HelpContentPort['replace']>
  >((language, input) =>
    Promise.resolve({
      language,
      faqs: input.faqs.map((faq, index) => ({ id: String(index), ...faq })),
      paymentPolicy: input.paymentPolicy
        ? { body: input.paymentPolicy, updatedAt: new Date(0) }
        : null,
      updatedAt: new Date(0),
      updatedBy: 'ops',
    }),
  );
  return {
    find: (language: HelpLanguage) => Promise.resolve(stored[language] ?? null),
    replace,
  } satisfies HelpContentPort;
}

describe('GetHelpUseCase', () => {
  it('usa el idioma pedido si tiene contenido; si no, el español', async () => {
    const get = (stored: Partial<Record<HelpLanguage, HelpContent>>) =>
      new GetHelpUseCase(port(stored), { supportWhatsapp: '51999999999' });
    await expect(
      get({ es: content('es'), en: content('en') }).execute('en'),
    ).resolves.toMatchObject({ content: { language: 'en' }, supportWhatsapp: '51999999999' });
    await expect(
      get({ es: content('es'), en: content('en', 0) }).execute('en'),
    ).resolves.toMatchObject({ content: { language: 'es' } });
    await expect(get({ es: content('es') }).execute('fr')).resolves.toMatchObject({
      content: { language: 'es' },
    });
    await expect(get({}).execute(undefined)).resolves.toMatchObject({
      content: { language: 'es', faqs: [], paymentPolicy: null },
    });
  });
});

describe('UpdateHelpUseCase', () => {
  it('recorta los textos, exige respuesta y vacía la política en blanco', async () => {
    const help = port({});
    const update = new UpdateHelpUseCase(help, new TestClock(new Date(0)));
    await update.execute(
      'es',
      { faqs: [{ question: ' ¿Hola? ', answer: ' Sí ' }], paymentPolicy: '   ' },
      'ops',
    );
    expect(help.replace).toHaveBeenCalledWith(
      'es',
      { faqs: [{ question: '¿Hola?', answer: 'Sí' }], paymentPolicy: null },
      'ops',
      new Date(0),
    );
    await expect(
      update.execute(
        'es',
        { faqs: [{ question: '¿Hola?', answer: '' }], paymentPolicy: null },
        'ops',
      ),
    ).rejects.toMatchObject({ details: { faqs: 'incomplete' } });
    await expect(
      update.execute('pt', { faqs: [], paymentPolicy: null }, 'ops'),
    ).rejects.toMatchObject({ details: { language: 'invalid' } });
    const many = Array.from({ length: 51 }, () => ({ question: 'q', answer: 'a' }));
    await expect(
      update.execute('es', { faqs: many, paymentPolicy: null }, 'ops'),
    ).rejects.toMatchObject({ details: { faqs: 'too_many' } });
  });
});
