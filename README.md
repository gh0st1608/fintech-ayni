# fintech-ayni

Ayni: app de ahorro colaborativo (ROSCA / Game'ya). Monorepo con paquetes npm independientes.

| Paquete | Stack | Documentación |
| --- | --- | --- |
| [apps/mobile](apps/mobile) | React Native + Expo, arquitectura hexagonal | [README](apps/mobile/README.md) |
| [apps/backend](apps/backend) | NestJS + TypeScript, arquitectura hexagonal | [README](apps/backend/README.md) |
| [infra/terraform](infra/terraform) | Terraform: dev con el emulador floci, prd en AWS | [README](infra/terraform/README.md) |

Contratos de API: [docs/api](docs/api). Contexto de producto y backlog: [docs](docs).

## Calidad y CI (COPAYNI-9)

Después de clonar, instala las herramientas del repositorio y las de cada app:

```bash
npm install                  # activa los hooks de git (Husky)
(cd apps/backend && npm install)
(cd apps/mobile && npm install)
```

### Hooks locales

- **pre-commit** (lint-staged): ESLint y Prettier solo sobre los archivos en stage, con la configuración de cada app (`apps/*/.lintstagedrc.mjs`).
- **commit-msg** (commitlint): exige [Conventional Commits](https://www.conventionalcommits.org/es/).
  - Formato: `tipo(ámbito): descripción`.
  - Ámbitos: `mobile`, `backend`, `ci`, `deps`, `docs`, `infra`. El ámbito es opcional.
  - Ejemplo: `feat(backend): crear el módulo de pagos (COPAYNI-40)`.

### Pipeline ([.github/workflows/ci.yml](.github/workflows/ci.yml))

Corre en cada pull request y en cada push a `main`.

| Check | Qué valida |
| --- | --- |
| `commitlint` | Convención de todos los commits del PR. |
| `secrets` | gitleaks sobre todo el historial (`--redact`: el log no muestra los valores). |
| `backend` | lint (con límites entre capas), typecheck, formato, pruebas unitarias, de integración y e2e con cobertura ≥ 90%, build y vulnerabilidades. |
| `mobile` | `npm run validate`, `expo-doctor`, `expo install --check`, `expo export` (Android e iOS) y vulnerabilidades. |
| `infra` | Terraform: formato, `validate`, `terraform test`, tflint, checkov y build de la imagen de la API. |

- Los reportes de cobertura quedan como artefactos del pipeline durante 14 días.
- **Vulnerabilidades:** [scripts/check-audit.mjs](scripts/check-audit.mjs) falla ante cualquier vulnerabilidad alta o crítica que no esté en el `audit-allowlist.json` de la app. Cada excepción lleva su motivo y su fecha de vencimiento; al vencer, el check vuelve a fallar.
- **Seguridad del pipeline:** las actions están fijadas por SHA y los permisos son de solo lectura.
