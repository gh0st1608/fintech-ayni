import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Text } from 'react-native';

import { Badge } from './Badge';
import { Card } from './Card';
import { EmptyState } from './EmptyState';
import { InfoBanner } from './InfoBanner';
import { ListItem } from './ListItem';
import { SegmentedTabs } from './SegmentedTabs';
import { Toggle } from './Toggle';

describe('Badge', () => {
  it('muestra la etiqueta', async () => {
    await render(<Badge label="No Charge" tone="primary" />);
    expect(screen.getByText('No Charge')).toBeTruthy();
  });
});

describe('Card', () => {
  it('sin onPress es un contenedor no interactivo', async () => {
    await render(
      <Card>
        <Text>contenido</Text>
      </Card>,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('contenido')).toBeTruthy();
  });

  it('con onPress se anuncia como botón con su estado de selección', async () => {
    const onPress = jest.fn();
    await render(
      <Card onPress={onPress} accessibilityLabel="Abril" selected>
        <Text>Abril</Text>
      </Card>,
    );
    const card = screen.getByRole('button', { name: 'Abril' });
    expect(card).toBeSelected();
    await fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('deshabilitada no responde al toque', async () => {
    const onPress = jest.fn();
    await render(
      <Card onPress={onPress} accessibilityLabel="Marzo" disabled>
        <Text>Marzo</Text>
      </Card>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Marzo' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('ListItem', () => {
  it('anuncia título y descripción y navega al pulsarse', async () => {
    const onPress = jest.fn();
    await render(
      <ListItem
        title="National ID"
        description="Sube una foto"
        icon="card-outline"
        onPress={onPress}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'National ID. Sube una foto' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('sin onPress no es un botón', async () => {
    await render(<ListItem title="Contract" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('deshabilitado no ejecuta la acción', async () => {
    const onPress = jest.fn();
    await render(<ListItem title="Get Help" onPress={onPress} disabled />);
    const item = screen.getByRole('button', { name: 'Get Help' });
    expect(item).toBeDisabled();
    await fireEvent.press(item);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('acepta un contenido personalizado a la derecha', async () => {
    await render(<ListItem title="Utility Bill" trailing={<Badge label="New" tone="success" />} />);
    expect(screen.getByText('New')).toBeTruthy();
  });
});

describe('Toggle', () => {
  function ControlledToggle() {
    const [value, setValue] = useState(false);
    return <Toggle label="Deduct pay-in" value={value} onValueChange={setValue} />;
  }

  it('cambia su estado y se anuncia como switch', async () => {
    await render(<ControlledToggle />);
    const toggle = screen.getByRole('switch', { name: 'Deduct pay-in' });
    expect(toggle).not.toBeChecked();
    await fireEvent(toggle, 'valueChange', true);
    expect(screen.getByRole('switch', { name: 'Deduct pay-in' })).toBeChecked();
  });
});

describe('SegmentedTabs', () => {
  const options = [
    { key: 'active', label: 'Active' },
    { key: 'finished', label: 'Finished' },
  ] as const;

  it('marca la pestaña seleccionada y notifica el cambio', async () => {
    const onChange = jest.fn();
    await render(<SegmentedTabs options={options} selectedKey="active" onChange={onChange} />);
    expect(screen.getByRole('tab', { name: 'Active' })).toBeSelected();
    await fireEvent.press(screen.getByRole('tab', { name: 'Finished' }));
    expect(onChange).toHaveBeenCalledWith('finished');
  });

  it('no notifica al pulsar la pestaña ya seleccionada', async () => {
    const onChange = jest.fn();
    await render(<SegmentedTabs options={options} selectedKey="active" onChange={onChange} />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Active' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('EmptyState', () => {
  it('muestra título, descripción y acción', async () => {
    const onPress = jest.fn();
    await render(
      <EmptyState
        title="Sin pagos"
        description="Aparecerán aquí"
        action={{ label: 'Unirme', onPress }}
      />,
    );
    expect(screen.getByText('Sin pagos')).toBeTruthy();
    expect(screen.getByText('Aparecerán aquí')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Unirme' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('la acción es opcional', async () => {
    await render(<EmptyState title="Sin tarjetas" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('InfoBanner', () => {
  it('muestra el mensaje y el enlace opcional', async () => {
    const onPress = jest.fn();
    await render(
      <InfoBanner message="Las Admin Fees se reparten" link={{ label: 'Learn More', onPress }} />,
    );
    expect(screen.getByText('Las Admin Fees se reparten')).toBeTruthy();
    await fireEvent.press(screen.getByRole('link', { name: 'Learn More' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('sin enlace no expone acciones', async () => {
    await render(<InfoBanner message="Aviso" />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
