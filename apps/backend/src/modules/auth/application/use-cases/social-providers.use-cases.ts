import { Inject, Injectable } from '@nestjs/common';

import { IDENTITY_PROVIDERS, type IdentityProvider } from '../../domain/entities/external-identity';
import {
  APPLE_WEB_FLOW,
  type AppleWebFlowPort,
  GOOGLE_WEB_FLOW,
  type GoogleWebFlowPort,
  IDENTITY_PROVIDERS_PORT,
  type IdentityProvidersPort,
} from '../ports/social-auth.ports';

/** Qué puede ofrecer cada proveedor en este ambiente, según las credenciales que haya. */
export interface ProviderAvailability {
  provider: IdentityProvider;
  /** El dispositivo obtiene el ID Token con el SDK nativo y la API lo verifica (Apple en iOS). */
  native: boolean;
  /** El inicio pasa por el navegador y lo coordina la API. */
  web: boolean;
}

/**
 * Proveedores que la app puede ofrecer (COPAYNI-91 §3). Lo decide el servidor, no la app: así,
 * activar o apagar un proveedor es cambiar una variable de entorno, sin publicar una versión
 * nueva en las tiendas, que es lo lento.
 *
 * Un proveedor sin credenciales aparece con todo en `false`: la app no pinta su botón y nadie
 * llega a una pantalla de error del proveedor.
 */
@Injectable()
export class ListConfiguredProvidersUseCase {
  constructor(
    @Inject(IDENTITY_PROVIDERS_PORT) private readonly providers: IdentityProvidersPort,
    @Inject(GOOGLE_WEB_FLOW) private readonly google: GoogleWebFlowPort,
    @Inject(APPLE_WEB_FLOW) private readonly apple: AppleWebFlowPort,
  ) {}

  execute(): ProviderAvailability[] {
    const configured = this.providers.configured();
    const webFlows: Record<IdentityProvider, boolean> = {
      google: this.google.isConfigured(),
      apple: this.apple.isConfigured(),
    };

    return IDENTITY_PROVIDERS.map((provider) => {
      // Sin audiencias no se puede verificar el token, así que ninguna de las dos vías sirve.
      const verifiable = configured.includes(provider);
      return { provider, native: verifiable, web: verifiable && webFlows[provider] };
    });
  }
}
