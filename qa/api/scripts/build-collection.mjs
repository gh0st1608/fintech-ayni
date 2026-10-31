// Genera collections/ayni-api.postman_collection.json (Postman v2.1) desde esta definición.
// La colección es un artefacto: se edita aquí y se regenera con `npm run build`, así las
// assertions comunes no se copian a mano en cada request (docs/automation-guidelines.md).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ─── Scripts comunes de la colección ────────────────────────────────────────────────────────────

/** Pruebas que pueden correr en prd: no crean datos ni gastan límites de usuarios reales. */
const PRD_SAFE = [];
/** Pruebas de prd que además necesitan ENV_PRD_ACCESS_TOKEN (solo lectura). */
const PRD_AUTH = [];

const collectionPrerequest = () => `
// Identificador de la ejecución: aísla los datos (emails únicos) y se envía en x-qa-run-id. Se
// renueva en la primera request de una corrida completa: en la app de Postman las variables de
// colección persisten entre corridas y se reutilizarían los mismos usuarios.
let runId = pm.collectionVariables.get('testRunId');
if (!runId || pm.info.requestName.startsWith('TC-OPS-HEALTH-LIVE-001 ')) {
  runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  pm.collectionVariables.set('testRunId', runId);
  const domain = pm.environment.get('ENV_TEST_EMAIL_DOMAIN') || 'qa.ayni.test';
  ['A', 'B', 'C', 'D', 'R'].forEach((user) =>
    pm.collectionVariables.set('email' + user, 'qa-' + user.toLowerCase() + '-' + runId + '@' + domain),
  );
  pm.collectionVariables.set('emailNewA', 'qa-a2-' + runId + '@' + domain);
  pm.collectionVariables.set('phoneP', '+519' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0'));
}
pm.request.headers.upsert({ key: 'x-qa-run-id', value: runId });

// Guardas por ambiente: fuera de dev solo corren las pruebas marcadas como seguras.
const env = pm.environment.get('ENV_NAME');
const id = pm.info.requestName.split(' ')[0];
const allowWrites = pm.environment.get('ENV_ALLOW_WRITES') === 'true';
const safe = (pm.collectionVariables.get('PRD_SAFE_TESTS') || '').split(',');
const needsToken = (pm.collectionVariables.get('PRD_AUTH_TESTS') || '').split(',');
if (!allowWrites) {
  if (!safe.includes(id)) {
    console.log('[' + env + '] omitido (no seguro fuera de dev): ' + id);
    pm.execution.skipRequest();
  }
  if (needsToken.includes(id)) {
    const token = pm.environment.get('ENV_PRD_ACCESS_TOKEN');
    if (!token) {
      console.log('[' + env + '] omitido (sin ENV_PRD_ACCESS_TOKEN): ' + id);
      pm.execution.skipRequest();
    }
    pm.collectionVariables.set('tokenA', token || '');
  }
}
`;

const collectionTests = () => `
// Assertions comunes (base técnica §6): solo para respuestas de la API, no para las subidas a S3.
const base = pm.environment.get('baseUrl');
const url = pm.request.url.toString();
const isApi = url.startsWith(base + '/v1') || url.startsWith(base + '/health') || url.startsWith(base + '/admin');
if (isApi) {
  const limit = Number(pm.environment.get('ENV_MAX_RESPONSE_MS') || 2000);
  pm.test('[común] Tiempo de respuesta < ' + limit + ' ms', () => {
    pm.expect(pm.response.responseTime).to.be.below(limit);
  });
  if (pm.response.code !== 204) {
    pm.test('[común] Content-Type JSON', () => {
      pm.expect(pm.response.headers.get('Content-Type') || '').to.include('application/json');
    });
    let body = null;
    try { body = pm.response.json(); } catch (e) { /* lo valida la prueba anterior */ }
    if (body) {
      pm.test('[común] Sobre estándar { success, data|error, traceId }', () => {
        pm.expect(body.success).to.be.a('boolean');
        pm.expect(body.traceId).to.match(/^[0-9a-f]{32}$/);
        if (body.success) pm.expect(body).to.have.property('data');
        else {
          pm.expect(body.error.code).to.be.a('string').and.match(/^[A-Z_]+$/);
          pm.expect(body.error.message).to.be.a('string');
        }
      });
      pm.test('[común] Sin detalles internos (stack, SQL)', () => {
        const text = JSON.stringify(body);
        pm.expect(text).not.to.match(/"stack"|\\bat [A-Za-z]+ \\(|QueryFailedError|node_modules/);
      });
      pm.test('[común] x-trace-id coincide con traceId', () => {
        pm.expect(pm.response.headers.get('x-trace-id')).to.eql(body.traceId);
      });
    }
  }
}
`;

/** Prelude de cada test: cuerpo, data y helpers de dinero y errores. */
const PRELUDE = `const body = (() => { try { return pm.response.json(); } catch (e) { return null; } })();
const data = body && body.data;
const isMoney = (m) => !!m && Number.isInteger(m.amount) && /^[A-Z]{3}$/.test(m.currency);
const expectError = (http, code) => {
  pm.test('HTTP ' + http + ' ' + code, () => {
    pm.response.to.have.status(http);
    pm.expect(body.success).to.eql(false);
    pm.expect(body.error.code).to.eql(code);
  });
};
const expectStatus = (codes) => {
  pm.test('HTTP ' + [].concat(codes).join(' o '), () => {
    pm.expect(pm.response.code).to.be.oneOf([].concat(codes));
  });
};
const save = (name, value) => pm.collectionVariables.set(name, value);
`;

// ─── Definición de requests ─────────────────────────────────────────────────────────────────────

const AUTH = { A: 'tokenA', B: 'tokenB', C: 'tokenC', P: 'tokenP' };

/**
 * @param {string} id TC-<TYPE>-<DOMAIN>-<FEATURE>-<NNN>
 * @param {object} o method, path, auth (A|B|C|P|none|raw:<valor>), body, headers, tests,
 *   prerequest, requirement (Jira), description, prd ('safe'|'auth'), rawUrl (URL absoluta)
 */
function tc(id, title, o) {
  if (o.prd === 'safe' || o.prd === 'auth') PRD_SAFE.push(id);
  if (o.prd === 'auth') PRD_AUTH.push(id);
  const headers = [];
  if (o.auth && o.auth !== 'none') {
    const value = o.auth.startsWith('raw:') ? o.auth.slice(4) : `Bearer {{${AUTH[o.auth]}}}`;
    headers.push({ key: 'Authorization', value });
  }
  if (o.idempotencyKey) headers.push({ key: 'Idempotency-Key', value: o.idempotencyKey });
  for (const [key, value] of Object.entries(o.headers ?? {})) headers.push({ key, value });
  let body;
  if (o.body !== undefined) {
    const raw = typeof o.body === 'string' ? o.body : JSON.stringify(o.body, null, 2);
    if (!o.headers?.['Content-Type'])
      headers.push({ key: 'Content-Type', value: 'application/json' });
    body = { mode: 'raw', raw };
  }
  const raw = o.rawUrl ?? `{{baseUrl}}${o.path}`;
  const [pathPart, queryPart] = raw.split('?');
  // Una URL que es solo una variable (subidas a S3) va como texto: newman no la resuelve como objeto.
  let url = raw;
  if (!o.rawUrl) {
    url = { raw };
    url.host = ['{{baseUrl}}'];
    url.path = pathPart.replace('{{baseUrl}}/', '').split('/');
    if (queryPart) {
      url.query = queryPart.split('&').map((pair) => {
        const [key, value = ''] = pair.split('=');
        return { key, value };
      });
    }
  }
  const event = [];
  if (o.prerequest)
    event.push({
      listen: 'prerequest',
      script: { type: 'text/javascript', exec: o.prerequest.trim().split('\n') },
    });
  // En un bloque: el sandbox de Postman ya declara `data` (datos de iteración) en el ámbito global.
  if (o.tests) {
    const exec = ['{', ...(PRELUDE + o.tests.trim()).split('\n'), '}'];
    event.push({ listen: 'test', script: { type: 'text/javascript', exec } });
  }
  const description = [
    o.requirement ? `**Requisito:** ${o.requirement}` : null,
    o.description ?? null,
    o.prd === 'safe' ? '**prd:** se ejecuta (no crea datos).' : null,
    o.prd === 'auth' ? '**prd:** se ejecuta con `ENV_PRD_ACCESS_TOKEN` (solo lectura).' : null,
  ]
    .filter(Boolean)
    .join('\n\n');
  return {
    name: `${id} · ${title}`,
    event,
    request: { method: o.method, header: headers, ...(body && { body }), url, description },
  };
}

const folder = (name, description, item) => ({ name, description, item });
const UUID_ZERO = '00000000-0000-4000-8000-000000000000';

// ─── 00-Framework ───────────────────────────────────────────────────────────────────────────────

const authSetup = (user) => [
  tc(`TC-FUNC-AUTH-SETUP-${user}01`, `Usuario ${user}: inicia sesión con email`, {
    method: 'POST',
    path: '/v1/auth/start',
    auth: 'none',
    body: { identifier: `{{email${user}}}`, type: 'email' },
    requirement: 'COPAYNI-19',
    tests: `expectStatus(200);
save('challenge${user}', data.challengeId);`,
  }),
  tc(`TC-FUNC-AUTH-SETUP-${user}02`, `Usuario ${user}: verifica el OTP y guarda los tokens`, {
    method: 'POST',
    path: '/v1/auth/verify',
    auth: 'none',
    body: { challengeId: `{{challenge${user}}}`, code: '{{ENV_OTP_CODE}}' },
    requirement: 'COPAYNI-20',
    tests: `expectStatus(200);
pm.test('Devuelve access y refresh token', () => {
  pm.expect(data.accessToken).to.be.a('string').and.not.empty;
  pm.expect(data.refreshToken).to.be.a('string').and.not.empty;
});
save('token${user}', data.accessToken);
save('refresh${user}', data.refreshToken);`,
  }),
];

const framework = folder(
  '00-Framework',
  'Health-Check, validación del ambiente y autenticación de los usuarios de prueba (A y B).',
  [
    folder('Health-Check', '', [
      tc('TC-OPS-HEALTH-LIVE-001', 'Liveness responde ok', {
        method: 'GET',
        path: '/health/live',
        prd: 'safe',
        requirement: 'COPAYNI-10',
        tests: `expectStatus(200);
pm.test('status = ok', () => pm.expect(data.status).to.eql('ok'));`,
      }),
    ]),
    folder('Environment-Validation', '', [
      tc('TC-FUNC-FRAMEWORK-ENV-001', 'El ambiente tiene las variables requeridas', {
        method: 'GET',
        path: '/health/ready',
        prd: 'safe',
        requirement: 'COPAYNI-10',
        description: 'Readiness (PostgreSQL) y variables del environment.',
        tests: `expectStatus(200);
const env = pm.environment.get('ENV_NAME');
pm.test('ENV_NAME es dev o prd', () => pm.expect(env).to.be.oneOf(['dev', 'prd']));
pm.test('baseUrl sin barra final', () => pm.expect(pm.environment.get('baseUrl')).not.to.match(/\\/$/));
if (env === 'prd') {
  pm.test('prd usa https', () => pm.expect(pm.environment.get('baseUrl')).to.match(/^https:\\/\\//));
  pm.test('prd no escribe datos', () => pm.expect(pm.environment.get('ENV_ALLOW_WRITES')).not.to.eql('true'));
} else {
  pm.test('dev tiene el código OTP de desarrollo', () => pm.expect(pm.environment.get('ENV_OTP_CODE')).to.match(/^\\d{4}$/));
}`,
      }),
    ]),
    folder(
      'Authentication-Setup',
      'Crea los usuarios A y B de esta ejecución (emails únicos por testRunId).',
      [...authSetup('A'), ...authSetup('B')],
    ),
  ],
);

