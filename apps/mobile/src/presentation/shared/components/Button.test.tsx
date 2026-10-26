import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from './Button';

describe('Button', () => {
  it('muestra la etiqueta y responde al toque', async () => {
    const onPress = jest.fn();
    await render(<Button label="Continuar" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('en loading oculta la etiqueta, se marca ocupado y bloquea el doble envío', async () => {
    const onPress = jest.fn();
    await render(<Button label="Guardar" loading onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Guardar' });
    expect(screen.queryByText('Guardar')).toBeNull();
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('deshabilitado no ejecuta la acción', async () => {
    const onPress = jest.fn();
    await render(<Button label="Pagar" variant="secondary" disabled onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Pagar' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});
