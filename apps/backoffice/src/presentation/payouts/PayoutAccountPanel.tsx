import { useState } from 'react';

import { MAX_REASON_LENGTH } from '@/application/usecases';
import {
  ACCOUNT_TYPE_LABELS,
  BANK_ACCOUNT_TYPES,
  type BankAccountType,
  KIND_LABELS,
  PAYOUT_ACCOUNT_KINDS,
  type PayoutAccount,
  type PayoutAccountKind,
  WALLET_LABELS,
  WALLET_PROVIDERS,
  type WalletProvider,
} from '@/domain/payouts/PayoutAccount';
import { AppError } from '@/domain/shared/AppError';
import { can } from '@/domain/staff/Staff';

import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorAlert,
  Field,
  inputClass,
  Spinner,
} from '../components/ui';
import { formatDateTime } from '../format';
import { useSession, useStaff } from '../providers/AppProviders';
import { usePayoutAccounts, useRegisterPayoutAccount } from '../users/useUsers';

/**
 * Cuenta de cobro de la persona (COPAYNI-81): la vigente, el historial y, para Operaciones, el
 * registro con la constancia que envió la persona. Nunca se muestra el número completo.
 */
export function PayoutAccountPanel({ userId }: { userId: string }) {
  const staff = useStaff();
  const accounts = usePayoutAccounts(userId);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  if (!can(staff, 'payouts.read')) return null;
  const canRegister = can(staff, 'payouts.register');

  return (
    <section aria-labelledby="payout-account" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="payout-account" className="text-lg font-semibold">
          Cuenta de cobro
        </h2>
        {canRegister && accounts.isSuccess && (
          <Button
            variant="secondary"
            onClick={() => {
              setDone(null);
              setOpen(true);
            }}
          >
            {accounts.data.current ? 'Cambiar cuenta' : 'Registrar cuenta'}
          </Button>
        )}
      </div>
      {done && (
        <p role="status" className="text-sm text-success">
          {done}
        </p>
      )}
      {accounts.isPending && <Spinner label="Cargando la cuenta de cobro" />}
      {accounts.isError && (
        <ErrorAlert error={accounts.error} onRetry={() => void accounts.refetch()} />
      )}
      {accounts.isSuccess && (
        <>
          {accounts.data.current ? (
            <AccountCard account={accounts.data.current} />
          ) : (
            <EmptyState
              title="Sin cuenta de cobro"
              description="La persona no podrá recibir su pozo hasta que se registre una."
            />
          )}
          {accounts.data.history.length > 1 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-ink-soft">
                Cuentas anteriores ({accounts.data.history.length - 1})
              </summary>
              <ul className="mt-2 flex flex-col gap-2">
                {accounts.data.history
                  .filter((account) => account.replacedAt !== null)
                  .map((account) => (
                    <li key={account.id}>
                      <AccountCard account={account} />
                    </li>
                  ))}
              </ul>
            </details>
          )}
          {open && (
            <RegisterDialog
              userId={userId}
              banks={accounts.data.banks}
              onClose={() => setOpen(false)}
              onDone={(account) => {
                setOpen(false);
                setDone(`Se registró ${account.label}.`);
              }}
            />
          )}
        </>
      )}
    </section>
  );
}

function AccountCard({ account }: { account: PayoutAccount }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface p-3">
      <div>
        <p className="font-medium">{account.label}</p>
        <p className="text-xs text-ink-soft">
          {account.accountType
            ? `${KIND_LABELS[account.kind]} de ${ACCOUNT_TYPE_LABELS[account.accountType].toLowerCase()}`
            : KIND_LABELS[account.kind]}{' '}
          · Titular: {account.holderName}
        </p>
        <p className="text-xs text-ink-soft">
          Registrada el {formatDateTime(account.registeredAt)} por{' '}
          {account.registeredByEmail ?? account.registeredBy}
          {account.replacedAt && ` · Reemplazada el ${formatDateTime(account.replacedAt)}`}
        </p>
      </div>
      <Badge tone={account.replacedAt ? 'neutral' : 'success'}>
        {account.replacedAt ? 'Reemplazada' : 'Vigente'}
      </Badge>
    </div>
  );
}