// ─── 01-Authentication ──────────────────────────────────────────────────────────────────────────

const authentication = folder('01-Authentication', 'COPAYNI-19, 20 y 21 (docs/api/auth.md).', [
  folder('Positive', '', [
    tc('TC-FUNC-AUTH-START-001', 'Inicia sesión con teléfono E.164', {
      method: 'POST',
      path: '/v1/auth/start',
      auth: 'none',
      body: { identifier: '{{phoneP}}', type: 'phone' },
      requirement: 'COPAYNI-19 · CA: OTP por SMS al teléfono',
      tests: `expectStatus(200);
pm.test('AuthChallenge completo', () => {
  pm.expect(data.challengeId).to.be.a('string').and.not.empty;
  pm.expect(data.channel).to.eql('sms');
  pm.expect(new Date(data.expiresAt).getTime()).to.be.above(Date.now());
  pm.expect(new Date(data.resendAvailableAt).getTime()).to.be.at.most(new Date(data.expiresAt).getTime());
});
pm.test('El destino va enmascarado (no expone el teléfono)', () => {
  const phone = pm.collectionVariables.get('phoneP');
  pm.expect(data.maskedDestination).not.to.include(phone.slice(3));
});
save('challengeP', data.challengeId);`,
    }),
    tc('TC-FUNC-AUTH-VERIFY-002', 'Verifica el OTP del teléfono', {
      method: 'POST',
      path: '/v1/auth/verify',
      auth: 'none',
      body: { challengeId: '{{challengeP}}', code: '{{ENV_OTP_CODE}}' },
      requirement: 'COPAYNI-20',
      tests: `expectStatus(200);
pm.test('El access token es un JWT ES256 con kid', () => {
  const header = JSON.parse(atob(data.accessToken.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')));
  pm.expect(header.alg).to.eql('ES256');
  pm.expect(header.kid).to.be.a('string');
});
save('tokenP', data.accessToken);
save('refreshP', data.refreshToken);`,
    }),
    tc('TC-FUNC-AUTH-REFRESH-003', 'Renueva la sesión y rota el refresh token', {
      method: 'POST',
      path: '/v1/auth/refresh',
      auth: 'none',
      body: { refreshToken: '{{refreshP}}' },
      requirement: 'COPAYNI-21 · rotación obligatoria',
      tests: `expectStatus(200);
pm.test('El refresh token cambia', () => pm.expect(data.refreshToken).not.to.eql(pm.collectionVariables.get('refreshP')));
save('refreshPOld', pm.collectionVariables.get('refreshP'));
save('tokenP', data.accessToken);
save('refreshP', data.refreshToken);`,
    }),
    tc('TC-FUNC-AUTH-LOGOUT-004', 'Cierra la sesión', {
      method: 'POST',
      path: '/v1/auth/logout',
      auth: 'none',
      body: { refreshToken: '{{refreshP}}' },
      requirement: 'COPAYNI-21',
      tests: 'expectStatus([200, 204]);',
    }),
    tc('TC-FUNC-AUTH-LOGOUT-005', 'Cerrar sesión otra vez es idempotente', {
      method: 'POST',
      path: '/v1/auth/logout',
      auth: 'none',
      body: { refreshToken: '{{refreshP}}' },
      requirement: 'COPAYNI-21 · logout idempotente',
      tests: 'expectStatus([200, 204]);',
    }),
  ]),
  folder('Negative', '', [
    tc('TC-NEG-AUTH-START-001', 'Email con formato inválido', {
      method: 'POST',
      path: '/v1/auth/start',
      auth: 'none',
      body: { identifier: 'no-es-un-email', type: 'email' },
      prd: 'safe',
      requirement: 'COPAYNI-19',
      tests: `expectError(400, 'VALIDATION_ERROR');
pm.test('details.identifier', () => pm.expect(body.error.details).to.have.property('identifier'));`,
    }),
    tc('TC-NEG-AUTH-START-002', 'Tipo de identificador desconocido', {
      method: 'POST',
      path: '/v1/auth/start',
      auth: 'none',
      body: { identifier: 'qa@qa.ayni.test', type: 'fax' },
      prd: 'safe',
      requirement: 'COPAYNI-19',
      tests: `expectError(400, 'VALIDATION_ERROR');`,
    }),
    tc('TC-NEG-AUTH-START-003', 'Teléfono sin código de país', {
      method: 'POST',
      path: '/v1/auth/start',
      auth: 'none',
      body: { identifier: '987654321', type: 'phone' },
      prd: 'safe',
      requirement: 'COPAYNI-19 · E.164',
      tests: `expectError(400, 'VALIDATION_ERROR');`,
    }),
    tc('TC-NEG-AUTH-VERIFY-004', 'Usuario D: inicia sesión para las pruebas de OTP', {
      method: 'POST',
      path: '/v1/auth/start',
      auth: 'none',
      body: { identifier: '{{emailD}}', type: 'email' },
      requirement: 'COPAYNI-20',
      tests: `expectStatus(200);
save('challengeD', data.challengeId);`,
    }),
    tc('TC-NEG-AUTH-VERIFY-005', 'Código incorrecto descuenta intentos', {
      method: 'POST',
      path: '/v1/auth/verify',
      auth: 'none',
      body: { challengeId: '{{challengeD}}', code: '0000' },
      requirement: 'COPAYNI-20',
      description: 'Si ENV_OTP_CODE fuera 0000, este caso no aplica.',
      tests: `expectError(422, 'OTP_INVALID');
pm.test('details.attemptsRemaining', () => pm.expect(Number(body.error.details.attemptsRemaining)).to.be.within(0, 4));`,
    }),
    tc('TC-NEG-AUTH-VERIFY-006', 'Desafío inexistente', {
      method: 'POST',
      path: '/v1/auth/verify',
      auth: 'none',
      body: { challengeId: UUID_ZERO, code: '1234' },
      prd: 'safe',
      requirement: 'COPAYNI-20',
      tests: `expectError(422, 'OTP_EXPIRED');`,
    }),
    tc('TC-NEG-AUTH-RESEND-007', 'Reenvío antes de resendAvailableAt', {
      method: 'POST',
      path: '/v1/auth/resend',
      auth: 'none',
      body: { challengeId: '{{challengeD}}' },
      requirement: 'COPAYNI-20 · contador de reenvío',
      tests: `expectError(429, 'RATE_LIMITED');
pm.test('Cabecera Retry-After en segundos', () => pm.expect(Number(pm.response.headers.get('Retry-After'))).to.be.above(0));`,
    }),
    tc('TC-NEG-AUTH-RESEND-008', 'Reenvío de un desafío inexistente', {
      method: 'POST',
      path: '/v1/auth/resend',
      auth: 'none',
      body: { challengeId: UUID_ZERO },
      requirement: 'COPAYNI-20',
      tests: `expectError(404, 'NOT_FOUND');`,
    }),
    tc('TC-SEC-AUTH-RATE-009', 'El sexto inicio del mismo identificador se limita', {
      method: 'POST',
      path: '/v1/auth/start',
      auth: 'none',
      body: { identifier: '{{emailR}}', type: 'email' },
      requirement: 'COPAYNI-19 · 5 inicios por identificador cada 15 min (R10)',
      description: 'El pre-request hace 5 inicios; esta request es el sexto.',
      prerequest: `
const send = (left) => {
  if (left === 0) return;
  pm.sendRequest({
    url: pm.environment.get('baseUrl') + '/v1/auth/start',
    method: 'POST',
    header: { 'Content-Type': 'application/json' },
    body: { mode: 'raw', raw: JSON.stringify({ identifier: pm.collectionVariables.get('emailR'), type: 'email' }) },
  }, () => send(left - 1));
};
send(5);`,
      tests: `expectError(429, 'RATE_LIMITED');
pm.test('Cabecera Retry-After', () => pm.expect(Number(pm.response.headers.get('Retry-After'))).to.be.above(0));`,
    }),
  ]),
  folder('Token-Lifecycle', '', [
    tc('TC-SEC-AUTH-TOKEN-001', 'Sin token: 401', {
      method: 'GET',
      path: '/v1/me',
      auth: 'none',
      prd: 'safe',
      requirement: 'COPAYNI-21',
      tests: `expectError(401, 'UNAUTHORIZED');`,
    }),
    tc('TC-SEC-AUTH-TOKEN-002', 'Token mal formado: 401', {
      method: 'GET',
      path: '/v1/me',
      auth: 'raw:Bearer no-es-un-jwt',
      prd: 'safe',
      requirement: 'COPAYNI-21',
      tests: `expectError(401, 'UNAUTHORIZED');`,
    }),
    tc('TC-SEC-AUTH-TOKEN-003', 'JWT con alg none: 401', {
      method: 'GET',
      path: '/v1/me',
      auth: 'raw:Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDAifQ.',
      prd: 'safe',
      requirement: 'COPAYNI-21 · OWASP API2',
      tests: `expectError(401, 'UNAUTHORIZED');`,
    }),
    tc('TC-SEC-AUTH-TOKEN-004', 'Access token con la firma alterada: 401', {
      method: 'GET',
      path: '/v1/me',
      auth: 'raw:Bearer {{tokenATampered}}',
      requirement: 'COPAYNI-21',
      prerequest: `
const token = pm.collectionVariables.get('tokenA') || '';
const parts = token.split('.');
const signature = parts[2] || '';
const flipped = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
pm.collectionVariables.set('tokenATampered', [parts[0], parts[1], flipped].join('.'));`,
      tests: `expectError(401, 'UNAUTHORIZED');`,
    }),
    tc('TC-SEC-AUTH-TOKEN-005', 'Refresh token inválido: 401', {
      method: 'POST',
      path: '/v1/auth/refresh',
      auth: 'none',
      body: { refreshToken: 'refresh-token-inexistente' },
      prd: 'safe',
      requirement: 'COPAYNI-21',
      tests: `expectError(401, 'UNAUTHORIZED');`,
    }),
    tc('TC-SEC-AUTH-TOKEN-006', 'Reutilizar un refresh token ya rotado: 401', {
      method: 'POST',
      path: '/v1/auth/refresh',
      auth: 'none',
      body: { refreshToken: '{{refreshPOld}}' },
      requirement: 'COPAYNI-21 · detección de robo (revoca la familia)',
      tests: `expectError(401, 'UNAUTHORIZED');`,
    }),
  ]),
]);

// ─── 02-Users ───────────────────────────────────────────────────────────────────────────────────

