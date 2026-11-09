# Módulo `otp-messaging`

Envío del código de verificación (OTP) de la API (pending-scope T6): email con **Amazon SES v2** y SMS con **AWS End User Messaging SMS**. Crea solo lo que se usa en cada canal y entrega a la API el permiso mínimo para enviar y las variables de entorno correspondientes.

- **Email:** identidad del dominio remitente con Easy DKIM de 2048 bits. Un configuration set exige TLS, registra métricas de reputación y manda rebotes y quejas a la lista de supresión. Si se pasa la zona de Route 53, también publica los 3 registros DKIM.
- **SMS:** configuration set con mensajes transaccionales. La identidad de origen (número, pool o sender ID) **no** la crea el módulo: su registro depende del país y tiene un trámite propio.
- **Permisos:** `ses:SendEmail` solo desde el dominio verificado (condición `ses:FromAddress`) y `sms-voice:SendTextMessage` solo desde la identidad registrada, cada uno con su configuration set. No incluye permisos para administrar identidades.

## Ejemplo

```hcl
module "otp_messaging" {
  source = "../../../../modules/otp-messaging"

  name = "ayni-prd"
  email = {
    domain          = "mail.ayni.pe"
    from_address    = "Ayni <no-reply@mail.ayni.pe>"
    route53_zone_id = aws_route53_zone.mail.zone_id # opcional
  }
  sms = {
    origination_identity_arn = "arn:aws:sms-voice:us-east-1:123456789012:pool/pool-abc123"
  }
}
```

La API recibe `module.otp_messaging.app_environment` en sus variables de entorno, y `send_policy_json` como política del rol de la tarea.

## Entradas

| Nombre  | Obligatoria | Descripción                                                                                       |
| ------- | ----------- | ------------------------------------------------------------------------------------------------- |
| `name`  | **sí**      | Prefijo de los recursos.                                                                          |
| `email` | no          | `{ domain, from_address, route53_zone_id? }`. El remitente debe ser del dominio. null: sin email. |
| `sms`   | no          | `{ origination_identity_arn }`: ARN de un número, pool o sender ID ya registrado. null: sin SMS.  |
| `tags`  | no          | Etiquetas adicionales.                                                                            |

## Salidas

| Nombre             | Descripción                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `send_policy_json` | Política mínima para enviar. null si no hay ningún canal.                                                                                       |
| `app_environment`  | `OTP_DELIVERY`, `OTP_EMAIL_FROM`, `OTP_SES_CONFIGURATION_SET`, `OTP_SMS_ORIGINATION_IDENTITY` y `OTP_SMS_CONFIGURATION_SET`, según los canales. |
| `dkim_records`     | Registros CNAME de DKIM. Cargarlos en el DNS del dominio cuando no se pasa `route53_zone_id`.                                                   |

## Pasos fuera de Terraform

Son pasos de cuenta y de trámite; ninguno se ejecuta desde una laptop contra prd.

1. **Salir del sandbox de SES:** en sandbox, SES solo envía a direcciones verificadas. El acceso de producción se pide en la consola de SES, con el caso de uso (códigos de verificación) y el manejo de rebotes.
2. **DMARC del dominio remitente:** un registro `_dmarc` en el DNS del dominio, a cargo de quien lo administra.
3. **Identidad de origen del SMS:** el tipo de origen (número largo, sender ID o pool) y su registro dependen de los países de destino. Para Perú hay que confirmar los tipos admitidos y el trámite vigente en la documentación de AWS antes de elegir.
4. **Límite de gasto de SMS:** la cuota mensual de End User Messaging SMS de la cuenta parte baja. Se sube con una solicitud de cuota y conviene una alarma de costos.
5. **Salir del sandbox de SMS:** las cuentas nuevas solo envían a números de destino verificados hasta pedir el acceso de producción.

## Pruebas

`terraform test` con provider simulado: [otp-messaging.tftest.hcl](tests/otp-messaging.tftest.hcl).
