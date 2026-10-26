/**
 * Datos de ejemplo del catálogo visual (solo ambiente dev, para la revisión con UX).
 * No son textos de la app: por eso no van en los JSON de idioma.
 */
export const CATALOG_SAMPLES = {
  sections: {
    typography: 'Tipografía',
    buttons: 'Botones',
    badges: 'Badges',
    cards: 'Tarjetas y listas',
    controls: 'Controles',
    feedback: 'Estados y avisos',
    forms: 'Formularios',
    circle: 'CircleCard',
    sheet: 'BottomSheet',
  },
  text: {
    display: 'Display 28',
    title: 'Title 22',
    highlight: 'Highlight 16',
    body: 'Body 14',
    caption: 'Caption 12',
    footnote: 'Footnote 10',
  },
  buttons: { primary: 'Continuar', secondary: 'Cerrar sesión', disabled: 'Deshabilitado' },
  badges: { primary: 'No Charge', success: 'New', subtle: 'Joined' },
  card: { title: 'April 2025', description: '1200 de descuento' },
  listItem: { title: 'National ID', description: 'Requerido para verificar tu identidad' },
  toggle: { label: 'Deduct pay-in from payout', description: 'Se descuenta en el mismo mes' },
  tabs: [
    { key: 'active', label: 'Active' },
    { key: 'finished', label: 'Finished' },
  ],
  emptyState: {
    title: 'No tienes pagos pendientes',
    description: 'Aparecerán aquí cuando te unas a un círculo.',
    action: 'Unirme a un círculo',
  },
  infoBanner: { message: 'Las Admin Fees se reparten hasta tu mes de payout.', link: 'Learn More' },
  textField: {
    label: 'Email/Phone',
    placeholder: 'Ingresa tu email o teléfono',
    error: 'Formato inválido',
  },
  phone: { label: 'Teléfono', regionCode: 'PE', callingCode: '+51' },
  otp: { label: 'Código de verificación' },
  radios: {
    group: 'Método de cobro',
    wallet: { title: 'Digital Wallets', description: 'Recibe tu payout en una billetera digital.' },
    bank: {
      title: 'Bank Transfer',
      description: 'Directo a tu cuenta bancaria.',
      badge: 'No Charge',
    },
    unavailable: { title: 'Fawry', description: 'Cobra en tiendas.', reason: 'Not available' },
  },
  stepper: { label: 'Paso 2 de 4' },
  /** Montos en unidades mayores y fechas ISO: el catálogo los formatea con Money y formatDate. */
  circle: {
    total: 24000,
    installment: 2000,
    fees: 2880,
    start: '2024-11-15',
    end: '2025-10-15',
    installmentPeriod: '/mes',
    turnLabel: 'Your Turn',
    durationLabel: '12 meses',
    feesLabel: 'Admin Fees:',
    action: 'Join now',
    badge: 'Joined',
  },
  sheet: {
    open: 'Abrir hoja inferior',
    title: 'Elige la duración',
    close: 'Cerrar',
    body: 'Contenido de la hoja.',
  },
} as const;