const NAME_80 = 'A'.repeat(80);
const users = folder('02-Users', 'COPAYNI-44, 45 y 50 (docs/api/me.md).', [
  tc('TC-FUNC-USER-ME-001', 'Consulta su perfil', {
    method: 'GET',
    path: '/v1/me',
    auth: 'A',
    requirement: 'COPAYNI-44',
    tests: `expectStatus(200);
pm.test('Modelo Me', () => {
  pm.expect(data.id).to.match(/^[0-9a-f-]{36}$/);
  pm.expect(data.email).to.eql(pm.collectionVariables.get('emailA'));
  pm.expect(data).to.have.property('phone');
  pm.expect(data).to.have.property('status');
  pm.expect(data.monthlyPayInLimit === null || isMoney(data.monthlyPayInLimit)).to.eql(true);
});
save('userIdA', data.id);`,
  }),
  tc('TC-FUNC-USER-ME-002', 'Actualiza nombre y apellido', {
    method: 'PATCH',
    path: '/v1/me',
    auth: 'A',
    body: { firstName: '  Ana  ', lastName: 'Quispe' },
    requirement: 'COPAYNI-45 · recorta espacios',
    tests: `expectStatus(200);
pm.test('fullName = nombre + apellido, sin espacios extra', () => pm.expect(data.fullName).to.eql('Ana Quispe'));`,
  }),
  tc('TC-FUNC-USER-ME-003', 'Cambia el idioma preferido', {
    method: 'PATCH',
    path: '/v1/me',
    auth: 'A',
    body: { preferredLanguage: 'en' },
    requirement: 'COPAYNI-50',
    tests: `expectStatus(200);
pm.test('preferredLanguage = en', () => pm.expect(data.preferredLanguage).to.eql('en'));`,
  }),
  tc('TC-FUNC-USER-ME-004', 'Nombre de 80 caracteres (límite)', {
    method: 'PATCH',
    path: '/v1/me',
    auth: 'A',
    body: { firstName: NAME_80 },
    requirement: 'COPAYNI-45 · BVA 1–80',
    tests: `expectStatus(200);`,
  }),
  tc('TC-NEG-USER-ME-005', 'Nombre de 81 caracteres', {
    method: 'PATCH',
    path: '/v1/me',
    auth: 'A',
    body: { firstName: NAME_80 + 'A' },
    requirement: 'COPAYNI-45 · BVA 1–80',
    tests: `expectError(400, 'VALIDATION_ERROR');`,
  }),
  tc('TC-NEG-USER-ME-006', 'Cuerpo vacío', {
    method: 'PATCH',
    path: '/v1/me',
    auth: 'A',
    body: {},
    requirement: 'COPAYNI-45',
    tests: `expectError(400, 'VALIDATION_ERROR');`,
  }),
  tc('TC-NEG-USER-ME-007', 'Nombre con < y >', {
    method: 'PATCH',
    path: '/v1/me',
    auth: 'A',
    body: { firstName: '<script>' },
    requirement: 'COPAYNI-45 · rechaza < >',
    tests: `expectError(400, 'VALIDATION_ERROR');`,
  }),
  tc('TC-NEG-USER-ME-008', 'Campo no permitido (email por PATCH)', {
    method: 'PATCH',
    path: '/v1/me',
    auth: 'A',
    body: { email: 'otro@qa.ayni.test' },
    requirement: 'COPAYNI-45 · el email se cambia con OTP',
    tests: `expectError(400, 'VALIDATION_ERROR');`,
  }),
  tc('TC-NEG-USER-ME-009', 'Idioma con formato inválido', {
    method: 'PATCH',
    path: '/v1/me',
    auth: 'A',
    body: { preferredLanguage: 'español!' },
    requirement: 'COPAYNI-50 · BCP 47',
    tests: `expectError(400, 'VALIDATION_ERROR');`,
  }),
  tc('TC-NEG-USER-CONTACT-010', 'Cambiar al mismo email que ya tiene', {
    method: 'POST',
    path: '/v1/me/contact/start',
    auth: 'A',
    body: { identifier: '{{emailA}}', type: 'email' },
    requirement: 'COPAYNI-45 · R9',
    tests: `expectError(400, 'VALIDATION_ERROR');`,
  }),
  tc('TC-NEG-USER-CONTACT-011', 'Pide cambiar al email de otra cuenta', {
    method: 'POST',
    path: '/v1/me/contact/start',
    auth: 'A',
    body: { identifier: '{{emailB}}', type: 'email' },
    requirement: 'COPAYNI-45 · no revela si el dato existe antes de verificar',
    tests: `expectStatus(200);
save('challengeTaken', data.challengeId);`,
  }),
  tc('TC-NEG-USER-CONTACT-012', 'Verifica el email de otra cuenta: CONTACT_TAKEN', {
    method: 'POST',
    path: '/v1/me/contact/verify',
    auth: 'A',
    body: { challengeId: '{{challengeTaken}}', code: '{{ENV_OTP_CODE}}' },
    requirement: 'COPAYNI-45 · R9',
    tests: `expectError(409, 'CONTACT_TAKEN');`,
  }),
  tc('TC-FUNC-USER-CONTACT-013', 'Pide cambiar a un email nuevo', {
    method: 'POST',
    path: '/v1/me/contact/start',
    auth: 'A',
    body: { identifier: '{{emailNewA}}', type: 'email' },
    requirement: 'COPAYNI-45 · R9',
    tests: `expectStatus(200);
save('challengeContact', data.challengeId);`,
  }),
  tc('TC-FUNC-USER-CONTACT-014', 'Verifica el email nuevo y se aplica', {
    method: 'POST',
    path: '/v1/me/contact/verify',
    auth: 'A',
    body: { challengeId: '{{challengeContact}}', code: '{{ENV_OTP_CODE}}' },
    requirement: 'COPAYNI-45 · R9',
    tests: `expectStatus(200);
pm.test('El email cambió', () => pm.expect(data.email).to.eql(pm.collectionVariables.get('emailNewA')));
save('emailA', data.email);`,
  }),
  tc('TC-SEC-USER-INPUT-015', 'Texto con comillas y SQL se guarda literal', {
    method: 'PATCH',
    path: '/v1/me',
    auth: 'A',
    body: { lastName: "O'Brien'); DROP TABLE users;--" },
    requirement: 'COPAYNI-45 · OWASP API8 (inyección)',
    tests: `expectStatus(200);
pm.test('Se guarda tal cual (consultas parametrizadas)', () => pm.expect(data.lastName).to.eql("O'Brien'); DROP TABLE users;--"));`,
  }),
]);

// ─── 03-Circles ─────────────────────────────────────────────────────────────────────────────────

