import type { HelpContent } from '@/domain/help/Help';
import type { HelpRepositoryPort } from '@/domain/help/HelpRepositoryPort';
import { simulateLatency } from '@/infrastructure/fake/simulateLatency';

/** Mismas preguntas iniciales que el backend (solo dev y pruebas). */
const SAMPLE: HelpContent = {
  language: 'es',
  faqs: [
    {
      id: 'f-1',
      question: '¿Qué pasa si no pago a tiempo?',
      answer:
        'Tienes 3 días de gracia desde el vencimiento. Si no pagas, sales de la junta y, para unirte a otra, primero pagas lo vencido más un cargo por mora.',
    },
    {
      id: 'f-2',
      question: '¿Cuándo recibo mi pozo?',
      answer: 'En tu mes de cobro, en cuanto todos los miembros pagan la cuota de ese mes.',
    },
    {
      id: 'f-3',
      question: '¿Qué pasa si salgo de la junta antes de mi turno?',
      answer: 'Te devolvemos las cuotas que pagaste, con una penalidad mínima del 5 %.',
    },
  ],
  paymentPolicy: null,
  whatsappUrl: null,
};

export class InMemoryHelpRepository implements HelpRepositoryPort {
  readonly requests: string[] = [];

  constructor(
    public content: HelpContent = SAMPLE,
    private readonly latencyMs = 300,
  ) {}

  async get(language: string, signal?: AbortSignal): Promise<HelpContent> {
    this.requests.push(language);
    await simulateLatency(this.latencyMs, signal);
    return structuredClone(this.content);
  }
}
