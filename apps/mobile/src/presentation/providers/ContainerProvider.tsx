import { createContext, useContext } from 'react';

import type { AppContainer } from '@/application/AppContainer';

const ContainerContext = createContext<AppContainer | null>(null);

/** Inyecta los casos de uso en la UI; las pruebas pasan un contenedor con dobles. */
export function ContainerProvider({
  container,
  children,
}: {
  container: AppContainer;
  children: React.ReactNode;
}) {
  return <ContainerContext.Provider value={container}>{children}</ContainerContext.Provider>;
}

export function useContainer(): AppContainer {
  const container = useContext(ContainerContext);
  if (!container) throw new Error('useContainer must be used within ContainerProvider');
  return container;
}
