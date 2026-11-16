import { type Notification, type NotificationData, type NotificationType } from './notification';

/**
 * El texto del push lo arma el backend, no la app: cuando el aviso llega, la app puede estar
 * cerrada y el sistema operativo necesita el título y el cuerpo ya escritos. Por eso aquí se
 * repiten, en los mismos idiomas que la app, los textos que la bandeja arma en el cliente.
 *
 * Los idiomas son los del comprobante en PDF: el del perfil (`preferred_language`) y español por
 * defecto.
 */
export const PUSH_LANGUAGES = ['es', 'en'] as const;
export type PushLanguage = (typeof PUSH_LANGUAGES)[number];

export function pushLanguageOf(preferred: string | null | undefined): PushLanguage {
  return preferred?.slice(0, 2).toLowerCase() === 'en' ? 'en' : 'es';
}

const LOCALE: Record<PushLanguage, string> = { es: 'es-PE', en: 'en-US' };

/** Lo que se le entrega al proveedor para un dispositivo. */
export interface PushMessage {
  title: string;
  body: string;
  /** Lo mínimo para que la app abra la pantalla correcta al tocar el aviso. */
  data: { notificationId: string; type: NotificationType; circleId?: string };
}

interface Values {
  amount: string;
  dueOn: string;
  month: string;
  document: string;
}

const DOCUMENTS: Record<PushLanguage, Record<string, string>> = {
  es: {
    national_id: 'DNI',
    proof_of_income: 'comprobante de ingresos',
    additional: 'documento',
    identity: 'verificación de identidad',
  },
  en: {
    national_id: 'ID document',
    proof_of_income: 'proof of income',
    additional: 'document',
    identity: 'identity verification',
  },
};

type Template = (values: Values) => { title: string; body: string };

const TEXT: Record<PushLanguage, Record<NotificationType, Template>> = {
  es: {
    installment_due_soon: (v) => ({
      title: 'Tu cuota está por vencer',
      body: `Tu cuota de ${v.amount} vence el ${v.dueOn}.`,
    }),
    installment_due_today: (v) => ({
      title: 'Hoy vence tu cuota',
      body: `Paga ${v.amount} hoy para no entrar en mora.`,
    }),
    payment_received: (v) => ({
      title: 'Recibimos tu pago',
      body: `Tu cuota de ${v.amount} de ${v.month} quedó pagada.`,
    }),
    payment_failed: (v) => ({
      title: 'No pudimos cobrar tu cuota',
      body: `Tu cuota de ${v.amount} sigue pendiente desde el ${v.dueOn}.`,
    }),
    payout_turn: (v) => ({
      title: 'Te toca cobrar',
      body: `Este mes recibes ${v.amount} de tu junta.`,
    }),
    payout_disbursed: (v) => ({
      title: 'Te enviamos tu pozo',
      body: `Enviamos ${v.amount} de tu junta de ${v.month}.`,
    }),
    document_approved: (v) => ({
      title: 'Documento aprobado',
      body: `Tu ${v.document} quedó verificado.`,
    }),
    document_rejected: (v) => ({
      title: 'Documento rechazado',
      body: `Revisa tu ${v.document} y vuelve a enviarlo.`,
    }),
    circle_started: (v) => ({
      title: 'Tu junta empezó',
      body: `Tu junta arrancó en ${v.month}: ya puedes pagar tu primera cuota.`,
    }),
    circle_paused: () => ({
      title: 'Tu junta está en pausa',
      body: 'No se cobran cuotas mientras esté pausada. Te avisamos cuando se reanude.',
    }),
    circle_resumed: () => ({
      title: 'Tu junta se reanudó',
      body: 'Vuelven las cuotas y los cobros del mes.',
    }),
    circle_member_joined: () => ({
      title: 'Tu junta sumó un miembro',
      body: 'Falta menos para que empiece.',
    }),
  },
  en: {
    installment_due_soon: (v) => ({
      title: 'Your installment is due soon',
      body: `Your ${v.amount} installment is due on ${v.dueOn}.`,
    }),
    installment_due_today: (v) => ({
      title: 'Your installment is due today',
      body: `Pay ${v.amount} today to avoid late fees.`,
    }),
    payment_received: (v) => ({
      title: 'Payment received',
      body: `Your ${v.amount} installment for ${v.month} is paid.`,
    }),
    payment_failed: (v) => ({
      title: "We couldn't charge your installment",
      body: `Your ${v.amount} installment has been pending since ${v.dueOn}.`,
    }),
    payout_turn: (v) => ({
      title: "It's your turn to collect",
      body: `You receive ${v.amount} from your circle this month.`,
    }),
    payout_disbursed: (v) => ({
      title: 'We sent your payout',
      body: `We sent ${v.amount} from your ${v.month} circle.`,
    }),
    document_approved: (v) => ({
      title: 'Document approved',
      body: `Your ${v.document} is verified.`,
    }),
    document_rejected: (v) => ({
      title: 'Document rejected',
      body: `Check your ${v.document} and send it again.`,
    }),
    circle_started: (v) => ({
      title: 'Your circle started',
      body: `Your circle started in ${v.month}: you can pay your first installment.`,
    }),
    circle_paused: () => ({
      title: 'Your circle is paused',
      body: "No installments are charged while it's paused. We'll let you know when it resumes.",
    }),
    circle_resumed: () => ({
      title: 'Your circle resumed',
      body: 'Monthly installments and payouts are back.',
    }),
    circle_member_joined: () => ({
      title: 'Someone joined your circle',
      body: "It's closer to starting.",
    }),
  },
};

function valuesOf(data: NotificationData, language: PushLanguage): Values {
  const locale = LOCALE[language];
  const amount = data.amount
    ? new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: data.amount.currency,
      }).format(data.amount.amount / 100)
    : '';
  // `dueOn` es una fecha sin hora: se formatea en UTC para que no se corra un día.
  const dueOn = data.dueOn
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
        new Date(`${data.dueOn}T12:00:00Z`),
      )
    : '';
  const month = data.period
    ? new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${data.period}-15T12:00:00Z`),
      )
    : '';
  const document = data.documentType
    ? (DOCUMENTS[language][data.documentType] ?? DOCUMENTS[language].additional!)
    : DOCUMENTS[language].additional!;
  return { amount, dueOn, month, document };
}

/** Título y cuerpo del aviso para una notificación de la bandeja. */
export function buildPushMessage(
  notification: Pick<Notification, 'id' | 'type' | 'data'>,
  language: PushLanguage,
): PushMessage {
  const { title, body } = TEXT[language][notification.type](valuesOf(notification.data, language));
  return {
    title,
    body,
    data: {
      notificationId: notification.id,
      type: notification.type,
      ...(notification.data.circleId ? { circleId: notification.data.circleId } : {}),
    },
  };
}