const circles = folder('03-Circles', 'COPAYNI-24, 28 a 31, 55, 60 (docs/api/circles.md).', [
  tc('TC-CONTRACT-CIRCLE-CONFIG-001', 'join-config cumple el contrato', {
    method: 'GET',
    path: '/v1/circles/join-config',
    auth: 'A',
    requirement: 'COPAYNI-28',
    tests: `expectStatus(200);
pm.test('Montos del slider en una sola moneda', () => {
  ['min', 'max', 'step'].forEach((k) => pm.expect(isMoney(data.payout[k])).to.eql(true));
  pm.expect(data.payout.min.amount).to.be.below(data.payout.max.amount);
  pm.expect(data.payout.step.amount).to.be.above(0);
  pm.expect(new Set([data.payout.min.currency, data.payout.max.currency, data.payout.step.currency]).size).to.eql(1);
  pm.expect(data.userPayoutLimit === null || isMoney(data.userPayoutLimit)).to.eql(true);
  pm.expect(isMoney(data.savingProgramMax)).to.eql(true);
});
save('payoutMin', data.payout.min.amount);
save('payoutMax', data.payout.max.amount);
save('payoutStep', data.payout.step.amount);
// Un payout en un salto válido y cerca del medio del rango.
const steps = Math.floor((data.payout.max.amount - data.payout.min.amount) / data.payout.step.amount);
save('payoutValid', data.payout.min.amount + Math.floor(steps / 4) * data.payout.step.amount);`,
  }),
  tc('TC-FUNC-CIRCLE-OPTIONS-002', 'Cuotas y duraciones para un payout válido', {
    method: 'GET',
    path: '/v1/circles/installment-options?payoutAmount={{payoutValid}}',
    auth: 'A',
    requirement: 'COPAYNI-29',
    tests: `expectStatus(200);
pm.test('Opciones de menor a mayor duración, cuota = payout / meses', () => {
  pm.expect(data.options).to.be.an('array').that.is.not.empty;
  let previous = 0;
  data.options.forEach((o) => {
    pm.expect(o.months).to.be.above(previous);
    previous = o.months;
    pm.expect(o.installment.amount * o.months).to.eql(data.payout.amount);
  });
});
save('months', data.options[0].months);`,
  }),
  tc('TC-FUNC-CIRCLE-OPTIONS-003', 'Payout mínimo (límite)', {
    method: 'GET',
    path: '/v1/circles/installment-options?payoutAmount={{payoutMin}}',
    auth: 'A',
    requirement: 'COPAYNI-29 · BVA',
    tests: `expectStatus(200);
pm.test('options es una lista (puede venir vacía)', () => pm.expect(data.options).to.be.an('array'));`,
  }),
  tc('TC-NEG-CIRCLE-OPTIONS-004', 'Payout fuera del salto (mínimo + 1)', {
    method: 'GET',
    path: '/v1/circles/installment-options?payoutAmount={{payoutOffStep}}',
    auth: 'A',
    requirement: 'COPAYNI-29 · BVA',
    prerequest: `pm.collectionVariables.set('payoutOffStep', Number(pm.collectionVariables.get('payoutMin')) + 1);`,
    tests: `expectError(422, 'PAYOUT_NOT_ALLOWED');`,
  }),
  tc('TC-NEG-CIRCLE-OPTIONS-005', 'Payout sobre el máximo (máximo + salto)', {
    method: 'GET',
    path: '/v1/circles/installment-options?payoutAmount={{payoutAboveMax}}',
    auth: 'A',
    requirement: 'COPAYNI-29 · BVA',
    prerequest: `pm.collectionVariables.set('payoutAboveMax', Number(pm.collectionVariables.get('payoutMax')) + Number(pm.collectionVariables.get('payoutStep')));`,
    tests: `expectError(422, 'PAYOUT_NOT_ALLOWED');`,
  }),
  tc('TC-NEG-CIRCLE-OPTIONS-006', 'Sin payoutAmount', {
    method: 'GET',
    path: '/v1/circles/installment-options',
    auth: 'A',
    requirement: 'COPAYNI-29',
    tests: `expectError(400, 'VALIDATION_ERROR');`,
  }),
  tc('TC-NEG-CIRCLE-OPTIONS-007', 'payoutAmount no entero', {
    method: 'GET',
    path: '/v1/circles/installment-options?payoutAmount=abc',
    auth: 'A',
    requirement: 'COPAYNI-29',
    tests: `expectError(400, 'VALIDATION_ERROR');`,
  }),
  tc('TC-FUNC-CIRCLE-SLOTS-008', 'Slots del círculo ofrecido', {
    method: 'GET',
    path: '/v1/circles/slots?payoutAmount={{payoutValid}}&months={{months}}',
    auth: 'A',
    requirement: 'COPAYNI-30 · COPAYNI-60',
    tests: `expectStatus(200);
const months = Number(pm.collectionVariables.get('months'));
pm.test('Un slot por mes, posiciones 1..n', () => {
  pm.expect(data.slots).to.have.length(months);
  data.slots.forEach((s, i) => pm.expect(s.position).to.eql(i + 1));
});
pm.test('Tipos y montos válidos', () => {
  data.slots.forEach((s) => {
    pm.expect(s.type).to.be.oneOf(['fastest_payout', 'lowest_fees', 'highest_return']);
    ['fee', 'discount', 'catchUp', 'retention'].forEach((k) => pm.expect(isMoney(s[k])).to.eql(true));
    pm.expect(s.payoutPeriod).to.match(/^\\d{4}-(0[1-9]|1[0-2])$/);
    pm.expect(s.available).to.be.a('boolean');
    pm.expect(s.allowed).to.be.a('boolean');
  });
});
pm.test('Reglas del dominio: fee solo en fastest, descuento solo en highest', () => {
  data.slots.forEach((s) => {
    if (s.type !== 'fastest_payout') pm.expect(s.fee.amount).to.eql(0);
    if (s.type !== 'highest_return') pm.expect(s.discount.amount).to.eql(0);
  });
});
const pick = data.slots.find((s) => s.type === 'lowest_fees' && s.allowed && s.available)
  || data.slots.find((s) => s.allowed && s.available);
pm.test('Hay un slot elegible para el usuario nuevo', () => pm.expect(pick).to.be.an('object'));
save('circleIdOffered', data.circleId === null ? 'null' : JSON.stringify(data.circleId));
save('position', pick.position);
const other = data.slots.find((s) => s.allowed && s.available && s.position !== pick.position);
save('positionOther', other ? other.position : pick.position);
const blocked = data.slots.find((s) => !s.allowed);
save('positionNotAllowed', blocked ? blocked.position : '');`,
  }),
  tc('TC-NEG-CIRCLE-SLOTS-009', 'Duración no ofrecida', {
    method: 'GET',
    path: '/v1/circles/slots?payoutAmount={{payoutValid}}&months=7',
    auth: 'A',
    requirement: 'COPAYNI-30',
    tests: `expectError(400, 'VALIDATION_ERROR');`,
  }),
  tc('TC-CONTRACT-CIRCLE-RECOMMENDED-010', 'Recomendados cumplen el contrato', {
    method: 'GET',
    path: '/v1/circles/recommended',
    auth: 'A',
    requirement: 'COPAYNI-25',
    tests: `expectStatus(200);
pm.test('Lista de círculos recomendados', () => pm.expect(data.items || data).to.be.an('array'));`,
  }),
  ...['A', 'B'].map((user) =>
    tc(
      `TC-FUNC-PAYOUT-SETUP-${user}01`,
      `Usuario ${user} elige método de cobro (precondición de la unión)`,
      {
        method: 'PUT',
        path: '/v1/me/payout-method',
        auth: user,
        body: { method: 'digital_wallet' },
        requirement: 'COPAYNI-31 · la unión exige método de cobro (PAYOUT_METHOD_REQUIRED)',
        tests: `expectStatus(200);`,
      },
    ),
  ),
  tc('TC-NEG-CIRCLE-JOIN-011', 'Unirse sin Idempotency-Key', {
    method: 'POST',
    path: '/v1/circles/join',
    auth: 'A',
    body: '{ "circleId": {{circleIdOffered}}, "payoutAmount": {{payoutValid}}, "months": {{months}}, "position": {{position}} }',
    requirement: 'COPAYNI-31 · idempotencia',
    tests: `expectError(400, 'VALIDATION_ERROR');`,
  }),
  tc('TC-NEG-CIRCLE-JOIN-012', 'Turno que la regla de confianza no permite', {
    method: 'POST',
    path: '/v1/circles/join',
    auth: 'A',
    idempotencyKey: 'qa-{{testRunId}}-join-not-allowed',
    body: '{ "circleId": {{circleIdOffered}}, "payoutAmount": {{payoutValid}}, "months": {{months}}, "position": {{positionNotAllowed}} }',
    requirement: 'COPAYNI-60 · trust_required',
    prerequest: `if (!pm.collectionVariables.get('positionNotAllowed')) {
  console.log('Sin turnos bloqueados por confianza: se omite');
  pm.execution.skipRequest();
}`,
    tests: `expectError(422, 'SLOT_NOT_ALLOWED');
pm.test('details.reason', () => pm.expect(body.error.details.reason).to.be.oneOf(['trust_required', 'identity_required', 'income_required']));`,
  }),
  tc('TC-NEG-CIRCLE-JOIN-013', 'Posición mayor que la duración', {
    method: 'POST',
    path: '/v1/circles/join',
    auth: 'A',
    idempotencyKey: 'qa-{{testRunId}}-join-out-of-range',
    body: '{ "circleId": {{circleIdOffered}}, "payoutAmount": {{payoutValid}}, "months": {{months}}, "position": {{positionOutOfRange}} }',
    requirement: 'COPAYNI-31 · BVA',
    prerequest: `pm.collectionVariables.set('positionOutOfRange', Number(pm.collectionVariables.get('months')) + 1);`,
    tests: `expectError(422, 'SLOT_OUT_OF_RANGE');`,
  }),
  tc('TC-FUNC-CIRCLE-JOIN-014', 'Se une al círculo', {
    method: 'POST',
    path: '/v1/circles/join',
    auth: 'A',
    idempotencyKey: 'qa-{{testRunId}}-join-a',
    body: '{ "circleId": {{circleIdOffered}}, "payoutAmount": {{payoutValid}}, "months": {{months}}, "position": {{position}} }',
    requirement: 'COPAYNI-31 · COPAYNI-55 (precio congelado)',
    tests: `expectStatus(201);
pm.test('Unión creada con su cronograma', () => {
  pm.expect(data.created).to.eql(true);
  pm.expect(data.position).to.eql(Number(pm.collectionVariables.get('position')));
  pm.expect(data.installments).to.have.length(Number(pm.collectionVariables.get('months')));
  data.installments.forEach((i) => pm.expect(isMoney(i)).to.eql(true));
  pm.expect(isMoney(data.netPayout)).to.eql(true);
  pm.expect(data.payoutPeriod > data.startsOn || data.payoutPeriod === data.startsOn).to.eql(true);
});
save('circleId', data.circleId);`,
  }),
  tc('TC-FUNC-CIRCLE-JOIN-015', 'Reintento con la misma clave: misma unión', {
    method: 'POST',
    path: '/v1/circles/join',
    auth: 'A',
    idempotencyKey: 'qa-{{testRunId}}-join-a',
    body: '{ "circleId": {{circleIdOffered}}, "payoutAmount": {{payoutValid}}, "months": {{months}}, "position": {{position}} }',
    requirement: 'COPAYNI-31 · idempotencia',
    tests: `expectStatus(200);
pm.test('created = false y el mismo círculo', () => {
  pm.expect(data.created).to.eql(false);
  pm.expect(data.circleId).to.eql(pm.collectionVariables.get('circleId'));
});`,
  }),
  tc('TC-NEG-CIRCLE-JOIN-016', 'Misma clave con otros datos', {
    method: 'POST',
    path: '/v1/circles/join',
    auth: 'A',
    idempotencyKey: 'qa-{{testRunId}}-join-a',
    body: '{ "circleId": {{circleIdOffered}}, "payoutAmount": {{payoutValid}}, "months": {{months}}, "position": {{positionOther}} }',
    requirement: 'COPAYNI-31 · idempotencia',
    tests: `expectError(409, 'IDEMPOTENCY_KEY_REUSED');`,
  }),
  tc('TC-NEG-CIRCLE-JOIN-017', 'Segundo slot en el mismo círculo', {
    method: 'POST',
    path: '/v1/circles/join',
    auth: 'A',
    idempotencyKey: 'qa-{{testRunId}}-join-a-again',
    body: '{ "circleId": "{{circleId}}", "payoutAmount": {{payoutValid}}, "months": {{months}}, "position": {{positionOther}} }',
    requirement: 'COPAYNI-24 · un slot por usuario',
    tests: `expectError(409, 'ALREADY_MEMBER');`,
  }),
  tc('TC-NEG-CIRCLE-JOIN-018', 'Otro usuario intenta el mismo slot', {
    method: 'POST',
    path: '/v1/circles/join',
    auth: 'B',
    idempotencyKey: 'qa-{{testRunId}}-join-b',
    body: '{ "circleId": "{{circleId}}", "payoutAmount": {{payoutValid}}, "months": {{months}}, "position": {{position}} }',
    requirement: 'COPAYNI-31 · reserva atómica del slot',
    tests: `expectError(409, 'SLOT_TAKEN');`,
  }),
  tc('TC-FUNC-CIRCLE-MINE-019', 'Mis círculos activos incluyen el nuevo', {
    method: 'GET',
    path: '/v1/me/circles?status=active',
    auth: 'A',
    requirement: 'COPAYNI-26',
    tests: `expectStatus(200);
pm.test('El círculo aparece en Activos', () => {
  const ids = data.items.map((c) => c.circleId || c.id);
  pm.expect(ids).to.include(pm.collectionVariables.get('circleId'));
});
pm.test('nextCursor presente', () => pm.expect(data).to.have.property('nextCursor'));`,
  }),
  tc('TC-FUNC-CIRCLE-MINE-020', 'Mis círculos finalizados: vacío', {
    method: 'GET',
    path: '/v1/me/circles?status=finished',
    auth: 'A',
    requirement: 'COPAYNI-26',
    tests: `expectStatus(200);
pm.test('Sin círculos finalizados', () => pm.expect(data.items).to.have.length(0));`,
  }),
  tc('TC-NEG-CIRCLE-MINE-021', 'status inválido', {
    method: 'GET',
    path: '/v1/me/circles?status=paused',
    auth: 'A',
    requirement: 'COPAYNI-26',
    tests: `expectError(400, 'VALIDATION_ERROR');`,
  }),
  tc('TC-NEG-CIRCLE-MINE-022', 'limit fuera de rango (0)', {
    method: 'GET',
    path: '/v1/me/circles?status=active&limit=0',
    auth: 'A',
    requirement: 'COPAYNI-26 · BVA',
    tests: `expectError(400, 'VALIDATION_ERROR');`,
  }),
  tc('TC-NEG-CIRCLE-MINE-023', 'cursor inválido', {
    method: 'GET',
    path: '/v1/me/circles?status=active&cursor=no-es-un-cursor',
    auth: 'A',
    requirement: 'COPAYNI-26',
    tests: `expectError(400, 'VALIDATION_ERROR');`,
  }),
]);

// ─── 04-Payments ────────────────────────────────────────────────────────────────────────────────

