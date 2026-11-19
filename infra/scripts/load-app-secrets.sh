#!/usr/bin/env bash
#
# Carga los valores de los secretos de la API en Secrets Manager (COPAYNI-12).
#
# Terraform crea los secretos vacíos y nunca ve su contenido: así las claves no quedan escritas en
# el estado. Este script los genera con el formato que exige la API y los sube.
#
# Es idempotente y conservador: por omisión no pisa una clave que ya tenga valor, porque rotar la
# clave del JWT invalida todas las sesiones y rotar la de cifrado deja ilegibles los datos ya
# guardados. Para rotar a propósito, --rotate seguido de las claves a regenerar.
#
#   ./load-app-secrets.sh --env prd
#   ./load-app-secrets.sh --env prd --rotate db_app_password
#
# Comprueba sus condiciones antes de escribir: herramientas, sesión de AWS, cuenta correcta y
# existencia de los secretos. Si algo falta, dice qué hacer y no escribe nada.
#
# Depende de bash, openssl, el AWS CLI y node, que ya es obligatorio para el monorepo. No usa jq,
# para no pedir una herramienta que no está en las máquinas del equipo.
#
# No carga la license key de New Relic: ese secreto pertenece al stack account, tiene otro ciclo de
# vida y el README documenta su carga. Para rotarla, sin dejar el valor en el historial:
#   aws secretsmanager put-secret-value --secret-id ayni-<env>/newrelic/license-key \
#     --secret-string file://<archivo con {"api_key": "..."}>
#
set -euo pipefail

ENVIRONMENT="prd"
ROTATE=""
REGION="${AWS_REGION:-us-east-1}"
PROFILE="${AWS_PROFILE:-}"

# Las únicas claves que --rotate admite. Un nombre mal escrito tiene que ser un error: si se
# ignorara en silencio, el script diría "ya tiene valor, no se toca" y uno creería haber rotado.
ROTATABLE="jwt_private_key otp_pepper field_encryption_key db_app_password"

die() {
  echo "Error: $*" >&2
  exit 1
}

