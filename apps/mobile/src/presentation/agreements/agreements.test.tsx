import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { MembershipAgreement } from '@/domain/agreements/MembershipAgreement';
import {
  FAKE_SIGNATURE_CODE,
  InMemoryAgreementRepository,
} from '@/infrastructure/agreements/InMemoryAgreementRepository';
import { createTestContainer } from '@test/fakes/createTestContainer';
import { renderWithProviders } from '@test/renderWithProviders';

import { AgreementDocumentScreen } from './screens/AgreementDocumentScreen';
import { SignAgreementsScreen } from './screens/SignAgreementsScreen';

const AGREEMENT_ID = 'fake-agreement-1';

/**
 * Monta la pantalla de firma con un repositorio en memoria. `prepare` corre **antes** de
 * renderizar: la pantalla lee la lista una vez, así que mutar el repositorio después no se
 * refleja hasta que algo la invalide.
 */
async function renderSign(
  prepare?: (agreements: InMemoryAgreementRepository) => void | Promise<void>,
) {
  const agreements = new InMemoryAgreementRepository({ latencyMs: 0 });
  await prepare?.(agreements);
  const onOpenDocument = jest.fn();
  const onDone = jest.fn();
  const setup = createTestContainer({ agreements });
  const view = await renderWithProviders(
    <SignAgreementsScreen
      agreementId={AGREEMENT_ID}
      onOpenDocument={onOpenDocument}
      onDone={onDone}
    />,
    setup,
  );
  return { ...view, agreements, onOpenDocument, onDone };
}

/** Deja los dos documentos leídos, que es lo que habilita pedir el código. */
async function readBoth(agreements: InMemoryAgreementRepository) {
  await agreements.readDocument(AGREEMENT_ID, 'contract');
  await agreements.readDocument(AGREEMENT_ID, 'promissoryNote');
}

/** Pide el código y espera a que aparezca el campo. */
async function requestCode() {
  await fireEvent.press(await screen.findByTestId('agreement-request-code'));
  await screen.findByTestId('agreement-code');
}

describe('Firma del contrato y del pagaré (COPAYNI-89)', () => {
  it('sin leer los documentos no deja pedir el código y lo explica', async () => {
    await renderSign();

    const request = await screen.findByTestId('agreement-request-code');
    expect(request).toBeDisabled();
    expect(screen.getByTestId('agreement-signature')).toHaveTextContent(
      /Lee los dos documentos para poder firmarlos/,
    );
    // Los dos documentos aparecen como pendientes de leer.
    expect(screen.getAllByText('Pendiente')).toHaveLength(2);
  });

  it('con un solo documento leído el código sigue bloqueado', async () => {
    await renderSign(async (repository) => {
      await repository.readDocument(AGREEMENT_ID, 'contract');
    });

    expect(await screen.findByText('Leído')).toBeTruthy();
    expect(screen.getByText('Pendiente')).toBeTruthy();
    expect(screen.getByTestId('agreement-request-code')).toBeDisabled();
  });

  it('con los dos leídos habilita pedir el código', async () => {
    await renderSign(readBoth);

    await waitFor(() => expect(screen.getByTestId('agreement-request-code')).not.toBeDisabled());
    expect(screen.getAllByText('Leído')).toHaveLength(2);
  });

  it('abrir un documento lleva a su pantalla de lectura', async () => {
    const { onOpenDocument } = await renderSign();

    await fireEvent.press(await screen.findByTestId('agreement-document-contract'));
    expect(onOpenDocument).toHaveBeenCalledWith('contract');
  });

  it('el código correcto firma ambos documentos y cierra el trámite', async () => {
    const { agreements, onDone } = await renderSign(readBoth);
    await requestCode();

    await fireEvent.changeText(screen.getByTestId('agreement-code'), FAKE_SIGNATURE_CODE);

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(agreements.agreements[0]?.status).toBe('signed');
  });

  it('un código incorrecto avisa los intentos restantes y no firma', async () => {
    const { agreements, onDone } = await renderSign(readBoth);
    await requestCode();

    await fireEvent.changeText(screen.getByTestId('agreement-code'), '9999');

    await waitFor(() => expect(screen.getByText(/El código no es correcto/)).toBeTruthy());
    expect(onDone).not.toHaveBeenCalled();
    expect(agreements.agreements[0]?.status).toBe('pending');
  });

  it('un acuerdo vencido explica que el turno se liberó, sin ofrecer firma', async () => {
    const expired: MembershipAgreement = {
      id: AGREEMENT_ID,
      circleId: 'c-1',
      position: 3,
      status: 'expired',
      expiresAt: new Date('2026-11-16T15:00:00.000Z'),
      signedAt: null,
      unread: [],
    };
    const { onDone } = await renderSign((repository) => {
      repository.agreements = [expired];
    });

    expect(await screen.findByText(/Venció el plazo para firmar/)).toBeTruthy();
    expect(screen.queryByTestId('agreement-request-code')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    expect(onDone).toHaveBeenCalled();
  });

  it('leer un documento muestra su texto y lo marca leído', async () => {
    const agreements = new InMemoryAgreementRepository({ latencyMs: 0 });
    const onDone = jest.fn();
    await renderWithProviders(
      <AgreementDocumentScreen agreementId={AGREEMENT_ID} document="contract" onDone={onDone} />,
      createTestContainer({ agreements }),
    );

    expect(await screen.findByRole('header', { name: 'Contrato de la junta' })).toBeTruthy();
    expect(screen.getByText(/CONTRATO DE PARTICIPACIÓN/)).toBeTruthy();
    // El texto es provisional hasta que Legal entregue el definitivo (pending-scope §3.3).
    expect(screen.getByText(/Texto provisional/)).toBeTruthy();
    await waitFor(() => expect(agreements.agreements[0]?.unread).toEqual(['promissoryNote']));
  });

  it('un documento que no existe en la URL no rompe la pantalla', async () => {
    const onDone = jest.fn();
    await renderWithProviders(
      <AgreementDocumentScreen agreementId={AGREEMENT_ID} document="otro" onDone={onDone} />,
      createTestContainer({ agreements: new InMemoryAgreementRepository({ latencyMs: 0 }) }),
    );

    expect(await screen.findByText(/No encontramos ese documento/)).toBeTruthy();
  });
});
