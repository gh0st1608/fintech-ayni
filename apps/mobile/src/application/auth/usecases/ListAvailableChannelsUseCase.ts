import type { OtpChannel } from '@/domain/auth/AuthChallenge';
import type { AuthApiPort } from '@/domain/auth/ports/AuthApiPort';

/**
 * Por dónde puede llegar el código en este ambiente (pending-scope T6). Lo decide el backend: un
 * canal sin proveedor responde 503, así que la pantalla no debe dejar pedirlo.
 */
export class ListAvailableChannelsUseCase {
  constructor(private readonly api: AuthApiPort) {}

  execute(signal?: AbortSignal): Promise<OtpChannel[]> {
    return this.api.availableChannels(signal);
  }
}
