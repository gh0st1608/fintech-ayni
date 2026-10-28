import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { colors } from '@/presentation/theme/tokens';

import { OTPInput } from './OTPInput';
import { flagEmoji, PhoneInput } from './PhoneInput';
import { RadioCard, RadioGroup } from './RadioCard';
import { TextField } from './TextField';

describe('TextField', () => {
  it('se identifica por su etiqueta y propaga el texto', async () => {
    const onChangeText = jest.fn();
    await render(
      <TextField label="Email/Phone" value="" onChangeText={onChangeText} icon="mail-outline" />,
    );
    await fireEvent.changeText(screen.getByLabelText('Email/Phone'), 'ana@ayni.pe');
    expect(onChangeText).toHaveBeenCalledWith('ana@ayni.pe');
  });

  it('muestra el error como alerta y marca el campo como inválido', async () => {
    await render(<TextField label="Email/Phone" value="x" error="Formato inválido" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Formato inválido');
    expect(screen.getByLabelText('Email/Phone').props['aria-invalid']).toBe(true);
  });

  it('sin error no muestra alerta', async () => {
    await render(<TextField label="Name on Card" value="" />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('respeta los manejadores de foco del llamador', async () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    await render(<TextField label="CVC" value="" onFocus={onFocus} onBlur={onBlur} />);
    const input = screen.getByLabelText('CVC');
    await fireEvent(input, 'focus');
    await fireEvent(input, 'blur');
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('en solo lectura no es editable', async () => {
    await render(<TextField label="Email" value="ana@ayni.pe" editable={false} />);
    expect(screen.getByLabelText('Email')).toBeDisabled();
  });
});

describe('PhoneInput', () => {
  it('flagEmoji convierte el código de región y rechaza códigos inválidos', () => {
    expect(flagEmoji('pe')).toBe('🇵🇪');
    expect(flagEmoji('PER')).toBe('');
  });

  it('solo acepta dígitos y espacios en el número', async () => {
    const onChangeText = jest.fn();
    await render(
      <PhoneInput
        label="Teléfono"
        regionCode="PE"
        callingCode="+51"
        value=""
        onChangeText={onChangeText}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText('Teléfono'), '987 65a4-321');
    expect(onChangeText).toHaveBeenCalledWith('987 654321');
  });

  it('el prefijo solo es un botón si hay selector de país', async () => {
    const onPressCountry = jest.fn();
    const { rerender } = await render(
      <PhoneInput
        label="Teléfono"
        regionCode="PE"
        callingCode="+51"
        value=""
        onChangeText={jest.fn()}
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();

    await rerender(
      <PhoneInput
        label="Teléfono"
        regionCode="PE"
        callingCode="+51"
        value=""
        onChangeText={jest.fn()}
        onPressCountry={onPressCountry}
        countryAccessibilityLabel="Cambiar país"
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Cambiar país' }));
    expect(onPressCountry).toHaveBeenCalledTimes(1);
  });

  it('muestra el error del campo', async () => {
    await render(
      <PhoneInput
        label="Teléfono"
        regionCode="PE"
        callingCode="+51"
        value="1"
        onChangeText={jest.fn()}
        error="Número incompleto"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Número incompleto');
  });
});

describe('OTPInput', () => {
  function ControlledOtp({ onComplete }: { onComplete: (code: string) => void }) {
    const [code, setCode] = useState('');
    return <OTPInput label="Código" value={code} onChange={setCode} onComplete={onComplete} />;
  }

  it('acepta solo dígitos, limita la longitud y avisa una vez al completarse', async () => {
    const onComplete = jest.fn();
    await render(<ControlledOtp onComplete={onComplete} />);
    const input = screen.getByLabelText('Código');

    await fireEvent.changeText(input, '6a2');
    // Las casillas son solo visuales (ocultas a lectores de pantalla): el campo accesible es el input.
    expect(input.props.value).toBe('62');
    expect(screen.getByText('6', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('2', { includeHiddenElements: true })).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();

    await fireEvent.changeText(input, '624918');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('6249');
  });

  it('admite pegar el código completo de una vez (autocompletado SMS)', async () => {
    const onComplete = jest.fn();
    await render(<ControlledOtp onComplete={onComplete} />);
    await fireEvent.changeText(screen.getByLabelText('Código'), '1234');
    expect(onComplete).toHaveBeenCalledWith('1234');
  });

  it('resalta la casilla del siguiente dígito solo mientras el campo tiene el foco', async () => {
    await render(<OTPInput label="Código" value="12" onChange={jest.fn()} testID="otp" />);
    const box = () => screen.getByTestId('otp-box-2', { includeHiddenElements: true });
    expect(box()).toHaveStyle({ borderColor: colors.borderNormal });

    await fireEvent(screen.getByLabelText('Código'), 'focus');
    expect(box()).toHaveStyle({ borderColor: colors.primary });
    expect(screen.getByTestId('otp-box-0', { includeHiddenElements: true })).toHaveStyle({
      borderColor: colors.borderNormal,
    });

    await fireEvent(screen.getByLabelText('Código'), 'blur');
    expect(box()).toHaveStyle({ borderColor: colors.borderNormal });
  });

  it('muestra el error como alerta', async () => {
    await render(
      <OTPInput label="Código" value="1111" onChange={jest.fn()} error="Código incorrecto" />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Código incorrecto');
  });
});

describe('RadioCard y RadioGroup', () => {
  it('anuncia el grupo y el estado de cada opción', async () => {
    const onSelect = jest.fn();
    await render(
      <RadioGroup label="Método de cobro">
        <RadioCard title="Digital Wallets" selected onSelect={jest.fn()} />
        <RadioCard title="Bank Transfer" badge="No Charge" selected={false} onSelect={onSelect} />
      </RadioGroup>,
    );
    // El grupo no es `accessible` (agruparía a sus hijos en iOS); se anuncia por rol y etiqueta.
    expect(screen.getByLabelText('Método de cobro').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByRole('radio', { name: 'Digital Wallets' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'Bank Transfer. No Charge' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('una opción no disponible no se puede elegir y anuncia el motivo', async () => {
    const onSelect = jest.fn();
    await render(
      <RadioCard
        title="Fawry"
        description="Cobra en tiendas"
        selected={false}
        onSelect={onSelect}
        disabled
        disabledReason="Not available"
      />,
    );
    const option = screen.getByRole('radio', { name: 'Fawry. Cobra en tiendas. Not available' });
    expect(option).toBeDisabled();
    await fireEvent.press(option);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
