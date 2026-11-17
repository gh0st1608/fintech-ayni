import { Module } from '@nestjs/common';

import {
  GetHomeContentUseCase,
  HOME_CONTENT,
  ListHomeContentUseCase,
  RemoveHomeContentUseCase,
  SaveHomeGoalUseCase,
  SaveHomeOfferUseCase,
} from './application/home-content';
import { SqlHomeContent } from './infrastructure/sql-home-content';
import {
  AdminHomeContentController,
  HomeContentController,
} from './presentation/home-content.controllers';

/**
 * Contenido de Home (COPAYNI-25): ofertas y metas populares, editables desde el back-office como
 * la ayuda, para que cambiar una campaña no exija publicar la app.
 */
@Module({
  controllers: [HomeContentController, AdminHomeContentController],
  providers: [
    GetHomeContentUseCase,
    ListHomeContentUseCase,
    SaveHomeOfferUseCase,
    SaveHomeGoalUseCase,
    RemoveHomeContentUseCase,
    { provide: HOME_CONTENT, useClass: SqlHomeContent },
  ],
})
export class HomeModule {}
