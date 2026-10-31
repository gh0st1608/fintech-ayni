import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { PermissionDeniedError } from '@/domain/documents/ports/FilePorts';
import type { KycDocument } from '@/domain/documents/KycDocument';
import { Money } from '@/domain/shared/value-objects/Money';
import { InMemoryDocumentRepository } from '@/infrastructure/documents/InMemoryDocumentRepository';
import { FakeFilePicker } from '@test/fakes/FakeFilePicker';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

import { DocumentsScreen } from './screens/DocumentsScreen';
import { ProofOfIncomeScreen } from './screens/ProofOfIncomeScreen';
import { ScanNationalIdScreen } from './screens/ScanNationalIdScreen';

const approvedId: KycDocument = {
  id: 'd-1',
  type: 'nationalId',
  kind: 'national_id',
  status: 'approved',
  reason: null,
  monthlyIncome: null,
  pages: 2,
  submittedAt: new Date('2026-10-30T15:00:00Z'),
};

describe('DocumentsScreen (COPAYNI-46)', () => {
  it('muestra el estado de cada documento; los pendientes abren su pantalla', async () => {
    const onIncome = jest.fn();
    await renderWithProviders(
      <DocumentsScreen onOpen={{ nationalId: jest.fn(), proofOfIncome: onIncome }} />,
      createTestContainer({
        documents: new InMemoryDocumentRepository({ latencyMs: 0, documents: [approvedId] }),
      }),
    );
    expect(await screen.findByTestId('document-nationalId')).toHaveTextContent(/Verificado/);
    // Un documento verificado no se vuelve a enviar.
    expect(screen.queryByRole('button', { name: /Documento de identidad/ })).toBeNull();
    expect(screen.getByTestId('document-additional')).toHaveTextContent(/Pendiente de enviar/);

    await fireEvent.press(screen.getByRole('button', { name: /Comprobante de ingresos/ }));
    expect(onIncome).toHaveBeenCalled();
  });
});

/** El escaneo empieza en la guía del Figma (55:10598). */
async function startScan() {
  await fireEvent.press(await screen.findByRole('button', { name: 'Escanear documento' }));
}

