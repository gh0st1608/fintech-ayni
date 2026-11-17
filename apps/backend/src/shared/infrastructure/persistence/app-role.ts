/**
 * Usuario de aplicación de la base de datos (COPAYNI-12).
 *
 * La credencial maestra que gestiona RDS es solo para migrar: la API se conecta con un rol propio
 * que puede leer y escribir filas, pero no crear ni alterar tablas. Este módulo lo crea o lo
 * actualiza desde el runner de migraciones, que es el único que corre con la credencial maestra.
 *
 * Es idempotente: se ejecuta en cada despliegue, después de las migraciones, para que las tablas
 * nuevas queden con permisos y para rotar la contraseña sin pasos manuales.
 */

/** Lo que necesita de TypeORM: una consulta parametrizada. */
export interface SqlExecutor {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
}

export interface ApplicationRole {
  username: string;
  password: string;
  database: string;
  /** Esquema donde viven las tablas de la API. */
  schema?: string;
}

export type RoleOutcome = 'created' | 'updated';

/**
 * Identificadores y literales los cita PostgreSQL con `format`, no esta función: un nombre o una
 * contraseña con comillas no pueden cambiar la sentencia. El patrón del usuario se valida igual
 * en `env.validation`, pero no se confía en que la validación esté puesta.
 */
const USERNAME_PATTERN = /^[a-z_][a-z0-9_]{2,62}$/;

async function buildStatement(
  database: SqlExecutor,
  template: string,
  parameters: string[],
): Promise<string> {
  // La plantilla también viaja como parámetro: aquí no se concatena texto en el SQL.
  const placeholders = parameters.map((_, index) => `$${index + 2}::text`).join(', ');
  const rows = (await database.query(`SELECT format($1, ${placeholders}) AS statement`, [
    template,
    ...parameters,
  ])) as Array<{ statement?: string }>;
  const statement = rows[0]?.statement;
  if (!statement) throw new Error('PostgreSQL no devolvió la sentencia a ejecutar');
  return statement;
}

async function roleExists(database: SqlExecutor, username: string): Promise<boolean> {
  const rows = (await database.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [
    username,
  ])) as unknown[];
  return rows.length > 0;
}

/**
 * Deja el rol con exactamente los permisos que la API necesita. Los `GRANT` son acumulativos, así
 * que el `REVOKE CREATE` no sobra: si alguien se lo concedió a mano, el siguiente despliegue se lo
 * quita.
 */
function privilegeTemplates(): string[] {
  return [
    'GRANT CONNECT ON DATABASE %2$I TO %1$I',
    'GRANT USAGE ON SCHEMA %3$I TO %1$I',
    'REVOKE CREATE ON SCHEMA %3$I FROM %1$I',
    'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %3$I TO %1$I',
    'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %3$I TO %1$I',
    // Para las tablas que cree la próxima migración, sin esperar al despliegue siguiente.
    'ALTER DEFAULT PRIVILEGES IN SCHEMA %3$I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %1$I',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA %3$I GRANT USAGE, SELECT ON SEQUENCES TO %1$I',
  ];
}

/**
 * `log_min_duration_statement` registra el texto de las consultas lentas, contraseña incluida.
 * Se apaga mientras se crea el rol y se restaura después. No todos los roles pueden cambiarlo
 * (en RDS el maestro sí): si no se puede, se sigue igual, porque el parameter group ya fija
 * `log_statement = none` y la sentencia tarda milisegundos.
 */
async function withoutStatementLogging<T>(
  database: SqlExecutor,
  run: () => Promise<T>,
): Promise<T> {
  let suppressed = false;
  try {
    await database.query('SET log_min_duration_statement = -1');
    suppressed = true;
  } catch {
    // El rol no puede cambiar el parámetro: se sigue sin silenciar.
  }
  try {
    return await run();
  } finally {
    if (suppressed) {
      try {
        await database.query('RESET log_min_duration_statement');
      } catch {
        // La sesión se cierra enseguida: no hay nada que restaurar.
      }
    }
  }
}

export async function ensureApplicationRole(
  database: SqlExecutor,
  role: ApplicationRole,
): Promise<RoleOutcome> {
  if (!USERNAME_PATTERN.test(role.username)) {
    throw new Error('DB_APP_USERNAME no es un identificador PostgreSQL válido');
  }
  const schema = role.schema ?? 'public';

  const exists = await roleExists(database, role.username);
  const verb = exists ? 'ALTER' : 'CREATE';
  await withoutStatementLogging(database, async () => {
    // La contraseña la cita PostgreSQL como literal; este módulo nunca la concatena.
    const roleStatement = await buildStatement(
      database,
      `${verb} ROLE %1$I WITH LOGIN PASSWORD %2$L`,
      [role.username, role.password],
    );
    await database.query(roleStatement);
  });

  for (const template of privilegeTemplates()) {
    const statement = await buildStatement(database, template, [
      role.username,
      role.database,
      schema,
    ]);
    await database.query(statement);
  }

  return exists ? 'updated' : 'created';
}
