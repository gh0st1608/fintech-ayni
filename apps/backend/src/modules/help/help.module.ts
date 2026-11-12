import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AppConfigService } from '../../config/configuration';
import {
  GetAdminHelpUseCase,
  GetHelpUseCase,
  HELP_CONTENT,
  HELP_SETTINGS,
  type HelpSettings,
  UpdateHelpUseCase,
} from './application/help';
import { SqlHelpContent } from './infrastructure/sql-help-content';
import { AdminHelpController, HelpController } from './presentation/help.controllers';

/** Ayuda y política de pagos (COPAYNI-83), editables desde el back-office. */
@Module({
  controllers: [HelpController, AdminHelpController],
  providers: [
    GetHelpUseCase,
    GetAdminHelpUseCase,
    UpdateHelpUseCase,
    { provide: HELP_CONTENT, useClass: SqlHelpContent },
    {
      provide: HELP_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: AppConfigService): HelpSettings => ({
        supportWhatsapp: config.get('SUPPORT_WHATSAPP_NUMBER', { infer: true }) ?? null,
      }),
    },
  ],
})
export class HelpModule {}
