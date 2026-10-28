# Runbook de seguridad (cuenta AWS de prd)

Alarmas del módulo [audit-trail](../../infra/terraform/modules/audit-trail): filtros sobre los eventos de CloudTrail, según las recomendaciones CIS AWS Foundations. Todas son `critical` y llegan al tópico `ayni-prd-security-alarms`.

**Dónde investigar:**

- **New Relic Logs:** los eventos de CloudTrail se reenvían ahí y se pueden buscar por `eventName`, `userIdentity.arn` y `sourceIPAddress`.
- **CloudWatch Logs:** el grupo `/aws/cloudtrail/ayni-prd`, con Logs Insights.
- **Bucket `ayni-prd-cloudtrail-<cuenta>`:** la copia íntegra. `aws cloudtrail validate-logs` prueba que los archivos no se alteraron.

**Regla general:** primero contener, después investigar.

- **Ante una credencial comprometida:** desactivarla o revocar sus sesiones (en un rol, con la política `AWSRevokeOlderSessions`), y conservar los eventos.
- **Excepción para los cambios del rol `ayni-prd-terraform-apply`:** no alarman, porque ya pasaron por un plan aprobado. Si el rol hace algo inesperado, revisar el workflow que lo usó.

## root-account-usage

**Señal:** se usó la cuenta root, que no se usa en la operación diaria.

1. Confirmar con el dueño de la cuenta si fue intencional y quedó registrado (por ejemplo, un cambio de facturación).
2. Si no lo fue:
   - cambiar la contraseña de root;
   - revisar su MFA;
   - eliminar cualquier access key de root;
   - revisar los eventos de esa sesión.

## console-login-without-mfa

**Señal:** un usuario IAM entró a la consola sin MFA.

1. Identificar al usuario (`userIdentity.userName`) y la IP de origen.
2. Exigirle MFA y, si no reconoce el acceso, desactivar el usuario.
3. La meta es no tener usuarios IAM con consola: el acceso humano va por IAM Identity Center.

## unauthorized-api-calls

**Señal:** cinco o más llamadas rechazadas por permisos en 5 minutos.

1. Agrupar por `userIdentity.arn` y `eventName`:
   - si son de un rol propio después de un despliegue, es una política incompleta: corregirla en Terraform;
   - si son de una identidad o una IP desconocida, tratarlas como una credencial comprometida.
2. Si persisten sin causa clara, ajustar el umbral solo después de entenderlas.

## iam-policy-changes

**Señal:** se cambió una política IAM fuera del pipeline.

1. Ver quién hizo el cambio y desde dónde.
2. Revertirlo con un apply del stack correspondiente: Terraform muestra la diferencia.
3. Si fue un cambio de emergencia, registrarlo en el incidente y llevarlo a Terraform.

## security-group-changes

**Señal:** se cambió un security group fuera del pipeline.

1. Revisar si se abrió algún puerto a `0.0.0.0/0`. Si es así, cerrarlo de inmediato.
2. Revertir con un apply. Igual que en [iam-policy-changes](#iam-policy-changes), todo cambio de emergencia vuelve a Terraform.

## kms-key-disabled-or-deleted

**Señal:** una clave KMS se desactivó o se programó para borrarse. Los documentos KYC, los backups o la auditoría cifrados con ella quedarían ilegibles.

1. Si no fue intencional, cancelarlo de inmediato:
   - `aws kms cancel-key-deletion`;
   - `aws kms enable-key`.

   La espera mínima antes del borrado es de 7 días (30 en prd).
2. Identificar quién lo hizo y tratarlo como un incidente.

## cloudtrail-changes

**Señal:** se modificó, detuvo o borró un trail. Es la forma de borrar huellas.

1. Si se detuvo, reactivarlo: `aws cloudtrail start-logging --name ayni-prd`.
2. Revertir cualquier cambio con un apply del stack account.
3. Tratarlo como un incidente de seguridad hasta demostrar lo contrario.
