import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useContainer } from '@/presentation/providers/ContainerProvider';

import { notificationsQueryKey, unreadNotificationsQueryKey } from './useNotifications';

/**
 * Registra este celular al entrar a la zona privada y abre la bandeja cuando la persona toca un
 * aviso (COPAYNI-85).
 *
 * No pide el permiso aquí: un diálogo del sistema al abrir la app, sin contexto, se rechaza, y el
 * rechazo solo se deshace desde los ajustes del teléfono. El permiso se pide en los ajustes de
 * avisos, donde la persona ya sabe para qué es. Si ya estaba concedido, registrar es silencioso.
 */
export function usePushRegistration(onOpenInbox: () => void): void {
  const { push } = useContainer();
  const queryClient = useQueryClient();

  useEffect(() => {
    // Un fallo no se le muestra a nadie: la app funciona igual sin avisos.
    void push.register.execute({ ask: false });
  }, [push.register]);

  useEffect(
    () =>
      push.taps.execute(() => {
        // Lo que motivó el aviso ya está en la bandeja: se refresca y se abre.
        void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
        void queryClient.invalidateQueries({ queryKey: unreadNotificationsQueryKey });
        onOpenInbox();
      }),
    [push.taps, queryClient, onOpenInbox],
  );
}
