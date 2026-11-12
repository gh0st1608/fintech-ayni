import type Ionicons from '@expo/vector-icons/Ionicons';
import IoniconsIcon from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, View } from 'react-native';

import {
  type AppNotification,
  type NotificationTab,
  type NotificationTarget,
  type NotificationType,
  targetOf,
} from '@/domain/notifications/Notification';
import { useFormatDate } from '@/presentation/formatters/formatDate';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import {
  useMarkNotificationsRead,
  useNotifications,
} from '@/presentation/notifications/useNotifications';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { EmptyState } from '@/presentation/shared/components/EmptyState';
import { Screen } from '@/presentation/shared/components/Screen';
import { SegmentedTabs } from '@/presentation/shared/components/SegmentedTabs';
import { colors, MIN_TOUCH_TARGET, radius, spacing } from '@/presentation/theme/tokens';

const ICONS = {
  installmentDueSoon: 'receipt-outline',
  installmentDueToday: 'alarm-outline',
  paymentReceived: 'checkmark-circle-outline',
  paymentFailed: 'alert-circle-outline',
  payoutTurn: 'cash-outline',
  payoutDisbursed: 'wallet-outline',
  documentApproved: 'shield-checkmark-outline',
  documentRejected: 'document-text-outline',
  circleStarted: 'play-circle-outline',
  circlePaused: 'pause-circle-outline',
  circleResumed: 'refresh-circle-outline',
  circleMemberJoined: 'person-add-outline',
} as const satisfies Record<NotificationType, React.ComponentProps<typeof Ionicons>['name']>;

type Group = 'today' | 'week' | 'earlier';

const DAY_MS = 86_400_000;

/** "Hoy", "Esta semana" (los 6 días anteriores) o "Anteriores", con la fecha del dispositivo. */
function groupOf(date: Date, now: Date): Group {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (date.getTime() >= startOfToday) return 'today';
  return date.getTime() >= startOfToday - 6 * DAY_MS ? 'week' : 'earlier';
}

/**
 * Bandeja de notificaciones (COPAYNI-84, Figma 2052:2373): pestañas Todas, Pagos y Círculos,
 * agrupadas por fecha. Tocar una la marca como leída y abre su pantalla.
 */
export function NotificationsScreen({
  onOpen,
  now = () => new Date(),
}: {
  onOpen: (target: NotificationTarget) => void;
  now?: () => Date;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<NotificationTab>('all');
  const notifications = useNotifications(tab);
  const markRead = useMarkNotificationsRead();
  const items = notifications.data?.pages.flatMap((page) => page.items) ?? [];
  const unread = notifications.data?.pages[0]?.unread ?? 0;

  const current = now();
  const sections = (['today', 'week', 'earlier'] as const)
    .map((group) => ({
      key: group,
      title: t(`notifications.groups.${group}`),
      data: items.filter((item) => groupOf(item.occurredAt, current) === group),
    }))
    .filter((section) => section.data.length > 0);

  const open = (notification: AppNotification) => {
    if (!notification.read) markRead.mutate([notification.id]);
    onOpen(targetOf(notification));
  };

  return (
    <Screen edges={['bottom']}>
      <View style={styles.header}>
        <SegmentedTabs
          options={[
            { key: 'all', label: t('notifications.tabs.all') },
            { key: 'payments', label: t('notifications.tabs.payments') },
            { key: 'circles', label: t('notifications.tabs.circles') },
          ]}
          selectedKey={tab}
          onChange={setTab}
          testID="notification-tabs"
        />
        {unread > 0 && (
          <Pressable
            accessibilityRole="button"
            onPress={() => markRead.mutate(null)}
            hitSlop={spacing.sm}
            style={styles.markAll}
          >
            <AppText weight="semibold" color={colors.primary}>
              {t('notifications.markAll')}
            </AppText>
          </Pressable>
        )}
      </View>
      {notifications.isPending ? (
        <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />
      ) : notifications.isError && items.length === 0 ? (
        <View style={styles.center}>
          <AppText accessibilityRole="alert" style={styles.centerText}>
            {errorMessage(t, notifications.error)}
          </AppText>
          <Button
            label={t('common.retry')}
            variant="secondary"
            onPress={() => void notifications.refetch()}
          />
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          title={t('notifications.emptyTitle')}
          description={t('notifications.emptyDescription')}
          testID="notifications-empty"
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <AppText variant="caption" weight="semibold" color={colors.neutral600}>
              {section.title}
            </AppText>
          )}
          renderItem={({ item }) => (
            <NotificationCard notification={item} now={current} onPress={() => open(item)} />
          )}
          onEndReached={() => {
            if (notifications.hasNextPage && !notifications.isFetchingNextPage) {
              void notifications.fetchNextPage();
            }
          }}
          ListFooterComponent={
            notifications.isFetchingNextPage ? (
              <ActivityIndicator accessibilityLabel={t('common.loading')} />
            ) : undefined
          }
        />
      )}
    </Screen>
  );
}

function NotificationCard({
  notification,
  now,
  onPress,
}: {
  notification: AppNotification;
  now: Date;
  onPress: () => void;
}) {
  const { t, i18n } = useTranslation();
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();
  const { type } = notification;
  const values = {
    amount: notification.amount ? formatMoney(notification.amount) : '',
    date: notification.dueOn ? formatDate(`${notification.dueOn}T12:00:00`, 'date') : '',
    document: t(`notifications.documents.${notification.documentType ?? 'additional'}`, {
      defaultValue: t('notifications.documents.additional'),
    }),
  };
  const title = t(`notifications.types.${type}.title`);
  const body = t(`notifications.types.${type}.body`, values);
  const when =
    groupOf(notification.occurredAt, now) === 'today'
      ? new Intl.DateTimeFormat(i18n.language, { hour: 'numeric', minute: '2-digit' }).format(
          notification.occurredAt,
        )
      : formatDate(notification.occurredAt, 'date');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${notification.read ? '' : `${t('notifications.unreadA11y')}. `}${title}. ${body}`}
      onPress={onPress}
      style={[styles.card, !notification.read && styles.unread]}
      testID={`notification-${notification.id}`}
    >
      <View style={styles.icon}>
        <IoniconsIcon name={ICONS[type]} size={20} color={colors.primary} />
      </View>
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <AppText weight="semibold" style={styles.title}>
            {title}
          </AppText>
          <AppText variant="caption" color={colors.neutral600}>
            {when}
          </AppText>
        </View>
        <AppText color={colors.textSecondary}>{body}</AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm },
  markAll: { alignSelf: 'flex-end', minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.m },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centerText: { textAlign: 'center' },
  card: {
    flexDirection: 'row',
    gap: spacing.m,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.secondary200,
    backgroundColor: colors.surface,
  },
  unread: { backgroundColor: colors.primary100, borderColor: colors.primary300 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary100,
  },
  text: { flex: 1, gap: spacing.xs },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  title: { flex: 1 },
});