usage() {
  cat >&2 <<'EOF'
Uso: load-app-secrets.sh [--env <ambiente>] [--rotate <claves>] [--region <región>] [--profile <perfil>]

  --env      Ambiente (por omisión: prd). Determina el prefijo ayni-<env>/ de los secretos.
  --rotate   Claves a regenerar, separadas por coma, o "all". Por omisión no se rota nada.
             Admite: jwt_private_key, otp_pepper, field_encryption_key, db_app_password.
  --region   Región de Secrets Manager (por omisión: $AWS_REGION o us-east-1).
  --profile  Perfil de AWS (por omisión: $AWS_PROFILE).
EOF
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) [[ $# -ge 2 ]] || usage; ENVIRONMENT="$2"; shift 2 ;;
    --rotate) [[ $# -ge 2 ]] || usage; ROTATE="$2"; shift 2 ;;
    --region) [[ $# -ge 2 ]] || usage; REGION="$2"; shift 2 ;;
    --profile) [[ $# -ge 2 ]] || usage; PROFILE="$2"; shift 2 ;;
    -h | --help) usage ;;
    *) echo "Opción desconocida: $1" >&2; usage ;;
  esac
done

[[ "$ENVIRONMENT" =~ ^[a-z][a-z0-9]{1,15}$ ]] ||
  die "--env inválido: '$ENVIRONMENT'. Son minúsculas y dígitos, como dev o prd."

if [[ "$ROTATE" == "all" ]]; then
  ROTATE="${ROTATABLE// /,}"
fi

# Se valida antes de tocar nada: un --rotate con una errata no debe parecer una corrida normal.
IFS=',' read -ra requested <<<"$ROTATE"
for key in "${requested[@]}"; do
  [[ -z "$key" ]] && continue
  [[ " $ROTATABLE " == *" $key "* ]] ||
    die "--rotate no admite '$key'. Las claves son: ${ROTATABLE// /, }, o 'all'."
done

NAME="ayni-${ENVIRONMENT}"
API_SECRET="${NAME}/api/secrets"
DB_SECRET="${NAME}/db/app"

for tool in aws openssl node; do
  command -v "$tool" >/dev/null || die "falta $tool"
done

# Toda llamada lleva región y perfil explícitos: si el perfil activo no tiene región configurada,
# el AWS CLI falla, y si tiene otra, buscaría los secretos donde no están.
aws_args=(--region "$REGION")
[[ -n "$PROFILE" ]] && aws_args+=(--profile "$PROFILE")
aws_() { aws "${aws_args[@]}" "$@"; }

STACK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../terraform/live/${ENVIRONMENT}/us-east-1/api" 2>/dev/null && pwd || true)"

# Un valor declarado en el tfvars del ambiente, o el default de su variable en Terraform. Así el
# script no mantiene su propia copia de un valor que ya vive en la configuración.
from_terraform() {
  local key="$1" value=""
  if [[ -n "$STACK_DIR" && -f "$STACK_DIR/terraform.tfvars" ]]; then
    value="$(sed -n "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*\"\([^\"]*\)\".*/\1/p" \
      "$STACK_DIR/terraform.tfvars" | head -1)"
  fi
  if [[ -z "$value" && -n "$STACK_DIR" && -f "$STACK_DIR/variables.tf" ]]; then
    value="$(awk -v k="$key" '
      $0 ~ "^variable[[:space:]]+\""k"\"" { inside = 1; next }
      inside && /^}/ { exit }
      inside && /^[[:space:]]*default[[:space:]]*=/ {
        if (match($0, /"[^"]*"/)) { print substr($0, RSTART + 1, RLENGTH - 2); exit }
      }' "$STACK_DIR/variables.tf")"
  fi
  printf '%s' "$value"
}

# El runner de migraciones crea el rol con el nombre que diga Terraform; la API se conecta con el
# que quede en el secreto. Si no fueran el mismo, la API no podría entrar a la base.
DB_APP_USERNAME="${DB_APP_USERNAME:-$(from_terraform database_app_username)}"
DB_APP_USERNAME="${DB_APP_USERNAME:-ayni_app}"
[[ "$DB_APP_USERNAME" =~ ^[a-z_][a-z0-9_]{2,62}$ ]] ||
  die "DB_APP_USERNAME inválido: '$DB_APP_USERNAME'. Debe ser un identificador PostgreSQL en minúsculas."

# --- Comprobaciones previas ---------------------------------------------------------------------

account="$(aws_ sts get-caller-identity --query Account --output text 2>&1)" || {
  echo "$account" >&2
  die "no hay sesión de AWS válida. Si usas Identity Center: aws sso login --profile <perfil>"
}

expected="$(from_terraform aws_account_id)"
if [[ -n "$expected" && "$account" != "$expected" ]]; then
  die "cuenta equivocada: la sesión está en $account y ${ENVIRONMENT} es $expected.
       Exporta el perfil correcto (AWS_PROFILE) o pasa --profile."
fi

# ¿Existe el contenedor? Lo crea Terraform, y sin él put-secret-value daría un error sin pistas.
secret_exists() {
  local output
  if output="$(aws_ secretsmanager describe-secret --secret-id "$1" 2>&1)"; then
    return 0
  fi
  [[ "$output" == *ResourceNotFoundException* ]] && return 1
  echo "$output" >&2
  die "no se pudo consultar $1."
}

missing=()
for secret in "$API_SECRET" "$DB_SECRET"; do
  secret_exists "$secret" || missing+=("$secret")
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "No existen estos secretos: ${missing[*]}" >&2
  cat >&2 <<EOF

Los crea Terraform, no este script. En ${STACK_DIR:-el stack api de ${ENVIRONMENT}}:

  terraform init -backend-config=backend.hcl
  terraform apply -target=aws_secretsmanager_secret.api \\
                  -target=aws_secretsmanager_secret.database_app_user

Si new_relic.enabled = true, ese apply también necesita la User API key exportada,
porque Terraform configura todos los providers aunque se use -target:

  read -rsp "User API key de New Relic: " TF_VAR_new_relic_api_key; echo
  export TF_VAR_new_relic_api_key

Después vuelve a correr este script.
EOF
  exit 1
fi

# --- Utilidades ---------------------------------------------------------------------------------

# Ningún valor va en la línea de comandos ni en una variable de entorno: quedaría en el historial y
# en la lista de procesos. Van a archivos que solo puede leer quien ejecuta el script, y node los
# lee de ahí para armar el JSON. El directorio se borra al terminar, también si el script falla.
umask 077
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
mkdir -p "$WORKDIR/api" "$WORKDIR/db"

# El AWS CLI de Windows no entiende las rutas de Git Bash (/tmp/...): file:// necesita la nativa.
native_path() {
  if command -v cygpath >/dev/null; then
    cygpath -w "$1"
  else
    printf '%s' "$1"
  fi
}

put_secret() {
  local secret="$1" payload_file="$2"
  aws_ secretsmanager put-secret-value --secret-id "$secret" \
    --secret-string "file://$(native_path "$payload_file")" >/dev/null
}

# ¿Tiene esa clave un valor no vacío dentro del JSON del archivo? Un archivo ausente, vacío o con
# contenido que no sea un objeto JSON cuenta como "no la tiene".
json_has_key() {
  node -e '
    const fs = require("fs");
    const [file, key] = process.argv.slice(1);
    let data;
    try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch { process.exit(1); }
    if (data === null || typeof data !== "object" || Array.isArray(data)) process.exit(1);
    const value = data[key];
    process.exit(typeof value === "string" && value.length > 0 ? 0 : 1);
  ' "$1" "$2"
}

# Combina el JSON actual con los valores de <dir>/val.<clave> y escribe el resultado. Parte del
# valor actual para no borrar las claves que no se regeneran.
json_merge() {
  node -e '
    const fs = require("fs"), path = require("path");
    const [base, dir, out] = process.argv.slice(1);
    let data = {};
    if (fs.existsSync(base) && fs.readFileSync(base, "utf8").trim() !== "") {
      data = JSON.parse(fs.readFileSync(base, "utf8"));
      if (data === null || typeof data !== "object" || Array.isArray(data)) {
        console.error("el secreto actual no es un objeto JSON: revísalo a mano");
        process.exit(1);
      }
    }
    for (const file of fs.readdirSync(dir).filter((f) => f.startsWith("val."))) {
      data[file.slice(4)] = fs.readFileSync(path.join(dir, file), "utf8");
    }
    fs.writeFileSync(out, JSON.stringify(data));
  ' "$1" "$2" "$3"
}

# Deja en <destino> el JSON actual del secreto, o un archivo vacío si todavía no tiene versiones.
#
# Distinguir "no tiene valor" de "no pude leerlo" es lo que hace seguro a este script. Si un fallo
# de lectura (token vencido, permisos, throttling) se tomara por "no tiene valor", regeneraría la
# clave de cifrado y los datos ya guardados quedarían ilegibles. Ante cualquier otro error, aborta.
read_secret_into() {
  local secret="$1" destination="$2" output
  : > "$destination"
  if output="$(aws_ secretsmanager get-secret-value --secret-id "$secret" \
    --query SecretString --output text 2>&1)"; then
    printf '%s' "$output" > "$destination"
    return 0
  fi
  # Un secreto sin versiones responde igual que uno inexistente; que el contenedor existe ya se
  # comprobó arriba, así que aquí solo puede significar que está vacío.
  [[ "$output" == *ResourceNotFoundException* ]] && return 0
  echo "$output" >&2
  die "no se pudo leer $secret. No se escribe nada: un fallo de lectura no es prueba de que el
       secreto esté vacío, y regenerar una clave existente es destructivo."
}

wants_rotation() {
  [[ ",${ROTATE}," == *",$1,"* ]]
}

# Clave privada P-256 para firmar los access tokens con ES256.
new_jwt_key() {
  openssl ecparam -name prime256v1 -genkey -noout
}

# 32 bytes aleatorios: pepper del HMAC de los OTP y clave AES-256 del cifrado de campos.
new_random_base64() {
  openssl rand -base64 32
}

echo "Secretos de ${NAME} en la cuenta ${account}, región ${REGION}"

# --- Claves de la API ---------------------------------------------------------------------------
read_secret_into "$API_SECRET" "$WORKDIR/api.current"

generated=0
for key in jwt_private_key otp_pepper field_encryption_key; do
  if json_has_key "$WORKDIR/api.current" "$key" && ! wants_rotation "$key"; then
    echo "  $key: ya tiene valor, no se toca"
    continue
  fi
  # printf es un builtin de bash: el valor no aparece en la lista de procesos.
  case "$key" in
    jwt_private_key) printf '%s' "$(new_jwt_key)" > "$WORKDIR/api/val.$key" ;;
    *) printf '%s' "$(new_random_base64)" > "$WORKDIR/api/val.$key" ;;
  esac
  generated=$((generated + 1))
  echo "  $key: generado"
