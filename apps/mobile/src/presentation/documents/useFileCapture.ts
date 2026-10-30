import { useState } from 'react';

import type { LocalFile } from '@/domain/documents/LocalFile';
import { useContainer } from '@/presentation/providers/ContainerProvider';

type Source = 'photo' | 'image' | 'pdf';

/** Captura con la cámara, la galería o un PDF; guarda el error de permisos para mostrarlo. */
export function useFileCapture() {
  const { documents } = useContainer();
  const [error, setError] = useState<unknown>(null);

  const capture = async (source: Source): Promise<LocalFile | null> => {
    setError(null);
    try {
      if (source === 'photo') return await documents.picker.takePhoto();
      if (source === 'image') return await documents.picker.pickImage();
      return await documents.picker.pickPdf();
    } catch (caught) {
      setError(caught);
      return null;
    }
  };

  return { capture, error };
}
