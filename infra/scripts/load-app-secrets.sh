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
set -euo pipefail

ENVIRONMENT="prd"
ROTATE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env) ENVIRONMENT="$2"; shift 2 ;;
    --rotate) ROTATE="$2"; shift 2 ;;
    *) echo "Opción desconocida: $1" >&2; exit 2 ;;
  esac
done

NAME="ayni-${ENVIRONMENT}"
API_SECRET="${NAME}/api/secrets"
DB_SECRET="${NAME}/db/app"
DB_APP_USERNAME="${DB_APP_USERNAME:-ayni_app}"

for tool in aws openssl jq; do
  command -v "$tool" >/dev/null || { echo "Falta $tool" >&2; exit 1; }
done

# El valor nunca va en la línea de comandos (quedaría en el historial y en la lista de procesos):
# se escribe en un archivo que solo puede leer quien ejecuta el script y se borra al terminar.
umask 077
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

put_secret() {
  local secret="$1" payload_file="$2"
  aws secretsmanager put-secret-value     --secret-id "$secret"     --secret-string "file://${payload_file}" >/dev/null
}

# ¿Esa clave ya tiene valor? Un secreto recién creado por Terraform no tiene ninguna versión.
has_key() {
  local secret="$1" key="$2"
  aws secretsmanager get-secret-value --secret-id "$secret" --query SecretString --output text 2>/dev/null |
    jq -e --arg k "$key" 'has($k) and (.[$k] | length > 0)' >/dev/null 2>&1
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

echo "Secretos de ${NAME}"

# --- Claves de la API ---------------------------------------------------------------------------
declare -A generated=()
for key in jwt_private_key otp_pepper field_encryption_key; do
  if has_key "$API_SECRET" "$key" && ! wants_rotation "$key"; then
    echo "  $key: ya tiene valor, no se toca"
    continue
  fi
  case "$key" in
    jwt_private_key) generated[$key]="$(new_jwt_key)" ;;
    *) generated[$key]="$(new_random_base64)" ;;
  esac
  echo "  $key: generado"
done

if [[ ${#generated[@]} -gt 0 ]]; then
  # Se parte del valor actual para no borrar las claves que no se regeneran.
  current="$(aws secretsmanager get-secret-value --secret-id "$API_SECRET" \
    --query SecretString --output text 2>/dev/null || echo '{}')"
  payload="$current"
  for key in "${!generated[@]}"; do
    payload="$(jq -n --argjson base "$payload" --arg k "$key" --arg v "${generated[$key]}" \
      '$base + {($k): $v}')"
  done
  printf '%s' "$payload" > "$WORKDIR/api.json"
  put_secret "$API_SECRET" "$WORKDIR/api.json"
  echo "  cargado en $API_SECRET"
fi

# --- Usuario de aplicación de la base -----------------------------------------------------------
# La contraseña no se usa aquí: la aplica el runner de migraciones en el siguiente despliegue.
if has_key "$DB_SECRET" "password" && ! wants_rotation "db_app_password"; then
  echo "  db_app_password: ya tiene valor, no se toca"
else
  # Sin caracteres que compliquen el quoting en psql o en las URL de conexión.
  password="$(openssl rand -base64 48 | tr -d '/+=' | cut -c1-40)"
  jq -n --arg u "$DB_APP_USERNAME" --arg p "$password" '{username: $u, password: $p}' \
    > "$WORKDIR/db.json"
  put_secret "$DB_SECRET" "$WORKDIR/db.json"
  echo "  db_app_password: generado y cargado en $DB_SECRET"
  echo "  (la contraseña se aplica en la base en el próximo despliegue, al correr las migraciones)"
fi

echo "Listo. Ningún valor se imprimió por pantalla ni quedó en el estado de Terraform."
