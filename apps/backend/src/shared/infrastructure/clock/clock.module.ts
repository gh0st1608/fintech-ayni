import { Global, Module } from '@nestjs/common';

import { CLOCK } from '../../application/ports/clock.port';
import { SystemClock } from './system-clock';

/** Reloj del sistema para todos los módulos; las pruebas lo reemplazan con `overrideProvider(CLOCK)`. */
@Global()
@Module({
  providers: [{ provide: CLOCK, useClass: SystemClock }],
  exports: [CLOCK],
})
export class ClockModule {}
