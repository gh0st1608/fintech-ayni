import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';

import { createAppContainer } from './bootstrap/container';
import { parseConfig } from './bootstrap/env';
import { viteEnv } from './bootstrap/viteEnv';
import { AppProviders, createQueryClient } from './presentation/providers/AppProviders';
import { routes } from './presentation/routes/routes';

const element = document.getElementById('root');
if (!element) throw new Error('Falta el elemento #root en index.html');
const root = createRoot(element);

try {
  const container = createAppContainer(parseConfig(viteEnv));
  const router = createBrowserRouter(routes);
  root.render(
    <StrictMode>
      <AppProviders container={container} queryClient={createQueryClient()}>
        <RouterProvider router={router} />
      </AppProviders>
    </StrictMode>,
  );
} catch (error) {
  // Configuración inválida: se explica en pantalla en vez de arrancar con valores por defecto.
  root.render(
    <main role="alert" style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>No se pudo iniciar el back-office</h1>
      <pre style={{ whiteSpace: 'pre-wrap' }}>
        {error instanceof Error ? error.message : String(error)}
      </pre>
    </main>,
  );
}