done

if [[ $generated -gt 0 ]]; then
  json_merge "$WORKDIR/api.current" "$WORKDIR/api" "$WORKDIR/api.json"
  put_secret "$API_SECRET" "$WORKDIR/api.json"
  echo "  cargado en $API_SECRET"
fi

# --- Usuario de aplicación de la base -----------------------------------------------------------
# La contraseña no se usa aquí: la aplica el runner de migraciones en el siguiente despliegue.
read_secret_into "$DB_SECRET" "$WORKDIR/db.current"

if json_has_key "$WORKDIR/db.current" "password" && ! wants_rotation "db_app_password"; then
  echo "  db_app_password: ya tiene valor, no se toca"
else
  # Sin caracteres que compliquen el quoting en psql o en las URL de conexión.
  printf '%s' "$DB_APP_USERNAME" > "$WORKDIR/db/val.username"
  printf '%s' "$(openssl rand -base64 48 | tr -d '/+=' | cut -c1-40)" > "$WORKDIR/db/val.password"
  json_merge "$WORKDIR/db.current" "$WORKDIR/db" "$WORKDIR/db.json"
  put_secret "$DB_SECRET" "$WORKDIR/db.json"
  echo "  db_app_password: generado y cargado en $DB_SECRET (usuario ${DB_APP_USERNAME})"
  echo "  (la contraseña se aplica en la base en el próximo despliegue, al correr las migraciones)"
fi

echo "Listo. Ningún valor se imprimió por pantalla ni quedó en el estado de Terraform."
