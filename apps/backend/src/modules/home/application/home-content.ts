import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type ClockPort } from '../../../shared/application/ports/clock.port';
import { NotFoundError, ValidationError } from '../../../shared/errors/app-error';
import {
  assertGoal,
  assertOffer,
  type ContentLanguage,
  DEFAULT_CONTENT_LANGUAGE,
  type GoalInput,
  type HomeContent,
  type HomeGoal,
  type HomeOffer,
  isContentLanguage,
  isVisible,
  MAX_ITEMS,
  type OfferInput,
  toResolved,
} from '../domain/home-content';

export const HOME_CONTENT = Symbol('HOME_CONTENT');

export interface HomeContentPort {
  /** Todo, ordenado por `position`; el back-office también ve lo apagado y lo vencido. */
  listOffers(): Promise<HomeOffer[]>;
  listGoals(): Promise<HomeGoal[]>;
  saveOffer(id: string | null, input: OfferInput, by: string, at: Date): Promise<HomeOffer>;
  saveGoal(id: string | null, input: GoalInput, by: string, at: Date): Promise<HomeGoal>;
  /** `false` si no existía. */
  removeOffer(id: string): Promise<boolean>;
  removeGoal(id: string): Promise<boolean>;
}

/**
 * `GET /v1/home/content`: lo que la app muestra en Home (COPAYNI-25). Devuelve solo lo activo y
 * vigente, ya ordenado y resuelto al idioma. Una sección vacía se oculta en la app, así que no hay
 * nada que inventar cuando todavía no hay campañas cargadas.
 *
 * El contenido es el mismo para todas las personas (BO5): no se segmenta por usuario en esta
 * versión, lo que además permite cachearlo por idioma.
 */
@Injectable()
export class GetHomeContentUseCase {
  constructor(
    @Inject(HOME_CONTENT) private readonly content: HomeContentPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(language?: string): Promise<HomeContent> {
    const wanted: ContentLanguage =
      language && isContentLanguage(language) ? language : DEFAULT_CONTENT_LANGUAGE;
    const now = this.clock.now();
    const [offers, goals] = await Promise.all([
      this.content.listOffers(),
      this.content.listGoals(),
    ]);
    return {
      offers: offers
        .filter((offer) => isVisible(offer, now))
        .map((offer) => toResolved(offer, wanted)),
      goals: goals.filter((goal) => goal.active).map((goal) => toResolved(goal, wanted)),
    };
  }
}

/** `GET /admin/v1/home-content`: todo, incluido lo apagado y lo vencido, para gestionarlo. */
@Injectable()
export class ListHomeContentUseCase {
  constructor(@Inject(HOME_CONTENT) private readonly content: HomeContentPort) {}

  async execute(): Promise<{ offers: HomeOffer[]; goals: HomeGoal[] }> {
    const [offers, goals] = await Promise.all([
      this.content.listOffers(),
      this.content.listGoals(),
    ]);
    return { offers, goals };
  }
}

/** Crea o edita una oferta del carrusel. */
@Injectable()
export class SaveHomeOfferUseCase {
  constructor(
    @Inject(HOME_CONTENT) private readonly content: HomeContentPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(id: string | null, input: OfferInput, by: string): Promise<HomeOffer> {
    assertOffer(input);
    if (id === null) await assertRoom(await this.content.listOffers(), 'ofertas');
    return this.content.saveOffer(id, input, by, this.clock.now());
  }
}

/** Crea o edita una meta popular. */
@Injectable()
export class SaveHomeGoalUseCase {
  constructor(
    @Inject(HOME_CONTENT) private readonly content: HomeContentPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(id: string | null, input: GoalInput, by: string): Promise<HomeGoal> {
    assertGoal(input);
    if (id === null) await assertRoom(await this.content.listGoals(), 'metas');
    return this.content.saveGoal(id, input, by, this.clock.now());
  }
}

/** Borra una tarjeta. Apagarla (`active: false`) es lo normal; borrar es para lo que sobró. */
@Injectable()
export class RemoveHomeContentUseCase {
  constructor(@Inject(HOME_CONTENT) private readonly content: HomeContentPort) {}

  async execute(kind: 'offer' | 'goal', id: string): Promise<void> {
    const removed =
      kind === 'offer' ? await this.content.removeOffer(id) : await this.content.removeGoal(id);
    if (!removed) throw new NotFoundError('No encontramos ese contenido', 'CONTENT_NOT_FOUND');
  }
}

/** Home no es un catálogo: un tope evita que el carrusel crezca sin control. */
async function assertRoom(current: unknown[], what: string): Promise<void> {
  if (current.length >= MAX_ITEMS) {
    throw new ValidationError(`No se pueden tener más de ${MAX_ITEMS} ${what}`, {
      items: 'too_many',
    });
  }
  return Promise.resolve();
}
