import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';

import {
  type HelpContent,
  type HelpContentInput,
  type HelpContentPort,
  type HelpLanguage,
} from '../application/help';

/** Ayuda en `help_documents` (una fila por idioma) y `help_faqs` (preguntas ordenadas). */
@Injectable()
export class SqlHelpContent implements HelpContentPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  find(language: HelpLanguage): Promise<HelpContent | null> {
    return this.read(this.dataSource.manager, language);
  }

  replace(
    language: HelpLanguage,
    input: HelpContentInput,
    by: string,
    at: Date,
  ): Promise<HelpContent> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO help_documents (language, payment_policy, updated_at, updated_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (language) DO UPDATE
           SET payment_policy = EXCLUDED.payment_policy, updated_at = EXCLUDED.updated_at,
               updated_by = EXCLUDED.updated_by`,
        [language, input.paymentPolicy, at, by],
      );
      await manager.query('DELETE FROM help_faqs WHERE language = $1', [language]);
      for (const [index, faq] of input.faqs.entries()) {
        await manager.query(
          'INSERT INTO help_faqs (language, position, question, answer) VALUES ($1, $2, $3, $4)',
          [language, index + 1, faq.question, faq.answer],
        );
      }
      return (await this.read(manager, language))!;
    });
  }

  private async read(manager: EntityManager, language: HelpLanguage): Promise<HelpContent | null> {
    const [document] = await manager.query<
      { payment_policy: string | null; updated_at: Date; updated_by: string }[]
    >('SELECT payment_policy, updated_at, updated_by FROM help_documents WHERE language = $1', [
      language,
    ]);
    if (!document) return null;
    const faqs = await manager.query<{ id: string; question: string; answer: string }[]>(
      'SELECT id, question, answer FROM help_faqs WHERE language = $1 ORDER BY position',
      [language],
    );
    const updatedAt = new Date(document.updated_at);
    return {
      language,
      faqs,
      paymentPolicy: document.payment_policy ? { body: document.payment_policy, updatedAt } : null,
      updatedAt,
      updatedBy: document.updated_by,
    };
  }
}