const payments = folder('04-Payments', 'COPAYNI-35 a 41 y 63 (docs/api/payments.md, payouts.md).', [
  tc('TC-FUNC-PAYOUT-METHOD-001', 'Catálogo de métodos de cobro', {
    method: 'GET',
    path: '/v1/me/payout-method',
    auth: 'A',
    requirement: 'COPAYNI-37',
    tests: `expectStatus(200);
pm.test('Métodos válidos', () => {
  pm.expect(data.methods).to.be.an('array').that.is.not.empty;
  data.methods.forEach((m) => {
    pm.expect(m.type).to.be.oneOf(['digital_wallet', 'prepaid_card', 'bank_transfer', 'fawry']);
    pm.expect(m.available).to.be.a('boolean');
    pm.expect(m.limit === null || isMoney(m.limit)).to.eql(true);
  });
});`,
  }),
  tc('TC-FUNC-PAYOUT-METHOD-002', 'Elige transferencia bancaria', {
    method: 'PUT',
    path: '/v1/me/payout-method',
    auth: 'A',
    body: { method: 'bank_transfer' },
    requirement: 'COPAYNI-37',
    tests: `expectStatus(200);
pm.test('selected = bank_transfer', () => pm.expect(data.selected).to.eql('bank_transfer'));`,
  }),
  tc('TC-NEG-PAYOUT-METHOD-003', 'Método fuera del catálogo', {
    method: 'PUT',
    path: '/v1/me/payout-method',
    auth: 'A',
    body: { method: 'fawry' },
    requirement: 'COPAYNI-37 · T5',
    tests: `expectError(422, 'PAYOUT_METHOD_NOT_AVAILABLE');`,
  }),
  tc('TC-NEG-PAYOUT-METHOD-004', 'Sin method', {
    method: 'PUT',
    path: '/v1/me/payout-method',
    auth: 'A',
    body: {},
    requirement: 'COPAYNI-37',
    tests: `expectError(400, 'VALIDATION_ERROR');`,
  }),
  tc('TC-FUNC-PAY-SETTINGS-005', 'Preferencias de pago por defecto', {
    method: 'GET',
    path: '/v1/me/payment-settings',
    auth: 'A',
    requirement: 'COPAYNI-38',
    tests: `expectStatus(200);
pm.test('deductPayInFromPayout = false por defecto', () => pm.expect(data.deductPayInFromPayout).to.eql(false));`,
  }),
  tc('TC-FUNC-PAY-SETTINGS-006', 'Activa descontar la cuota del payout', {
    method: 'PATCH',
    path: '/v1/me/payment-settings',
    auth: 'A',
    body: { deductPayInFromPayout: true },
    requirement: 'COPAYNI-38',
    tests: `expectStatus(200);
pm.test('Guardado', () => pm.expect(data.deductPayInFromPayout).to.eql(true));`,
  }),
  tc('TC-NEG-PAY-SETTINGS-007', 'Valor no booleano', {
    method: 'PATCH',
    path: '/v1/me/payment-settings',
    auth: 'A',
    body: { deductPayInFromPayout: 'yes' },
    requirement: 'COPAYNI-38',
    tests: `expectError(400, 'VALIDATION_ERROR');`,
  }),
  tc('TC-FUNC-PAY-ELIGIBILITY-008', 'Elegibilidad del payout', {
    method: 'GET',
    path: '/v1/me/payout-eligibility',
    auth: 'A',
    requirement: 'COPAYNI-36',
    tests: `expectStatus(200);
const byKey = Object.fromEntries(data.requirements.map((r) => [r.requirement, r.status]));
pm.test('Los cinco requisitos', () => pm.expect(Object.keys(byKey)).to.have.members(['national_id', 'insurance_note', 'payout_method', 'contract', 'due_payments']));
pm.test('Método de cobro elegido: met', () => pm.expect(byKey.payout_method).to.eql('met'));
pm.test('Pagaré y contrato sin firma electrónica: unavailable', () => {
  pm.expect(byKey.insurance_note).to.eql('unavailable');
  pm.expect(byKey.contract).to.eql('unavailable');
});
pm.test('isEligible es coherente', () => pm.expect(data.isEligible).to.eql(Object.values(byKey).every((s) => s === 'met')));`,
  }),
  tc('TC-CONTRACT-PAY-SUMMARY-009', 'Resumen de pagos cumple el contrato', {
    method: 'GET',
    path: '/v1/me/payments/summary',
    auth: 'A',
    requirement: 'COPAYNI-35',
    tests: `expectStatus(200);
pm.test('Resumen coherente', () => {
  pm.expect(data.hasDuePayments).to.eql(data.duePayments.length > 0);
  pm.expect(data.totalDue === null || isMoney(data.totalDue)).to.eql(true);
  pm.expect(data.debt === null || isMoney(data.debt)).to.eql(true);
  if (data.totalDue) {
    const sum = data.duePayments.reduce((t, p) => t + p.amount.amount, 0);
    pm.expect(data.totalDue.amount).to.eql(sum);
  }
});`,
  }),
  tc('TC-FUNC-PAY-TX-010', 'Historial de pagos', {
    method: 'GET',
    path: '/v1/me/transactions?type=payment&limit=20',
    auth: 'A',
    requirement: 'COPAYNI-41',
    tests: `expectStatus(200);
pm.test('items y nextCursor', () => {
  pm.expect(data.items).to.be.an('array');
  pm.expect(data).to.have.property('nextCursor');
});`,
  }),
  tc('TC-NEG-PAY-TX-011', 'Historial sin type', {
    method: 'GET',
    path: '/v1/me/transactions',
    auth: 'A',
    requirement: 'COPAYNI-41',
    tests: `expectError(400, 'VALIDATION_ERROR');`,
  }),
  tc('TC-NEG-PAY-TX-012', 'Historial con limit 51', {
    method: 'GET',
    path: '/v1/me/transactions?type=payout&limit=51',
    auth: 'A',
    requirement: 'COPAYNI-41 · BVA 1–50',
    tests: `expectError(400, 'VALIDATION_ERROR');`,
  }),
  tc('TC-FUNC-CARD-ADD-013', 'Guarda la primera tarjeta', {
    method: 'POST',
    path: '/v1/me/cards',
    auth: 'A',
    idempotencyKey: 'qa-{{testRunId}}-card-1',
    body: { token: '{{ENV_CARD_TOKEN_APPROVED}}' },
    requirement: 'COPAYNI-40',
    tests: `expectStatus(201);
pm.test('Tarjeta enmascarada y predeterminada', () => {
  pm.expect(data.lastFour).to.match(/^\\d{4}$/);
  pm.expect(data.isDefault).to.eql(true);
  pm.expect(data.expirationMonth).to.be.within(1, 12);
});
pm.test('No devuelve el número completo ni el token', () => {
  pm.expect(JSON.stringify(data)).not.to.match(/\\d{13,19}/);
  pm.expect(data).not.to.have.property('token');
});
save('cardId1', data.id);`,
  }),
  tc('TC-FUNC-CARD-ADD-014', 'Reintento con la misma clave: la misma tarjeta', {
    method: 'POST',
    path: '/v1/me/cards',
    auth: 'A',
    idempotencyKey: 'qa-{{testRunId}}-card-1',
    body: { token: '{{ENV_CARD_TOKEN_APPROVED}}' },
    requirement: 'COPAYNI-40 · idempotencia',
    tests: `expectStatus(200);
pm.test('Mismo id', () => pm.expect(data.id).to.eql(pm.collectionVariables.get('cardId1')));`,
  }),
  tc('TC-NEG-CARD-ADD-015', 'Tarjeta rechazada por la pasarela', {
    method: 'POST',
    path: '/v1/me/cards',
    auth: 'A',
    idempotencyKey: 'qa-{{testRunId}}-card-rejected',
    body: { token: '{{ENV_CARD_TOKEN_REJECTED}}' },
    requirement: 'COPAYNI-40',
    tests: `expectError(422, 'CARD_REJECTED');`,
  }),
  tc('TC-NEG-CARD-ADD-016', 'Guardar tarjeta sin Idempotency-Key', {
    method: 'POST',
    path: '/v1/me/cards',
    auth: 'A',
    body: { token: '{{ENV_CARD_TOKEN_APPROVED}}' },
    requirement: 'COPAYNI-40',
    tests: `expectError(400, 'VALIDATION_ERROR');`,
  }),
  tc('TC-FUNC-CARD-ADD-017', 'Guarda una segunda tarjeta', {
    method: 'POST',
    path: '/v1/me/cards',
    auth: 'A',
    idempotencyKey: 'qa-{{testRunId}}-card-2',
    body: { token: '{{ENV_CARD_TOKEN_SECOND}}' },
    requirement: 'COPAYNI-39',
    tests: `expectStatus(201);
pm.test('No queda predeterminada', () => pm.expect(data.isDefault).to.eql(false));
save('cardId2', data.id);`,
  }),
  tc('TC-FUNC-CARD-LIST-018', 'Lista con la predeterminada primero', {
    method: 'GET',
    path: '/v1/me/cards',
    auth: 'A',
    requirement: 'COPAYNI-39',
    tests: `expectStatus(200);
pm.test('Dos tarjetas, una sola predeterminada y primera', () => {
  pm.expect(data.items).to.have.length(2);
  pm.expect(data.items.filter((c) => c.isDefault)).to.have.length(1);
  pm.expect(data.items[0].isDefault).to.eql(true);
});`,
  }),
  tc('TC-NEG-CARD-DELETE-019', 'Borrar la predeterminada habiendo otras', {
    method: 'DELETE',
    path: '/v1/me/cards/{{cardId1}}',
    auth: 'A',
    requirement: 'COPAYNI-39',
    tests: `expectError(409, 'DEFAULT_CARD_REPLACEMENT_REQUIRED');`,
  }),
  tc('TC-FUNC-CARD-DEFAULT-020', 'Cambia la predeterminada', {
    method: 'PUT',
    path: '/v1/me/cards/{{cardId2}}/default',
    auth: 'A',
    requirement: 'COPAYNI-39',
    tests: `expectStatus(200);
pm.test('La segunda queda primera y única predeterminada', () => {
  pm.expect(data.items[0].id).to.eql(pm.collectionVariables.get('cardId2'));
  pm.expect(data.items.filter((c) => c.isDefault)).to.have.length(1);
});`,
  }),
  tc('TC-SEC-CARD-BOLA-021', 'Otro usuario intenta borrar la tarjeta (BOLA)', {
    method: 'DELETE',
    path: '/v1/me/cards/{{cardId1}}',
    auth: 'B',
    requirement: 'COPAYNI-39 · OWASP API1',
    tests: `expectError(404, 'CARD_NOT_FOUND');`,
  }),
  tc('TC-FUNC-CARD-DELETE-022', 'Borra la tarjeta que ya no es predeterminada', {
    method: 'DELETE',
    path: '/v1/me/cards/{{cardId1}}',
    auth: 'A',
    requirement: 'COPAYNI-39',
    tests: 'expectStatus(204);',
  }),
  tc('TC-NEG-CARD-DELETE-023', 'Borrar con un id que no es UUID', {
    method: 'DELETE',
    path: '/v1/me/cards/no-es-uuid',
    auth: 'A',
    requirement: 'COPAYNI-39',
    tests: `expectError(400, 'VALIDATION_ERROR');`,
  }),
  tc('TC-NEG-INSTALLMENT-PAY-024', 'Pagar una cuota inexistente', {
    method: 'POST',
    path: `/v1/me/installments/${UUID_ZERO}/pay`,
    auth: 'A',
    idempotencyKey: 'qa-{{testRunId}}-pay-missing',
    body: { method: 'card', cardId: '{{cardId2}}' },
    requirement: 'COPAYNI-63',
    tests: `expectError(404, 'INSTALLMENT_NOT_FOUND');`,
  }),
  tc('TC-NEG-INSTALLMENT-PAY-025', 'Pagar sin Idempotency-Key', {
    method: 'POST',
    path: `/v1/me/installments/${UUID_ZERO}/pay`,
    auth: 'A',
    body: { method: 'card', cardId: '{{cardId2}}' },
    requirement: 'COPAYNI-63',
    tests: `expectError(400, 'VALIDATION_ERROR');`,
  }),
  tc('TC-NEG-INSTALLMENT-PAY-026', 'Método de pago inválido', {
    method: 'POST',
    path: `/v1/me/installments/${UUID_ZERO}/pay`,
    auth: 'A',
    idempotencyKey: 'qa-{{testRunId}}-pay-invalid',
    body: { method: 'cash' },
    requirement: 'COPAYNI-63',
    tests: `expectError(400, 'VALIDATION_ERROR');`,
  }),
]);

// ─── 05-Documents ───────────────────────────────────────────────────────────────────────────────

/** Sube el archivo a la URL prefirmada (S3/floci). Con almacenamiento simulado no hay a dónde subir. */
const putUpload = (id, title, urlVar, contentType, requirement) =>
  tc(id, title, {
    method: 'PUT',
    rawUrl: `{{${urlVar}}}`,
    headers: { 'Content-Type': contentType },
    body: 'x'.repeat(1024),
    requirement,
    description:
      'Sube 1024 bytes con el Content-Type firmado. Se omite si el backend usa almacenamiento simulado.',
    prerequest: `if ((pm.collectionVariables.get('${urlVar}') || '').includes('documents.simulated.ayni')) {
  console.log('Almacenamiento simulado: no hay subida real');
  pm.execution.skipRequest();
}`,
    tests: `pm.test('S3 acepta la subida firmada', () => pm.response.to.have.status(200));`,
  });

