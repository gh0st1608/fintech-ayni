import {
  ensureApplicationRole,
  type SqlExecutor,
} from '../../../../../src/shared/infrastructure/persistence/app-role';

/**
 * PostgreSQL de mentira: responde a `SELECT 1 FROM pg_roles` según si el rol existe y resuelve
 * `format(...)` devolviendo la plantilla con sus argumentos, para poder comprobar qué sentencias
 * se habrían ejecutado sin levantar una base.
 */
function fakeDatabase(
  existingRoles: string[] = [],
  options: { canSuppressLogging?: boolean } = {},
): {
  executor: SqlExecutor;
  executed: string[];
  queries: Array<{ sql: string; parameters: unknown[] }>;
} {
  const executed: string[] = [];
  const queries: Array<{ sql: string; parameters: unknown[] }> = [];

  const executor: SqlExecutor = {
    query(sql: string, parameters: unknown[] = []): Promise<unknown> {
      queries.push({ sql, parameters });

      if (sql.startsWith('SET ') && options.canSuppressLogging === false) {
        return Promise.reject(new Error('permission denied to set parameter'));
      }

      if (sql.startsWith('SELECT 1 FROM pg_roles')) {
        return Promise.resolve(
          existingRoles.includes(String(parameters[0])) ? [{ '?column?': 1 }] : [],
        );
      }

      if (sql.startsWith('SELECT format(')) {
        const [template = '', ...args] = parameters as string[];
        // Solo lo que usan las plantillas: %n$I entre comillas dobles y %n$L entre simples.
        const statement = template.replaceAll(
          /%(\d+)\$([IL])/g,
          (_match, position: string, kind: string) => {
            const value = args[Number(position) - 1] ?? '';
            return kind === 'I'
              ? `"${value.replaceAll('"', '""')}"`
              : `'${value.replaceAll("'", "''")}'`;
          },
        );
        return Promise.resolve([{ statement }]);
      }

      executed.push(sql);
      return Promise.resolve([]);
    },
  };

  return { executor, executed, queries };
}

const role = { username: 'ayni_app', password: 'una-contrasena-larga', database: 'ayni' };

const roleStatement = (executed: string[]): string | undefined =>
  executed.find((statement) => /^(CREATE|ALTER) ROLE/.test(statement));

describe('ensureApplicationRole', () => {
  it('crea el rol cuando no existe y dice que lo creó', async () => {
    const { executor, executed } = fakeDatabase();

    await expect(ensureApplicationRole(executor, role)).resolves.toBe('created');
    expect(roleStatement(executed)).toBe(
      `CREATE ROLE "ayni_app" WITH LOGIN PASSWORD 'una-contrasena-larga'`,
    );
  });

  it('actualiza el rol existente en vez de volver a crearlo', async () => {
    const { executor, executed } = fakeDatabase(['ayni_app']);

    await expect(ensureApplicationRole(executor, role)).resolves.toBe('updated');
    expect(roleStatement(executed)).toBe(
      `ALTER ROLE "ayni_app" WITH LOGIN PASSWORD 'una-contrasena-larga'`,
    );
    expect(executed.some((statement) => statement.startsWith('CREATE ROLE'))).toBe(false);
  });

  it('da permisos de datos pero no de esquema: la API no puede crear tablas', async () => {
    const { executor, executed } = fakeDatabase();

    await ensureApplicationRole(executor, role);

    expect(executed).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "public" TO "ayni_app"',
    );
    expect(executed).toContain('REVOKE CREATE ON SCHEMA "public" FROM "ayni_app"');
    expect(executed.some((statement) => /GRANT[^;]*CREATE ON SCHEMA/.test(statement))).toBe(false);
    expect(executed.some((statement) => /SUPERUSER|CREATEDB|CREATEROLE/.test(statement))).toBe(
      false,
    );
  });

  it('deja preparados los permisos de las tablas que cree la próxima migración', async () => {
    const { executor, executed } = fakeDatabase();

    await ensureApplicationRole(executor, role);

    expect(executed).toContain(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA "public" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "ayni_app"',
    );
  });

  it('no concatena la contraseña: viaja como parámetro y la cita PostgreSQL', async () => {
    const { executor, queries } = fakeDatabase();

    await ensureApplicationRole(executor, role);

    // El SQL que redacta este módulo no lleva la contraseña en ningún caso. Aparece una sola vez,
    // ya citada por el servidor, en la sentencia que el propio servidor devolvió.
    const written = queries.filter(({ sql }) => !sql.startsWith('CREATE ROLE'));
    for (const { sql } of written) {
      expect(sql).not.toContain(role.password);
    }
    expect(queries.filter(({ sql }) => sql.includes(role.password))).toHaveLength(1);
  });

  it('cita el nombre y la contraseña, así que no se puede inyectar SQL', async () => {
    const { executor, executed } = fakeDatabase();

    await ensureApplicationRole(executor, {
      ...role,
      password: "x'; DROP TABLE users; --",
    });

    expect(roleStatement(executed)).toBe(
      `CREATE ROLE "ayni_app" WITH LOGIN PASSWORD 'x''; DROP TABLE users; --'`,
    );
  });

  it('falla claro si PostgreSQL no devuelve la sentencia, en vez de ejecutar algo vacío', async () => {
    const executor: SqlExecutor = {
      query: (sql: string) => Promise.resolve(sql.startsWith('SELECT format(') ? [{}] : []),
    };

    await expect(ensureApplicationRole(executor, role)).rejects.toThrow(
      'PostgreSQL no devolvió la sentencia a ejecutar',
    );
  });

  it('rechaza un usuario que no sea un identificador válido', async () => {
    const { executor, executed } = fakeDatabase();

    await expect(
      ensureApplicationRole(executor, { ...role, username: 'app"; DROP TABLE users' }),
    ).rejects.toThrow('DB_APP_USERNAME');
    expect(executed).toHaveLength(0);
  });

  it('apaga el log de consultas lentas mientras fija la contraseña y lo restaura', async () => {
    const { executor, executed } = fakeDatabase();

    await ensureApplicationRole(executor, role);

    const set = executed.indexOf('SET log_min_duration_statement = -1');
    const reset = executed.indexOf('RESET log_min_duration_statement');
    const create = executed.findIndex((statement) => statement.startsWith('CREATE ROLE'));

    expect(set).toBeGreaterThanOrEqual(0);
    expect(set).toBeLessThan(create);
    expect(reset).toBeGreaterThan(create);
  });

  it('sigue adelante si el rol no puede cambiar el log, y no intenta restaurarlo', async () => {
    const { executor, executed } = fakeDatabase([], { canSuppressLogging: false });

    await expect(ensureApplicationRole(executor, role)).resolves.toBe('created');
    expect(executed).not.toContain('RESET log_min_duration_statement');
  });

  it('usa el esquema indicado cuando no es public', async () => {
    const { executor, executed } = fakeDatabase();

    await ensureApplicationRole(executor, { ...role, schema: 'ayni' });

    expect(executed).toContain('GRANT USAGE ON SCHEMA "ayni" TO "ayni_app"');
  });
});
