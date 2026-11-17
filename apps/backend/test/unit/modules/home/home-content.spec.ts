import {
  GetHomeContentUseCase,
  type HomeContentPort,
  ListHomeContentUseCase,
  RemoveHomeContentUseCase,
  SaveHomeGoalUseCase,
  SaveHomeOfferUseCase,
} from '@src/modules/home/application/home-content';
import {
  assertGoal,
  assertOffer,
  type ContentTexts,
  type GoalInput,
  type HomeGoal,
  type HomeOffer,
  isVisible,
  MAX_ITEMS,
  type OfferInput,
  resolveText,
} from '@src/modules/home/domain/home-content';
import { TestClock } from '@test/support/create-test-app';

const NOW = new Date('2026-11-16T15:00:00Z');

const texts = (es: string, en?: string): ContentTexts => ({
  es: { title: es, subtitle: null },
  en: en ? { title: en, subtitle: null } : { title: '', subtitle: null },
});

const offerInput = (overrides: Partial<OfferInput> = {}): OfferInput => ({
  texts: texts('Ofertas', 'Offers'),
  illustration: 'megaphone',
  background: 'cream',
  target: 'savings_plans',
  targetAmount: null,
  position: 0,
  active: true,
  startsOn: null,
  endsOn: null,
  ...overrides,
});

const goalInput = (overrides: Partial<GoalInput> = {}): GoalInput => ({
  texts: texts('Ahorro', 'Savings'),
  illustration: 'piggy-bank',
  background: 'primary',
  target: 'savings_plans',
  targetAmount: null,
  position: 0,
  active: true,
  ...overrides,
});

const offer = (overrides: Partial<HomeOffer> = {}): HomeOffer => ({
  id: 'o-1',
  ...offerInput(),
  updatedAt: NOW,
  updatedBy: null,
  ...overrides,
});

const goal = (overrides: Partial<HomeGoal> = {}): HomeGoal => ({
  id: 'g-1',
  ...goalInput(),
  updatedAt: NOW,
  updatedBy: null,
  ...overrides,
});

function setup(content: { offers?: HomeOffer[]; goals?: HomeGoal[] } = {}) {
  const port = {
    listOffers: jest.fn(() => Promise.resolve(content.offers ?? [])),
    listGoals: jest.fn(() => Promise.resolve(content.goals ?? [])),
    saveOffer: jest.fn((id: string | null, input: OfferInput) =>
      Promise.resolve(offer({ id: id ?? 'nuevo', ...input })),
    ),
    saveGoal: jest.fn((id: string | null, input: GoalInput) =>
      Promise.resolve(goal({ id: id ?? 'nuevo', ...input })),
    ),
    removeOffer: jest.fn(() => Promise.resolve(true)),
    removeGoal: jest.fn(() => Promise.resolve(true)),
  } as unknown as HomeContentPort;
  const clock = new TestClock(NOW);
  return {
    port,
    get: new GetHomeContentUseCase(port, clock),
    list: new ListHomeContentUseCase(port),
    saveOfferUseCase: new SaveHomeOfferUseCase(port, clock),
    saveGoalUseCase: new SaveHomeGoalUseCase(port, clock),
    remove: new RemoveHomeContentUseCase(port),
  };
}

