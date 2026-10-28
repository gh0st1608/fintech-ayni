import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { type ReadinessIndicator } from '../../../modules/health/application/ports/readiness-indicator.port';

/** La API no está lista si PostgreSQL no responde. */
@Injectable()
export class DatabaseReadinessIndicator implements ReadinessIndicator {
  readonly name = 'database';

  constructor(private readonly dataSource: DataSource) {}

  async isReady(): Promise<boolean> {
    if (!this.dataSource.isInitialized) return false;
    await this.dataSource.query('SELECT 1');
    return true;
  }
}