function RegisterDialog({
  userId,
  banks,
  onClose,
  onDone,
}: {
  userId: string;
  banks: Record<string, string>;
  onClose: () => void;
  onDone: (account: PayoutAccount) => void;
}) {
  const register = useRegisterPayoutAccount(userId);
  const { signOut } = useSession();
  const [kind, setKind] = useState<PayoutAccountKind>('bank_account');
  const [bankCode, setBankCode] = useState('');
  const [accountType, setAccountType] = useState<BankAccountType>('savings');
  const [cci, setCci] = useState('');
  const [provider, setProvider] = useState<WalletProvider>('yape');
  const [phone, setPhone] = useState('');
  const [holderName, setHolderName] = useState('');
  const [reason, setReason] = useState('');
  const error = register.error;
  const stepUp = error instanceof AppError && error.kind === 'step_up_required';

  const submit = () => {
    const form =
      kind === 'bank_account'
        ? { kind, bankCode, accountType, cci, holderName }
        : { kind, provider, phone, holderName };
    register.mutate({ form, reason }, { onSuccess: onDone });
  };

  return (
    <Dialog open title="Registrar la cuenta de cobro" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <p className="text-sm">
          Usa la constancia que envió la persona. La cuenta tiene que estar a su nombre y en soles.
          Pide una autenticación reciente.
        </p>
        <div role="radiogroup" aria-label="Tipo de cuenta" className="flex gap-2">
          {PAYOUT_ACCOUNT_KINDS.map((option) => (
            <Button
              key={option}
              role="radio"
              aria-checked={kind === option}
              variant={kind === option ? 'primary' : 'secondary'}
              onClick={() => setKind(option)}
            >
              {KIND_LABELS[option]}
            </Button>
          ))}
        </div>
        {kind === 'bank_account' ? (
          <>
            <Field label="Banco">
              {(field) => (
                <select
                  {...field}
                  className={inputClass}
                  value={bankCode}
                  onChange={(event) => setBankCode(event.target.value)}
                >
                  <option value="">Elige el banco</option>
                  {Object.entries(banks).map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Tipo de cuenta">
              {(field) => (
                <select
                  {...field}
                  className={inputClass}
                  value={accountType}
                  onChange={(event) => setAccountType(event.target.value as BankAccountType)}
                >
                  {BANK_ACCOUNT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {ACCOUNT_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="CCI" hint="20 dígitos. Se guarda cifrado y no se vuelve a mostrar.">
              {(field) => (
                <input
                  {...field}
                  className={inputClass}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={32}
                  value={cci}
                  onChange={(event) => setCci(event.target.value)}
                />
              )}
            </Field>
          </>
        ) : (
          <>
            <Field label="Billetera">
              {(field) => (
                <select
                  {...field}
                  className={inputClass}
                  value={provider}
                  onChange={(event) => setProvider(event.target.value as WalletProvider)}
                >
                  {WALLET_PROVIDERS.map((option) => (
                    <option key={option} value={option}>
                      {WALLET_LABELS[option]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Celular" hint="9 dígitos. Se guarda cifrado.">
              {(field) => (
                <input
                  {...field}
                  className={inputClass}
                  inputMode="tel"
                  autoComplete="off"
                  maxLength={16}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              )}
            </Field>
          </>
        )}
        <Field label="Titular" hint="Como figura en el banco o la billetera.">
          {(field) => (
            <input
              {...field}
              className={inputClass}
              autoComplete="off"
              maxLength={160}
              value={holderName}
              onChange={(event) => setHolderName(event.target.value)}
            />
          )}
        </Field>
        <Field label="Motivo" hint="Queda en la auditoría junto con tu usuario.">
          {(field) => (
            <textarea
              {...field}
              className={inputClass}
              rows={2}
              maxLength={MAX_REASON_LENGTH}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </Field>
        {register.isError && <ErrorAlert error={error} />}
        <div className="flex justify-end gap-2">
          {stepUp ? (
            <Button onClick={signOut}>Volver a iniciar sesión</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" loading={register.isPending}>
                Registrar
              </Button>
            </>
          )}
        </div>
      </form>
    </Dialog>
  );
}