describe('contenido de Home (COPAYNI-25)', () => {
  describe('texto por idioma', () => {
    it('devuelve el idioma pedido', () => {
      expect(resolveText(texts('Ahorro', 'Savings'), 'en').title).toBe('Savings');
    });

    it('sin traducción cae al español, para no dejar un hueco', () => {
      expect(resolveText(texts('Ahorro'), 'en').title).toBe('Ahorro');
    });
  });

  describe('vigencia de una oferta', () => {
    it.each([
      ['activa y sin ventana', { active: true, startsOn: null, endsOn: null }, true],
      ['apagada', { active: false, startsOn: null, endsOn: null }, false],
      [
        'todavía no empieza',
        { active: true, startsOn: new Date('2026-12-01T00:00:00Z'), endsOn: null },
        false,
      ],
      [
        'ya venció',
        { active: true, startsOn: null, endsOn: new Date('2026-11-15T00:00:00Z') },
        false,
      ],
      [
        'dentro de la ventana',
        {
          active: true,
          startsOn: new Date('2026-11-01T00:00:00Z'),
          endsOn: new Date('2026-11-30T00:00:00Z'),
        },
        true,
      ],
    ])('%s', (_caso, value, expected) => {
      expect(isVisible(value, NOW)).toBe(expected);
    });
  });

  describe('lo que ve la app', () => {
    it('solo lo activo y vigente, resuelto al idioma', async () => {
      const { get } = setup({
        offers: [
          offer({ id: 'vigente', texts: texts('Vigente', 'Current') }),
          offer({ id: 'vencida', endsOn: new Date('2026-11-01T00:00:00Z') }),
          offer({ id: 'apagada', active: false }),
        ],
        goals: [goal({ id: 'activa' }), goal({ id: 'apagada', active: false })],
      });

      const content = await get.execute('en');
      expect(content.offers.map((item) => item.id)).toEqual(['vigente']);
      expect(content.offers[0]?.title).toBe('Current');
      expect(content.goals.map((item) => item.id)).toEqual(['activa']);
    });

    it('un idioma que no existe cae al español', async () => {
      const { get } = setup({ goals: [goal({ texts: texts('Ahorro', 'Savings') })] });
      await expect(get.execute('qu')).resolves.toMatchObject({
        goals: [{ title: 'Ahorro' }],
      });
    });

    it('sin contenido devuelve secciones vacías, que la app oculta', async () => {
      const { get } = setup();
      await expect(get.execute()).resolves.toEqual({ offers: [], goals: [] });
    });

    it('lleva el destino y el monto para abrir la pantalla correcta', async () => {
      const { get } = setup({
        goals: [goal({ target: 'join_circle', targetAmount: 3_000_00 })],
      });
      const [first] = (await get.execute()).goals;
      expect(first).toMatchObject({ target: 'join_circle', targetAmount: 300_000 });
    });
  });

  describe('edición desde el back-office', () => {
    it('el back-office ve también lo apagado y lo vencido', async () => {
      const { list } = setup({ offers: [offer({ active: false })], goals: [goal()] });
      const all = await list.execute();
      expect(all.offers).toHaveLength(1);
      expect(all.goals).toHaveLength(1);
    });

    it('guarda una oferta nueva con quién la tocó', async () => {
      const { saveOfferUseCase, port } = setup();
      await saveOfferUseCase.execute(null, offerInput(), 'ops@ayni.pe');
      expect(port.saveOffer).toHaveBeenCalledWith(null, offerInput(), 'ops@ayni.pe', NOW);
    });

    it('exige el título en español, que es al que cae todo lo demás', () => {
      expect(() => assertOffer(offerInput({ texts: texts('', 'Offers') }))).toThrow(
        /título en español/,
      );
    });

    it('rechaza un título más largo de lo que entra en la tarjeta', () => {
      expect(() => assertGoal(goalInput({ texts: texts('a'.repeat(25)) }))).toThrow(/24/);
    });

    it('el monto solo tiene sentido al mandar al flujo de unión', () => {
      expect(() => assertGoal(goalInput({ target: 'help', targetAmount: 100 }))).toThrow(
        /join_circle/,
      );
      expect(() => assertGoal(goalInput({ target: 'join_circle', targetAmount: -5 }))).toThrow(
        /entero positivo/,
      );
    });

    it('rechaza una vigencia que termina antes de empezar', () => {
      expect(() =>
        assertOffer(
          offerInput({
            startsOn: new Date('2026-12-01T00:00:00Z'),
            endsOn: new Date('2026-11-01T00:00:00Z'),
          }),
        ),
      ).toThrow(/termina antes/);
    });

    it('no deja crecer el carrusel sin control', async () => {
      const { saveOfferUseCase } = setup({
        offers: Array.from({ length: MAX_ITEMS }, (_, index) => offer({ id: `o-${index}` })),
      });
      await expect(saveOfferUseCase.execute(null, offerInput(), 'ops@ayni.pe')).rejects.toThrow(
        /más de 10/,
      );
      // Editar una existente sí se puede: el tope es para crear.
      await expect(
        saveOfferUseCase.execute('o-1', offerInput(), 'ops@ayni.pe'),
      ).resolves.toMatchObject({ id: 'o-1' });
    });

    it('borrar algo que no existe es un 404, no un éxito silencioso', async () => {
      const { remove, port } = setup();
      (port.removeGoal as jest.Mock).mockResolvedValueOnce(false);
      await expect(remove.execute('goal', 'g-9')).rejects.toMatchObject({
        code: 'CONTENT_NOT_FOUND',
      });
    });
  });
});
