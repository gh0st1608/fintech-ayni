# Valores de producto de la API: los mismos en todos los ambientes, definidos una sola vez.
#
# Estaban copiados en el tfvars de cada ambiente y en apps/backend/.env.example, y ya habían
# divergido: el ejemplo decía 600000 de tope de payout y los dos tfvars 12000000, un valor que la
# API rechaza al arrancar mientras no haya KYC biométrico (env.validation.ts).
#
# Lo que sí cambia por ambiente —nivel de log, orígenes CORS, límites de tasa, proveedores— sigue
# en el tfvars de cada uno, que puede sobrescribir cualquiera de estos valores.
locals {
  defaults = {
    # Moneda y montos en unidades menores (pending-scope M1, M6, R15).
    DEFAULT_CURRENCY = "PEN"
    JOIN_PAYOUT_MIN  = "300000"
    # Tope de lanzamiento (pending-scope §3.2, P3): 6.000 PEN mientras no haya mora observada ni
    # VerificaID activo. Subirlo exige KYC_PROVIDER=verificaid.
    JOIN_PAYOUT_MAX         = "600000"
    JOIN_PAYOUT_STEP        = "50000"
    SAVING_PROGRAM_MAX      = "100000000"
    CIRCLE_DURATION_OPTIONS = "6,10,12"
  }
}