const requestUpload = (id, title, purpose, contentType, saveAs, requirement) =>
  tc(id, title, {
    method: 'POST',
    path: '/v1/me/documents/uploads',
    auth: 'A',
    body: { purpose, contentType, sizeBytes: 1024 },
    requirement,
    tests: `expectStatus(201);
pm.test('uploadId y URL prefirmada vigente', () => {
  pm.expect(data.uploadId).to.be.a('string').and.not.empty;
  pm.expect(data.uploadUrl).to.match(/^https?:\\/\\//);
  pm.expect(new Date(data.expiresAt).getTime()).to.be.above(Date.now());
});
pm.test('La clave no contiene datos personales', () => pm.expect(data.uploadUrl).not.to.include(encodeURIComponent(pm.collectionVariables.get('emailA'))));
save('${saveAs}Id', data.uploadId);
save('${saveAs}Url', data.uploadUrl);`,
  });

const documents = folder('05-Documents', 'COPAYNI-43, 46 a 48 (docs/api/documents.md).', [
  tc('TC-FUNC-DOC-LIST-001', 'Mis documentos: nada enviado', {
    method: 'GET',
    path: '/v1/me/documents',
    auth: 'A',
    requirement: 'COPAYNI-46',
    tests: `expectStatus(200);
pm.test('Resumen por tipo sin enviar', () => {
  pm.expect(data.summary).to.eql({ national_id: 'not_submitted', proof_of_income: 'not_submitted', additional: 'not_submitted' });
  pm.expect(data.items).to.have.length(0);
});`,
  }),
  requestUpload(
    'TC-FUNC-DOC-UPLOAD-002',
    'Pide subir el anverso del DNI',
    'national_id_front',
    'image/jpeg',
    'uploadFront',
    'COPAYNI-47',
  ),
  putUpload(
    'TC-INTEGRATION-DOC-PUT-003',
    'Sube el anverso a S3',
    'uploadFrontUrl',
    'image/jpeg',
    'COPAYNI-43',
  ),
  requestUpload(
    'TC-FUNC-DOC-UPLOAD-004',
    'Pide subir el reverso del DNI',
    'national_id_back',
    'image/jpeg',
    'uploadBack',
    'COPAYNI-47',
  ),
  putUpload(
    'TC-INTEGRATION-DOC-PUT-005',
    'Sube el reverso a S3',
    'uploadBackUrl',
    'image/jpeg',
    'COPAYNI-43',
  ),
  tc('TC-NEG-DOC-UPLOAD-006', 'Tipo de archivo no admitido', {
    method: 'POST',
    path: '/v1/me/documents/uploads',
    auth: 'A',
    body: { purpose: 'national_id_front', contentType: 'image/gif', sizeBytes: 1024 },
    requirement: 'COPAYNI-43',
    tests: `expectError(400, 'VALIDATION_ERROR');
pm.test('details.contentType', () => pm.expect(body.error.details).to.have.property('contentType'));`,
  }),
  tc('TC-NEG-DOC-UPLOAD-007', 'Tamaño 0 (límite inferior)', {
    method: 'POST',
    path: '/v1/me/documents/uploads',
    auth: 'A',
    body: { purpose: 'national_id_front', contentType: 'image/jpeg', sizeBytes: 0 },
    requirement: 'COPAYNI-43 · BVA',
    tests: `expectError(400, 'VALIDATION_ERROR');`,
  }),
  tc('TC-NEG-DOC-UPLOAD-008', 'Más de 10 MB (límite superior + 1)', {
    method: 'POST',
    path: '/v1/me/documents/uploads',
    auth: 'A',
    body: { purpose: 'national_id_front', contentType: 'image/jpeg', sizeBytes: 10485761 },
    requirement: 'COPAYNI-43 · BVA',
    tests: `expectError(400, 'VALIDATION_ERROR');
pm.test('details.sizeBytes', () => pm.expect(body.error.details).to.have.property('sizeBytes'));`,
  }),
  tc('TC-NEG-DOC-UPLOAD-009', 'Propósito desconocido', {
    method: 'POST',
    path: '/v1/me/documents/uploads',
    auth: 'A',
    body: { purpose: 'selfie', contentType: 'image/jpeg', sizeBytes: 1024 },
    requirement: 'COPAYNI-43',
    tests: `expectError(400, 'VALIDATION_ERROR');`,
  }),
  tc('TC-SEC-DOC-BOLA-010', 'Otro usuario envía las subidas ajenas (BOLA)', {
    method: 'POST',
    path: '/v1/me/documents/national-id',
    auth: 'B',
    body: { frontUploadId: '{{uploadFrontId}}', backUploadId: '{{uploadBackId}}' },
    requirement: 'COPAYNI-47 · OWASP API1',
    tests: `expectError(422, 'UPLOAD_NOT_USABLE');`,
  }),
  tc('TC-FUNC-DOC-NATIONAL-ID-011', 'Envía el DNI', {
    method: 'POST',
    path: '/v1/me/documents/national-id',
    auth: 'A',
    body: { frontUploadId: '{{uploadFrontId}}', backUploadId: '{{uploadBackId}}' },
    requirement: 'COPAYNI-47',
    tests: `expectStatus(200);
pm.test('Documento de identidad con 2 páginas y estado válido', () => {
  pm.expect(data.type).to.eql('national_id');
  pm.expect(data.pages).to.eql(2);
  pm.expect(data.status).to.be.oneOf(['approved', 'rejected', 'in_review']);
  if (data.status === 'rejected') pm.expect(data.reason).to.be.a('string');
});
save('nationalIdStatus', data.status);`,
  }),
  tc('TC-NEG-DOC-NATIONAL-ID-012', 'Reusar las mismas subidas', {
    method: 'POST',
    path: '/v1/me/documents/national-id',
    auth: 'A',
    body: { frontUploadId: '{{uploadFrontId}}', backUploadId: '{{uploadBackId}}' },
    requirement: 'COPAYNI-47 · cada subida se usa una vez',
    tests: `expectError(422, 'UPLOAD_NOT_USABLE');`,
  }),
  requestUpload(
    'TC-FUNC-DOC-UPLOAD-013',
    'Pide subir el comprobante (PDF)',
    'proof_of_income',
    'application/pdf',
    'uploadIncome',
    'COPAYNI-48',
  ),
  putUpload(
    'TC-INTEGRATION-DOC-PUT-014',
    'Sube el comprobante a S3',
    'uploadIncomeUrl',
    'application/pdf',
    'COPAYNI-43',
  ),
  tc('TC-NEG-DOC-INCOME-015', 'Ingreso igual a 0 (límite)', {
    method: 'POST',
    path: '/v1/me/documents/proof-of-income',
    auth: 'A',
    body: { kind: 'hr_letter', monthlyIncome: 0, uploadIds: ['{{uploadIncomeId}}'] },
    requirement: 'COPAYNI-48 · BVA',
    tests: `expectError(400, 'VALIDATION_ERROR');`,
  }),
  tc('TC-NEG-DOC-INCOME-016', 'Tipo de comprobante desconocido', {
    method: 'POST',
    path: '/v1/me/documents/proof-of-income',
    auth: 'A',
    body: { kind: 'payslip', monthlyIncome: 350000, uploadIds: ['{{uploadIncomeId}}'] },
    requirement: 'COPAYNI-48',
    tests: `expectError(400, 'VALIDATION_ERROR');`,
  }),
  tc('TC-NEG-DOC-INCOME-017', 'Once páginas (límite 1–10 + 1)', {
    method: 'POST',
    path: '/v1/me/documents/proof-of-income',
    auth: 'A',
    body: '{ "kind": "hr_letter", "monthlyIncome": 350000, "uploadIds": {{elevenUploadIds}} }',
    requirement: 'COPAYNI-48 · BVA',
    prerequest: `const ids = Array.from({ length: 11 }, (_, i) => '00000000-0000-4000-8000-0000000000' + String(i).padStart(2, '0'));
pm.collectionVariables.set('elevenUploadIds', JSON.stringify(ids));`,
    tests: `expectError(400, 'VALIDATION_ERROR');`,
  }),
  tc('TC-FUNC-DOC-INCOME-018', 'Envía el comprobante de ingresos', {
    method: 'POST',
    path: '/v1/me/documents/proof-of-income',
    auth: 'A',
    body: { kind: 'hr_letter', monthlyIncome: 350000, uploadIds: ['{{uploadIncomeId}}'] },
    requirement: 'COPAYNI-48',
    tests: `expectStatus(200);
pm.test('Comprobante con el ingreso declarado', () => {
  pm.expect(data.type).to.eql('proof_of_income');
  pm.expect(data.kind).to.eql('hr_letter');
  pm.expect(data.monthlyIncome.amount).to.eql(350000);
  pm.expect(data.status).to.be.oneOf(['approved', 'rejected', 'in_review']);
});
save('incomeStatus', data.status);`,
  }),
  tc('TC-FUNC-DOC-LIST-019', 'Mis documentos reflejan los envíos', {
    method: 'GET',
    path: '/v1/me/documents',
    auth: 'A',
    requirement: 'COPAYNI-46',
    tests: `expectStatus(200);
pm.test('Resumen con el último estado de cada tipo', () => {
  pm.expect(data.summary.national_id).to.eql(pm.collectionVariables.get('nationalIdStatus'));
  pm.expect(data.summary.proof_of_income).to.eql(pm.collectionVariables.get('incomeStatus'));
  pm.expect(data.items).to.have.length(2);
  pm.expect(data.items[0].type).to.eql('proof_of_income');
});`,
  }),
  tc('TC-DATA-USER-LIMIT-020', 'El ingreso aprobado fija el límite mensual (R5)', {
    method: 'GET',
    path: '/v1/me',
    auth: 'A',
    requirement: 'COPAYNI-44 · COPAYNI-48 · R5',
    tests: `expectStatus(200);
if (pm.collectionVariables.get('incomeStatus') === 'approved') {
  const bps = Number(pm.environment.get('ENV_PAYIN_LIMIT_INCOME_SHARE_BPS') || 3000);
  pm.test('monthlyPayInLimit = ingreso × ' + bps / 100 + ' %', () => {
    pm.expect(data.monthlyPayInLimit.amount).to.eql(Math.floor(350000 * bps / 10000));
  });
} else {
  pm.test('Ingreso no aprobado: límite sin cambio por ingreso', () => pm.expect(true).to.eql(true));
}`,
  }),
]);

// ─── 06-Referrals-Savings ───────────────────────────────────────────────────────────────────────