describe('ScanNationalIdScreen (COPAYNI-47)', () => {
  it('muestra la guía con los ejemplos de qué evitar antes de la cámara', async () => {
    await renderWithProviders(<ScanNationalIdScreen onDone={jest.fn()} />);
    expect(screen.getByText(/ambas caras se vean completas y nítidas/)).toBeTruthy();
    expect(screen.getByLabelText('Evita: Foto borrosa')).toBeTruthy();
    expect(screen.getByLabelText('Evita: Datos tapados')).toBeTruthy();
    expect(screen.getByText(/antes de que te unas a un Game'ya/)).toBeTruthy();
    expect(screen.queryByTestId('slot-front')).toBeNull();

    await startScan();
    expect(screen.getByTestId('slot-front')).toBeTruthy();
  });

  it('toma ambas caras, las sube, borra las copias y muestra el resultado', async () => {
    const setup = createTestContainer();
    const onDone = jest.fn();
    await renderWithProviders(<ScanNationalIdScreen onDone={onDone} />, setup);
    await startScan();
    const submit = screen.getByRole('button', { name: 'Enviar documento' });
    expect(submit).toBeDisabled();

    const [frontPhoto, backPhoto] = screen.getAllByRole('button', { name: 'Tomar foto' });
    await fireEvent.press(frontPhoto!);
    await fireEvent.press(backPhoto!);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Enviar documento' })).toBeEnabled(),
    );
    expect(screen.getByLabelText('Vista previa: Anverso')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Enviar documento' }));
    expect(await screen.findByText('¡Documento verificado!')).toBeTruthy();
    expect(setup.adapters.fileUploader.uploaded).toHaveLength(2);
    expect(setup.adapters.fileCleaner.removed).toHaveLength(2);

    await fireEvent.press(screen.getByRole('button', { name: 'Listo' }));
    expect(onDone).toHaveBeenCalled();
  });

  it('sin permiso de cámara explica cómo activarlo', async () => {
    await renderWithProviders(
      <ScanNationalIdScreen onDone={jest.fn()} />,
      createTestContainer({
        filePicker: new FakeFilePicker([new PermissionDeniedError('camera')]),
      }),
    );
    await startScan();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Tomar foto' })[0]!);
    expect(await screen.findByText(/necesita acceso a la cámara/)).toBeTruthy();
  });

  it('un archivo no admitido se rechaza antes de subirlo', async () => {
    const setup = createTestContainer({
      filePicker: new FakeFilePicker([
        { uri: 'file:///a.gif', mimeType: 'image/gif', sizeBytes: 10 },
        { uri: 'file:///b.jpg', mimeType: 'image/jpeg', sizeBytes: 10 },
      ]),
    });
    await renderWithProviders(<ScanNationalIdScreen onDone={jest.fn()} />, setup);
    await startScan();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Galería' })[0]!);
    await fireEvent.press(screen.getAllByRole('button', { name: 'Galería' })[1]!);
    await fireEvent.press(await screen.findByRole('button', { name: 'Enviar documento' }));
    expect(await screen.findByText('Usa una foto JPG o PNG, o un PDF.')).toBeTruthy();
    expect(setup.adapters.fileUploader.uploaded).toEqual([]);
  });

  it('un rechazo muestra el motivo y permite reintentar', async () => {
    const documents = new InMemoryDocumentRepository({ latencyMs: 0 });
    jest.spyOn(documents, 'submitNationalId').mockResolvedValue({
      ...approvedId,
      status: 'rejected',
      reason: 'El documento no se pudo leer: vuelve a escanearlo',
    });
    await renderWithProviders(
      <ScanNationalIdScreen onDone={jest.fn()} />,
      createTestContainer({ documents }),
    );
    await startScan();
    for (const button of screen.getAllByRole('button', { name: 'Tomar foto' })) {
      await fireEvent.press(button);
    }
    await fireEvent.press(await screen.findByRole('button', { name: 'Enviar documento' }));
    expect(await screen.findByText(/vuelve a escanearlo/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Volver a intentarlo' }));
    expect(screen.getByRole('button', { name: 'Enviar documento' })).toBeDisabled();
  });
});

describe('ProofOfIncomeScreen (COPAYNI-48)', () => {
  /** Pasos del Figma: tipo (55:10630) → ingreso (55:10662) → guía y páginas (55:10677). */
  async function goToUpload(income: string) {
    await fireEvent.press(screen.getByRole('button', { name: 'Siguiente' }));
    const next = screen.getByRole('button', { name: 'Siguiente' });
    expect(next).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('monthly-income'), income);
    await fireEvent.press(screen.getByRole('button', { name: 'Siguiente' }));
  }

  it('envía el ingreso en unidades menores con las páginas del comprobante', async () => {
    const setup = createTestContainer();
    const submit = jest.spyOn(setup.adapters.documents, 'submitProofOfIncome');
    await renderWithProviders(<ProofOfIncomeScreen onDone={jest.fn()} />, setup);

    await fireEvent.press(screen.getByTestId('income-kind-bankStatement'));
    expect(screen.getByText(/Más documentos, mayores payouts/)).toBeTruthy();
    await goToUpload('3500,50');

    // La guía cambia según el tipo elegido.
    expect(screen.getByText(/estado de cuenta con los movimientos/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Tomar foto' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Elegir PDF' }));
    expect(await screen.findByTestId('page-2')).toHaveTextContent(/PDF seleccionado/);

    await fireEvent.press(screen.getByRole('button', { name: 'Enviar comprobante' }));
    expect(await screen.findByText('¡Documento verificado!')).toBeTruthy();
    expect(submit).toHaveBeenCalledWith('bankStatement', Money.of(350050, 'PEN'), [
      expect.any(String),
      expect.any(String),
    ]);
  });

  it('un ingreso inválido no deja avanzar', async () => {
    await renderWithProviders(<ProofOfIncomeScreen onDone={jest.fn()} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Siguiente' }));
    for (const value of ['0', '3500,505', 'abc']) {
      await fireEvent.changeText(screen.getByTestId('monthly-income'), value);
      expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    }
  });

  it('una página se puede quitar', async () => {
    await renderWithProviders(<ProofOfIncomeScreen onDone={jest.fn()} />);
    await goToUpload('3500');
    await fireEvent.press(screen.getByRole('button', { name: 'Tomar foto' }));
    expect(await screen.findByTestId('page-1')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Quitar' }));
    expect(screen.queryByTestId('page-1')).toBeNull();
    expect(screen.getByRole('button', { name: 'Enviar comprobante' })).toBeDisabled();
  });
});
