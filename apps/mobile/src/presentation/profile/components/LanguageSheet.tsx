import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { useLanguage } from '@/presentation/i18n/useLanguage';
import { AppText } from '@/presentation/shared/components/AppText';
import { BottomSheet } from '@/presentation/shared/components/BottomSheet';
import { Button } from '@/presentation/shared/components/Button';
import { InfoBanner } from '@/presentation/shared/components/InfoBanner';
import { RadioCard, RadioGroup } from '@/presentation/shared/components/RadioCard';
import { colors } from '@/presentation/theme/tokens';

interface LanguageSheetProps {
  visible: boolean;
  onClose: () => void;
}

/** Bottom sheet "Cambiar idioma" del Perfil (COPAYNI-50): un idioma por cada JSON registrado. */
export function LanguageSheet({ visible, onClose }: LanguageSheetProps) {
  const { t } = useTranslation();
  return (
    <BottomSheet
      visible={visible}
      title={t('profile.language.title')}
      closeAccessibilityLabel={t('profile.language.close')}
      onClose={onClose}
      testID="language-sheet"
    >
      {/* Se monta en cada apertura: siempre parte del idioma activo. */}
      {visible && <LanguageForm onSaved={onClose} />}
    </BottomSheet>
  );
}

function LanguageForm({ onSaved }: { onSaved: () => void }) {
  const { t } = useTranslation();
  const { language, languages, changeLanguage } = useLanguage();
  const [selected, setSelected] = useState(language);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const direction = (code: string) => languages.find((entry) => entry.code === code)?.direction;
  const requiresRestart = direction(selected) !== direction(language);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await changeLanguage(selected);
      onSaved();
    } catch (cause) {
      setError(cause);
      setSaving(false);
    }
  };

  return (
    <>
      <RadioGroup label={t('profile.language.title')}>
        {languages.map(({ code, nativeName }) => (
          <RadioCard
            key={code}
            title={nativeName}
            selected={selected === code}
            onSelect={() => setSelected(code)}
            testID={`language-option-${code}`}
          />
        ))}
      </RadioGroup>
      {requiresRestart && <InfoBanner message={t('profile.language.restartNotice')} />}
      {error !== null && (
        <AppText accessibilityRole="alert" color={colors.error}>
          {errorMessage(t, error)}
        </AppText>
      )}
      <Button
        label={t('profile.language.save')}
        disabled={selected === language}
        loading={saving}
        onPress={save}
      />
    </>
  );
}