const growth = folder(
  '06-Referrals-Savings',
  'COPAYNI-32, 33, 51 a 53 (docs/api/referrals.md, savings.md).',
  [
    tc('TC-FUNC-REFERRAL-MINE-001', 'Mi código de invitación', {
      method: 'GET',
      path: '/v1/me/referral',
      auth: 'A',
      requirement: 'COPAYNI-51',
      tests: `expectStatus(200);
pm.test('Código de 8 caracteres sin 0 O 1 I L', () => pm.expect(data.code).to.match(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/));
pm.test('El enlace lleva el código', () => pm.expect(data.link).to.include(data.code));
pm.test('Beneficio en dinero', () => pm.expect(isMoney(data.reward)).to.eql(true));
save('referralCodeA', data.code);`,
    }),
    tc('TC-FUNC-REFERRAL-MINE-002', 'El código no cambia entre consultas', {
      method: 'GET',
      path: '/v1/me/referral',
      auth: 'A',
      requirement: 'COPAYNI-51',
      tests: `expectStatus(200);
pm.test('Mismo código', () => pm.expect(data.code).to.eql(pm.collectionVariables.get('referralCodeA')));`,
    }),
    tc('TC-NEG-REFERRAL-CLAIM-003', 'Usar el código propio', {
      method: 'POST',
      path: '/v1/me/referral/claim',
      auth: 'A',
      body: { code: '{{referralCodeA}}' },
      requirement: 'COPAYNI-51',
      tests: `expectError(422, 'OWN_REFERRAL_CODE');`,
    }),
    tc('TC-NEG-REFERRAL-CLAIM-004', 'Código con formato inválido', {
      method: 'POST',
      path: '/v1/me/referral/claim',
      auth: 'B',
      body: { code: 'abc' },
      requirement: 'COPAYNI-51',
      tests: `expectError(400, 'VALIDATION_ERROR');`,
    }),
    tc('TC-NEG-REFERRAL-CLAIM-005', 'Código inexistente', {
      method: 'POST',
      path: '/v1/me/referral/claim',
      auth: 'B',
      body: { code: 'ZZZZZZZZ' },
      requirement: 'COPAYNI-51',
      tests: `expectError(404, 'REFERRAL_CODE_NOT_FOUND');`,
    }),
    tc('TC-FUNC-REFERRAL-CLAIM-006', 'B usa el código de A (minúsculas y espacios)', {
      method: 'POST',
      path: '/v1/me/referral/claim',
      auth: 'B',
      body: { code: ' {{referralCodeLower}} ' },
      requirement: 'COPAYNI-51 · se ignoran mayúsculas y espacios',
      prerequest: `pm.collectionVariables.set('referralCodeLower', pm.collectionVariables.get('referralCodeA').toLowerCase());`,
      tests: `expectStatus(200);
pm.test('Devuelve el descuento', () => pm.expect(isMoney(data.reward)).to.eql(true));`,
    }),
    tc('TC-NEG-REFERRAL-CLAIM-007', 'B usa un código por segunda vez', {
      method: 'POST',
      path: '/v1/me/referral/claim',
      auth: 'B',
      body: { code: '{{referralCodeA}}' },
      requirement: 'COPAYNI-51 · una sola vez por usuario',
      tests: `expectError(409, 'REFERRAL_ALREADY_CLAIMED');`,
    }),
    tc('TC-FUNC-REFERRAL-MINE-008', 'Código de B', {
      method: 'GET',
      path: '/v1/me/referral',
      auth: 'B',
      requirement: 'COPAYNI-51',
      tests: `expectStatus(200);
save('referralCodeB', data.code);`,
    }),
    tc('TC-NEG-REFERRAL-CLAIM-009', 'A (ya en un círculo) usa el código de B', {
      method: 'POST',
      path: '/v1/me/referral/claim',
      auth: 'A',
      body: { code: '{{referralCodeB}}' },
      requirement: 'COPAYNI-51 · el beneficio es para el primer círculo',
      tests: `expectError(409, 'REFERRAL_NOT_ELIGIBLE');`,
    }),
    tc('TC-DATA-REFERRAL-LIST-010', 'Mis referidos: saldo coherente e invitado minimizado', {
      method: 'GET',
      path: '/v1/me/referrals?limit=20',
      auth: 'A',
      requirement: 'COPAYNI-52 · saldo = ganado − canjeado',
      tests: `expectStatus(200);
pm.test('balance = earned − redeemed, misma moneda', () => {
  pm.expect(data.balance.amount).to.eql(data.earned.amount - data.redeemed.amount);
  pm.expect(new Set([data.earned.currency, data.redeemed.currency, data.balance.currency]).size).to.eql(1);
});
pm.test('B aparece como registrado', () => {
  pm.expect(data.invitees).to.have.length(1);
  pm.expect(data.invitees[0].status).to.eql('registered');
});
pm.test('Datos personales minimizados (sin el email completo)', () => {
  pm.expect(data.invitees[0].displayName).not.to.eql(pm.collectionVariables.get('emailB'));
});`,
    }),
    tc('TC-NEG-REFERRAL-LIST-011', 'Mis referidos con limit 51', {
      method: 'GET',
      path: '/v1/me/referrals?limit=51',
      auth: 'A',
      requirement: 'COPAYNI-52 · BVA 1–50',
      tests: `expectError(400, 'VALIDATION_ERROR');`,
    }),
    tc('TC-CONTRACT-SAVING-PLANS-012', 'Planes de ahorro', {
      method: 'GET',
      path: '/v1/savings/plans',
      auth: 'A',
      requirement: 'COPAYNI-32',
      tests: `expectStatus(200);
pm.test('Planes del menor al mayor, con cashback máximo', () => {
  pm.expect(data.items).to.be.an('array').that.is.not.empty;
  let previous = 0;
  data.items.forEach((p) => {
    pm.expect(isMoney(p.target) && isMoney(p.maxCashback)).to.eql(true);
    pm.expect(p.target.amount).to.be.above(previous);
    previous = p.target.amount;
  });
  pm.expect(data.durations).to.be.an('array').that.is.not.empty;
});
save('savingPlanId', data.items[0].id);
save('savingMonths', data.durations[0]);`,
    }),
    tc('TC-DATA-SAVING-QUOTE-013', 'Cotización coherente', {
      method: 'GET',
      path: '/v1/savings/plans/{{savingPlanId}}/quote?months={{savingMonths}}',
      auth: 'A',
      requirement: 'COPAYNI-33',
      tests: `expectStatus(200);
pm.test('Una cuota por mes y suman el objetivo', () => {
  pm.expect(data.installments).to.have.length(data.months);
  pm.expect(data.installments.reduce((t, i) => t + i.amount, 0)).to.eql(data.target.amount);
});
pm.test('monthlyInstallment es la mayor cuota', () => pm.expect(data.monthlyInstallment.amount).to.eql(Math.max(...data.installments.map((i) => i.amount))));
pm.test('total = objetivo + cashback', () => pm.expect(data.total.amount).to.eql(data.target.amount + data.cashback.amount));
pm.test('El payout es posterior al inicio', () => pm.expect(data.payoutPeriod > data.startsOn).to.eql(true));`,
    }),
    tc('TC-NEG-SAVING-QUOTE-014', 'Duración no ofrecida', {
      method: 'GET',
      path: '/v1/savings/plans/{{savingPlanId}}/quote?months=7',
      auth: 'A',
      requirement: 'COPAYNI-33',
      tests: `expectError(400, 'VALIDATION_ERROR');`,
    }),
    tc('TC-NEG-SAVING-QUOTE-015', 'Plan inexistente', {
      method: 'GET',
      path: '/v1/savings/plans/plan-inexistente/quote?months={{savingMonths}}',
      auth: 'A',
      requirement: 'COPAYNI-33',
      tests: `expectError(404, 'SAVING_PLAN_NOT_FOUND');`,
    }),
  ],
);

// ─── 07-Security ────────────────────────────────────────────────────────────────────────────────

const protectedRoute = (n, path) =>
  tc(`TC-SEC-AUTHN-PROTECTED-0${n}`, `${path} exige token`, {
    method: 'GET',
    path,
    auth: 'none',
    prd: 'safe',
    requirement: 'COPAYNI-21 · OWASP API2',
    tests: `expectError(401, 'UNAUTHORIZED');`,
  });

const security = folder(
  '07-Security',
  'Autenticación, autorización (BOLA/BFLA), exposición de datos y cabeceras. Solo en ambientes autorizados.',
  [
    protectedRoute(10, '/v1/circles/join-config'),
    protectedRoute(11, '/v1/me/circles?status=active'),
    protectedRoute(12, '/v1/me/cards'),
    protectedRoute(13, '/v1/me/documents'),
    protectedRoute(14, '/v1/me/referrals'),
    protectedRoute(15, '/v1/savings/plans'),
    tc('TC-SEC-AUTHZ-ADMIN-001', 'API de administración sin credenciales', {
      method: 'POST',
      path: `/admin/v1/circles/${UUID_ZERO}/pause`,
      auth: 'none',
      prd: 'safe',
      requirement: 'COPAYNI-61',
      tests: `expectError(401, 'UNAUTHORIZED');`,
    }),
    tc('TC-SEC-AUTHZ-ADMIN-002', 'Un usuario de la app no administra (BFLA)', {
      method: 'POST',
      path: `/admin/v1/circles/${UUID_ZERO}/pause`,
      auth: 'A',
      requirement: 'COPAYNI-61 · OWASP API5',
      tests: `pm.test('401 o 403', () => pm.expect(pm.response.code).to.be.oneOf([401, 403]));`,
    }),
    tc('TC-SEC-WEBHOOK-003', 'Webhook de Mercado Pago sin firma', {
      method: 'POST',
      path: '/v1/webhooks/mercadopago',
      auth: 'none',
      body: { type: 'payment', data: { id: '123' } },
      prd: 'safe',
      requirement: 'COPAYNI-63 · x-signature',
      tests: `pm.test('HTTP 401', () => pm.response.to.have.status(401));`,
    }),
    tc('TC-SEC-HEADERS-004', 'No revela la tecnología del servidor', {
      method: 'GET',
      path: '/health/live',
      auth: 'none',
      prd: 'safe',
      requirement: 'OWASP API8 · security headers',
      tests: `pm.test('Sin cabecera X-Powered-By', () => pm.expect(pm.response.headers.has('X-Powered-By')).to.eql(false));`,
    }),
    tc('TC-SEC-ERROR-005', 'Ruta inexistente: 404 con el sobre estándar', {
      method: 'GET',
      path: '/v1/no-existe',
      auth: 'none',
      prd: 'safe',
      requirement: 'COPAYNI-8 · contrato de errores',
      tests: `pm.test('HTTP 404', () => pm.response.to.have.status(404));
pm.test('success = false', () => pm.expect(body.success).to.eql(false));`,
    }),
    tc('TC-SEC-DATA-006', 'Las tarjetas guardadas no exponen datos sensibles', {
      method: 'GET',
      path: '/v1/me/cards',
      auth: 'A',
      requirement: 'COPAYNI-39 · PCI-DSS (COPAYNI-34)',
      tests: `expectStatus(200);
pm.test('Sin número completo, CVC ni token', () => {
  const text = JSON.stringify(data);
  pm.expect(text).not.to.match(/\\d{13,19}/);
  pm.expect(text.toLowerCase()).not.to.match(/cvc|cvv|securitycode|"token"/);
});`,
    }),
    tc('TC-SEC-DATA-007', 'El perfil de otro usuario no es accesible por id', {
      method: 'GET',
      path: '/v1/me',
      auth: 'B',
      requirement: 'COPAYNI-44 · OWASP API1',
      description: '/v1/me siempre responde el usuario del token: B nunca ve a A.',
      tests: `expectStatus(200);
pm.test('Responde el usuario B, no el A', () => {
  pm.expect(data.id).not.to.eql(pm.collectionVariables.get('userIdA'));
  pm.expect(data.email).to.eql(pm.collectionVariables.get('emailB'));
});`,
    }),
  ],
);

// ─── 08-Regression ──────────────────────────────────────────────────────────────────────────────

const smoke = (id, title, path, requirement, extra = '') =>
  tc(id, title, {
    method: 'GET',
    path,
    auth: 'A',
    prd: 'auth',
    requirement,
    tests: `expectStatus(200);${extra}`,
  });

const flowUser = 'C';
const regression = folder('08-Regression', 'Smoke (lectura) y flujo crítico de punta a punta.', [
  folder('Smoke', 'Solo lectura. En prd corre con ENV_PRD_ACCESS_TOKEN.', [
    smoke('TC-REGRESSION-SMOKE-001', 'Perfil', '/v1/me', 'COPAYNI-44'),
    smoke(
      'TC-REGRESSION-SMOKE-002',
      'Configuración de unión',
      '/v1/circles/join-config',
      'COPAYNI-28',
    ),
    smoke('TC-REGRESSION-SMOKE-003', 'Mis círculos', '/v1/me/circles?status=active', 'COPAYNI-26'),
    smoke('TC-REGRESSION-SMOKE-004', 'Resumen de pagos', '/v1/me/payments/summary', 'COPAYNI-35'),
    smoke('TC-REGRESSION-SMOKE-005', 'Mis documentos', '/v1/me/documents', 'COPAYNI-46'),
    smoke('TC-REGRESSION-SMOKE-006', 'Planes de ahorro', '/v1/savings/plans', 'COPAYNI-32'),
  ]),
  folder(
    'Critical-Flows',
    'Usuario nuevo de punta a punta: registro → elige monto, cuota y turno → método de cobro → se une → lo ve en Mis círculos.',
    [
      ...authSetup(flowUser).map((item, n) => ({
        ...item,
        name: item.name.replace(
          `TC-FUNC-AUTH-SETUP-${flowUser}0${n + 1}`,
          `TC-REGRESSION-JOIN-00${n + 1}`,
        ),
      })),
      tc('TC-REGRESSION-JOIN-003', 'Configuración de unión', {
        method: 'GET',
        path: '/v1/circles/join-config',
        auth: flowUser,
        requirement: 'COPAYNI-28',
        tests: `expectStatus(200);
const steps = Math.floor((data.payout.max.amount - data.payout.min.amount) / data.payout.step.amount);
save('flowPayout', data.payout.min.amount + Math.floor(steps / 2) * data.payout.step.amount);`,
      }),
      tc('TC-REGRESSION-JOIN-004', 'Cuotas del monto elegido', {
        method: 'GET',
        path: '/v1/circles/installment-options?payoutAmount={{flowPayout}}',
        auth: flowUser,
        requirement: 'COPAYNI-29',
        tests: `expectStatus(200);
pm.test('Hay al menos una duración', () => pm.expect(data.options).to.not.be.empty);
save('flowMonths', data.options[data.options.length - 1].months);`,
      }),
      tc('TC-REGRESSION-JOIN-005', 'Turnos disponibles', {
        method: 'GET',
        path: '/v1/circles/slots?payoutAmount={{flowPayout}}&months={{flowMonths}}',
        auth: flowUser,
        requirement: 'COPAYNI-30',
        tests: `expectStatus(200);
const pick = data.slots.find((s) => s.allowed && s.available);
pm.test('Hay un turno elegible', () => pm.expect(pick).to.be.an('object'));
save('flowCircleOffered', data.circleId === null ? 'null' : JSON.stringify(data.circleId));
save('flowPosition', pick.position);`,
      }),
      tc('TC-REGRESSION-JOIN-006', 'Sin método de cobro no puede unirse', {
        method: 'POST',
        path: '/v1/circles/join',
        auth: flowUser,
        idempotencyKey: 'qa-{{testRunId}}-flow-join-no-method',
        body: '{ "circleId": {{flowCircleOffered}}, "payoutAmount": {{flowPayout}}, "months": {{flowMonths}}, "position": {{flowPosition}} }',
        requirement: 'COPAYNI-31 · COPAYNI-37',
        tests: `expectError(422, 'PAYOUT_METHOD_REQUIRED');`,
      }),
      tc('TC-REGRESSION-JOIN-007', 'Elige el método de cobro', {
        method: 'PUT',
        path: '/v1/me/payout-method',
        auth: flowUser,
        body: { method: 'digital_wallet' },
        requirement: 'COPAYNI-37',
        tests: `expectStatus(200);`,
      }),
      tc('TC-REGRESSION-JOIN-008', 'Confirma la unión', {
        method: 'POST',
        path: '/v1/circles/join',
        auth: flowUser,
        idempotencyKey: 'qa-{{testRunId}}-flow-join',
        body: '{ "circleId": {{flowCircleOffered}}, "payoutAmount": {{flowPayout}}, "months": {{flowMonths}}, "position": {{flowPosition}} }',
        requirement: 'COPAYNI-31',
        tests: `expectStatus(201);
pm.test('Cronograma confirmado', () => pm.expect(data.installments).to.have.length(Number(pm.collectionVariables.get('flowMonths'))));
save('flowCircleId', data.circleId);`,
      }),
      tc('TC-REGRESSION-JOIN-009', 'Lo ve en Mis círculos', {
        method: 'GET',
        path: '/v1/me/circles?status=active',
        auth: flowUser,
        requirement: 'COPAYNI-26',
        tests: `expectStatus(200);
pm.test('El círculo aparece', () => pm.expect(data.items.map((c) => c.circleId || c.id)).to.include(pm.collectionVariables.get('flowCircleId')));`,
      }),
      tc('TC-REGRESSION-JOIN-010', 'Su elegibilidad muestra el método de cobro', {
        method: 'GET',
        path: '/v1/me/payout-eligibility',
        auth: flowUser,
        requirement: 'COPAYNI-36',
        tests: `expectStatus(200);
pm.test('payout_method: met', () => pm.expect(data.requirements.find((r) => r.requirement === 'payout_method').status).to.eql('met'));`,
      }),
    ],
  ),
]);

// ─── 09-Operational ─────────────────────────────────────────────────────────────────────────────

const operational = folder('09-Operational', 'Health, readiness y observabilidad (COPAYNI-10).', [
  tc('TC-OPS-HEALTH-READY-002', 'Readiness responde ok', {
    method: 'GET',
    path: '/health/ready',
    auth: 'none',
    prd: 'safe',
    requirement: 'COPAYNI-10',
    tests: `expectStatus(200);
pm.test('Sin versiones ni dependencias en la respuesta', () => pm.expect(Object.keys(data)).to.eql(['status']));`,
  }),
  tc('TC-OPS-HEALTH-NOAUTH-003', 'Health no exige autenticación aunque llegue un token inválido', {
    method: 'GET',
    path: '/health/live',
    auth: 'raw:Bearer token-invalido',
    prd: 'safe',
    requirement: 'COPAYNI-10',
    tests: `expectStatus(200);`,
  }),
  tc('TC-OPS-TRACE-004', 'Cada respuesta trae un traceId distinto', {
    method: 'GET',
    path: '/health/live',
    auth: 'none',
    prd: 'safe',
    requirement: 'COPAYNI-10 · correlación por traceId',
    prerequest: `pm.sendRequest(pm.environment.get('baseUrl') + '/health/live', (err, res) => {
  pm.collectionVariables.set('previousTraceId', res ? res.json().traceId : '');
});`,
    tests: `expectStatus(200);
pm.test('traceId nuevo por petición', () => pm.expect(body.traceId).not.to.eql(pm.collectionVariables.get('previousTraceId')));`,
  }),
]);

// ─── Ensamblado ─────────────────────────────────────────────────────────────────────────────────

const items = [
  framework,
  authentication,
  users,
  circles,
  payments,
  documents,
  growth,
  security,
  regression,
  operational,
];

const RUNTIME_VARIABLES = [
  'testRunId',
  'emailA',
  'emailB',
  'emailC',
  'emailD',
  'emailR',
  'emailNewA',
  'phoneP',
  'challengeA',
  'challengeB',
  'challengeC',
  'challengeD',
  'challengeP',
  'challengeTaken',
  'challengeContact',
  'tokenA',
  'tokenB',
  'tokenC',
  'tokenP',
  'refreshA',
  'refreshB',
  'refreshC',
  'refreshP',
  'refreshPOld',
  'tokenATampered',
  'userIdA',
  'payoutMin',
  'payoutMax',
  'payoutStep',
  'payoutValid',
  'payoutOffStep',
  'payoutAboveMax',
  'months',
  'circleIdOffered',
  'circleId',
  'position',
  'positionOther',
  'positionNotAllowed',
  'positionOutOfRange',
  'cardId1',
  'cardId2',
  'uploadFrontId',
  'uploadFrontUrl',
  'uploadBackId',
  'uploadBackUrl',
  'uploadIncomeId',
  'uploadIncomeUrl',
  'elevenUploadIds',
  'nationalIdStatus',
  'incomeStatus',
  'referralCodeA',
  'referralCodeB',
  'referralCodeLower',
  'savingPlanId',
  'savingMonths',
  'flowPayout',
  'flowMonths',
  'flowCircleOffered',
  'flowPosition',
  'flowCircleId',
  'previousTraceId',
];

const collection = {
  info: {
    // Fijo: la colección generada tiene que ser reproducible (CI compara el build con el versionado).
    _postman_id: '3f6b2c1e-8a4d-4f2b-9c7e-5d1a0b9e4c21',
    name: 'Ayni API · QA Enterprise',
    description: [
      'Colección de Quality Engineering de la API de Ayni, según la Base Técnica QA Senior Enterprise.',
      '',
      '- **Convención:** `TC-<TYPE>-<DOMAIN>-<FEATURE>-<NNN>` con el requisito de Jira en cada request (docs/traceability-matrix.md).',
      '- **Ambientes:** `dev` corre todo y crea datos aislados por `testRunId`; `prd` solo corre lo marcado como seguro (no crea datos).',
      '- **Generada** por `qa/api/scripts/build-collection.mjs`: no editar el JSON a mano.',
    ].join('\n'),
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  event: [
    {
      listen: 'prerequest',
      script: { type: 'text/javascript', exec: collectionPrerequest().trim().split('\n') },
    },
    {
      listen: 'test',
      script: { type: 'text/javascript', exec: collectionTests().trim().split('\n') },
    },
  ],
  variable: [
    { key: 'PRD_SAFE_TESTS', value: PRD_SAFE.join(','), type: 'string' },
    { key: 'PRD_AUTH_TESTS', value: PRD_AUTH.join(','), type: 'string' },
    ...RUNTIME_VARIABLES.map((key) => ({ key, value: '', type: 'string' })),
  ],
  item: items,
};

const out = join(root, 'collections', 'ayni-api.postman_collection.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(collection, null, 2) + '\n');

// Inventario para la matriz de trazabilidad.
const rows = [];
const walk = (nodes, path) =>
  nodes.forEach((node) => {
    if (node.item) return walk(node.item, [...path, node.name]);
    const [id, title] = node.name.split(' · ');
    const requirement =
      (node.request.description.match(/\*\*Requisito:\*\* ([^\n]+)/) || [])[1] || '';
    const prd = PRD_AUTH.includes(id) ? 'con token' : PRD_SAFE.includes(id) ? 'sí' : 'no';
    const rawUrl = typeof node.request.url === 'string' ? node.request.url : node.request.url.raw;
    rows.push(
      `| ${id} | ${path.join(' / ')} | ${title} | ${node.request.method} ${rawUrl.replace('{{baseUrl}}', '')} | ${requirement} | ${prd} |`,
    );
  });
walk(items, []);
writeFileSync(
  join(root, 'docs', 'traceability-matrix.md'),
  [
    '# Matriz de trazabilidad',
    '',
    'Generada por `npm run build` desde la colección: requisito de Jira → caso de prueba → request. La columna **prd** indica si el caso corre en producción.',
    '',
    '| Caso | Carpeta | Descripción | Request | Requisito | prd |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n'),
);
console.log(`Colección generada: ${rows.length} casos (${PRD_SAFE.length} seguros en prd).`);
