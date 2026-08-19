import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Package, Search as SearchIcon, Send, User } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { greetingForNow } from '@/data/mock';
import { dueSoonForHome } from '@/lib/attention';
import { useInventory } from '@/lib/InventoryContext';
import { useLastDone } from '@/lib/LastDoneContext';
import { useHousehold } from '@/lib/HouseholdContext';
import { useExpenses } from '@/lib/ExpensesContext';
import { useHabits } from '@/lib/HabitsContext';
import { useClasses } from '@/lib/ClassesContext';
import { useSubscriptions } from '@/lib/SubscriptionsContext';
import {
  HABIT_CATEGORIES,
  completionRate,
  currentStreak,
  dayKey,
  loggedOn,
} from '@/lib/habits';
import { getLastDoneAt } from '@/lib/lastDone';
import { remainingCount, usedCount } from '@/lib/classes';
import { ChatAgentError, runChatAgent } from '@/lib/chat/agent';
import { applyChatActions } from '@/lib/chat/applyActions';
import { composeAppliedReply } from '@/lib/chat/composeReply';
import { isCloseTalkIntent, resolveLocalIntent } from '@/lib/chat/localIntents';
import { resolveOpenItemId } from '@/lib/chat/openItem';
import { hrefForTalkFocus, type TalkFocus } from '@/lib/chat/focus';
import type { ChatMessage } from '@/lib/chat/types';
import { useTalkOverlay } from '@/lib/TalkOverlayContext';
import { getHouseholdPeople, selfAvatarInitial } from '@/lib/people';
import { loadLocalProfile } from '@/lib/profile';
import { blurActiveElement } from '@/lib/a11y';
import { fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';
import { HomeSurfaceSwitch } from '@/components/HomeSurfaceSwitch';
import { saveHomeSurface } from '@/lib/homeSurface';

type UiMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Optional — only when an item was added this turn */
  itemId?: string;
};

const DOCK_CLEARANCE = 88;

const STARTER_PROMPTS = [
  'I got a coffee machine',
  'I walked today',
  'I enrolled for swimming',
  'When does my passport expire?',
];

export default function ChatScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const listRef = useRef<FlatList<UiMessage>>(null);
  const { talkFocus, setTalkFocus, focusItemId, focusExpenseId } =
    useTalkOverlay();
  const focusItemIdRef = useRef<string | null>(focusItemId);
  focusItemIdRef.current = focusItemId;
  const focusExpenseIdRef = useRef<string | null>(focusExpenseId);
  focusExpenseIdRef.current = focusExpenseId;
  const talkFocusRef = useRef<TalkFocus | null>(talkFocus);
  talkFocusRef.current = talkFocus;
  const { items, addItem, updateItem, removeItem, getById } = useInventory();
  const { items: lastDoneItems, logDone, setReminder, remove: removeLastDone } = useLastDone();
  const { members: householdMembers } = useHousehold();
  const { expenses, addExpense, updateExpense, removeExpense, getById: getExpenseById } = useExpenses();
  const { habits, addHabit, checkIn, findByTitle, getById: getHabitById, updateHabit, removeHabit } = useHabits();
  const { packs: classPacks, addPack, logClass, findPack, pickAttendance, getById: getClassPack, newestPack, removePack, updatePack } = useClasses();
  const { subscriptions, addSubscription, updateSubscription, removeSubscription, getById: getSubscriptionById } = useSubscriptions();
  const householdPeople = useMemo(
    () => getHouseholdPeople(householdMembers),
    [householdMembers]
  );
  const [profileName, setProfileName] = useState('');
  useFocusEffect(
    useCallback(() => {
      void saveHomeSurface('ask');
      void loadLocalProfile().then((p) => setProfileName(p.displayName));
    }, [])
  );
  const avatarLetter = selfAvatarInitial(profileName, householdMembers);
  const expenseSummary = useMemo(
    () =>
      expenses.map((e) => ({
        id: e.id,
        title: e.title,
        amount: e.amount,
        currency: e.currency,
        category: e.category,
        date: e.date,
        merchant: e.merchant,
        personId: e.personId,
      })),
    [expenses]
  );
  const habitSummary = useMemo(
    () =>
      habits.map((h) => ({
        id: h.id,
        title: h.title,
        category: HABIT_CATEGORIES[h.categoryId].name,
        streak: currentStreak(h),
        doneToday: loggedOn(h, dayKey()),
        rate30: completionRate(h, 30),
        assignedTo: h.assignedTo,
        personId: h.personId,
      })),
    [habits]
  );
  const classPackSummary = useMemo(
    () =>
      [...classPacks]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((p) => ({
        id: p.id,
        title: p.title,
        assignedTo: p.assignedTo,
        personId: p.personId,
        total: p.total,
        used: usedCount(p),
        remaining: remainingCount(p) ?? undefined,
        startsOn: p.startsOn,
        endsOn: p.endsOn,
      })),
    [classPacks]
  );
  const subscriptionSummary = useMemo(
    () =>
      subscriptions.map((s) => ({
        id: s.id,
        title: s.title,
        amount: s.amount,
        currency: s.currency,
        cycle: s.cycle,
        renewsOn: s.renewsOn,
        category: s.category,
        provider: s.provider,
        personId: s.personId,
      })),
    [subscriptions]
  );
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: `${greetingForNow()}. Add a thing, check in a habit, log a class, or ask about a document.`,
    },
  ]);

  const inventory = useMemo(
    () =>
      items.map((i) => ({
        id: i.id,
        name: i.name,
        brand: i.brand,
        room: i.room,
        category: i.category,
        price: i.price,
        purchasedFrom: i.purchasedFrom,
        purchaseDate: i.purchaseDate,
        warrantyExpiry: i.warrantyExpiry,
        expiryDate: i.expiryDate,
        warrantyActive: i.warrantyActive,
        serial: i.serial,
        assignedTo: i.assignedTo,
        createdAt: i.createdAt,
        timeline: i.timeline,
      })),
    [items]
  );

  const lastDone = useMemo(
    () =>
      lastDoneItems.map((i) => ({
        id: i.id,
        label: i.label,
        lastDoneAt: getLastDoneAt(i),
        remindAt: i.remindAt,
        inventoryItemId: i.inventoryItemId,
        itemName: i.inventoryItemId
          ? items.find((x) => x.id === i.inventoryItemId)?.name
          : undefined,
        assignedTo: i.assignedTo,
      })),
    [lastDoneItems, items]
  );

  const topAttention = useMemo(() => {
    return dueSoonForHome(items, lastDoneItems, subscriptions, classPacks);
  }, [items, lastDoneItems, subscriptions, classPacks]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true);

    const userMsg: UiMessage = { id: `u-${Date.now()}`, role: 'user', text: question };
    const threadForApi: ChatMessage[] = [
      ...messages
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({ role: m.role, content: m.text })),
      { role: 'user', content: question },
    ];

    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    try {
      const newestId = items[0]?.id ?? null;
      // Ask keeps close/exit for the model; Talk overlay handles dismiss locally.
      const local = resolveLocalIntent(question, {
        focusItemId: focusItemIdRef.current,
        fallbackItemId: newestId,
        focusExpenseId: focusExpenseIdRef.current,
        talkFocus: talkFocusRef.current,
      });
      const useLocal = local && !isCloseTalkIntent(question);
      const result =
        useLocal
          ? local
          : await runChatAgent({
              messages: threadForApi,
              inventory,
              lastDone,
              expenses: expenseSummary,
              habits: habitSummary,
              classPacks: classPackSummary,
              subscriptions: subscriptionSummary,
              session: {
                focusItemId: focusItemIdRef.current,
                focusExpenseId: focusExpenseIdRef.current,
                focus: talkFocusRef.current,
              },
              household: householdPeople,
            });
      const applied = await applyChatActions(
        result.actions,
        { addItem, updateItem, removeItem },
        'talk',
        {
          fallbackFocusId: focusItemIdRef.current || newestId,
          resolveItem: (id) => getById(id),
          lastUserText: question,
          lastDone: { logDone, setReminder, remove: removeLastDone },
          household: householdMembers,
          expenses: {
            addExpense,
            updateExpense,
            removeExpense,
            getById: getExpenseById,
          },
          expensesList: expenseSummary.map((e) => ({
            id: e.id,
            title: e.title,
            merchant: e.merchant,
          })),
          subscriptions: {
            addSubscription,
            updateSubscription,
            removeSubscription,
            getById: getSubscriptionById,
          },
          subscriptionsList: subscriptionSummary.map((s) => ({
            id: s.id,
            title: s.title,
          })),
          habits: {
            addHabit,
            updateHabit,
            removeHabit,
            checkIn,
            findByTitle,
            getById: getHabitById,
          },
          habitsList: habitSummary.map((h) => ({
            id: h.id,
            title: h.title,
          })),
          classes: {
            addPack,
            logClass,
            findPack,
            pickAttendance,
            getById: getClassPack,
            newestPack,
            removePack,
            updatePack,
          },
          classPacksList: classPackSummary.map((p) => ({
            id: p.id,
            title: p.title,
          })),
          lastDoneList: lastDone
            .filter((d) => d.id)
            .map((d) => ({ id: d.id as string, label: d.label })),
          inventoryList: items.map((i) => ({ id: i.id, name: i.name })),
          lastFocusExpenseId: focusExpenseIdRef.current,
          lastTalkFocus: talkFocusRef.current,
        }
      );
      if (applied.talkFocus) setTalkFocus(applied.talkFocus);
      else if (applied.clearedFocus) setTalkFocus(null);

      const spoken = composeAppliedReply({
        actions: result.actions,
        modelReply: result.reply,
        addedName: applied.lastAddedName,
        assignedTo: applied.lastAssignedTo,
        removedNames: applied.removedNames,
        loggedDoneLabel: applied.loggedDoneLabel,
        loggedExpenseTitle: applied.loggedExpenseTitle,
        loggedExpenseAmount: applied.loggedExpenseAmount,
        loggedExpenseMerchant: applied.loggedExpenseMerchant,
        updatedExpense: applied.updatedExpense,
        updatedIds: applied.updatedIds,
        openExpenseId: applied.openExpenseId,
        openItemId: applied.openItemId,
        openTarget: applied.openTarget,
        removedExpenseTitle: applied.removedExpenseTitle,
        loggedSubscriptionTitle: applied.loggedSubscriptionTitle,
        loggedSubscriptionAmount: applied.loggedSubscriptionAmount,
        updatedSubscription: applied.updatedSubscription,
        removedSubscriptionTitle: applied.removedSubscriptionTitle,
        removedHabitTitle: applied.removedHabitTitle,
        removedClassTitle: applied.removedClassTitle,
        habitCheckInTitle: applied.habitCheckInTitle,
        habitStreak: applied.habitStreak,
        habitCheckInDays: applied.habitCheckInDays,
        classPackTitle: applied.classPackTitle,
        classPackRemaining: applied.classPackRemaining,
        classPackTotal: applied.classPackTotal,
        classLoggedTitle: applied.classLoggedTitle,
        classLogAttemptFor: applied.classLogAttemptFor,
        reminderLabel: applied.reminderLabel,
        reminderAt: applied.reminderAt,
        removedLastDoneLabel: applied.removedLastDoneLabel,
        updatedClassPack: applied.updatedClassPack,
      });

      if (applied.openTarget) {
        router.push(hrefForTalkFocus(applied.openTarget) as Href);
      } else if (applied.openExpenseId) {
        router.push(`/expenses/${applied.openExpenseId}` as Href);
      } else {
        const openId = resolveOpenItemId({
          actions: result.actions,
          openItemId: applied.openItemId,
          focusItemId:
            applied.focusItemId || applied.lastAddedId || focusItemIdRef.current,
          inventoryIds: [
            ...(applied.lastAddedId ? [applied.lastAddedId] : []),
            ...items.map((i) => i.id),
          ],
        });

        if (openId) {
          router.push(`/asset/${openId}` as Href);
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: spoken,
          itemId: applied.lastAddedId ?? undefined,
        },
      ]);
    } catch (err) {
      const text =
        err instanceof ChatAgentError
          ? err.message
          : 'Something went wrong talking to LifeOS. Try again in a moment.';
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', text },
      ]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1, width: '100%' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.brand, { color: colors.mute }]}>LifeOS</Text>
            <View style={styles.switchRow}>
              <HomeSurfaceSwitch value="ask" />
            </View>
          </View>
          <Pressable
            onPress={() => {
              blurActiveElement();
              router.push('/(tabs)/search' as Href);
            }}
            hitSlop={8}
            style={styles.iconBtn}
            accessibilityLabel="Search"
          >
            <SearchIcon size={20} color={colors.slate} strokeWidth={1.8} />
          </Pressable>
          <Pressable
            onPress={() => {
              blurActiveElement();
              router.push('/(tabs)/spaces' as Href);
            }}
            hitSlop={8}
            style={styles.iconBtn}
            accessibilityLabel="Things"
          >
            <Package size={20} color={colors.slate} strokeWidth={1.8} />
          </Pressable>
          <Pressable
            onPress={() => {
              blurActiveElement();
              router.push('/profile' as Href);
            }}
            style={[styles.avatar, { backgroundColor: colors.ink }]}
            accessibilityLabel="Profile"
          >
            {avatarLetter ? (
              <Text style={[styles.avatarLetter, { color: colors.onInk }]}>{avatarLetter}</Text>
            ) : (
              <User size={14} color={colors.onInk} strokeWidth={1.8} />
            )}
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          style={styles.list}
          contentContainerStyle={styles.thread}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListHeaderComponent={
            topAttention.length ? (
              <View style={[styles.attentionBlock, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <Text style={[styles.attentionLabel, { color: colors.mute }]}>Due soon</Text>
                {topAttention.map((a) => (
                  <Pressable
                    key={a.id}
                    onPress={() => {
                      if (a.href) router.push(a.href as Href);
                    }}
                    style={styles.attentionRow}
                  >
                    <View
                      style={[
                        styles.dot,
                        a.urgency === 'urgent' && { backgroundColor: colors.coral },
                        a.urgency === 'soon' && { backgroundColor: colors.amber },
                        (a.urgency === 'ok' || a.urgency === 'info') && {
                          backgroundColor: colors.accent,
                        },
                      ]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.attentionTitle, { color: colors.ink }]}>{a.title}</Text>
                      <Text style={[styles.attentionSub, { color: colors.mute }]}>{a.subtitle}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null
          }
          ListFooterComponent={
            <>
              {busy ? (
                <View style={styles.typing}>
                  <ActivityIndicator color={colors.accent} size="small" />
                  <Text style={[styles.typingText, { color: colors.mute }]}>Thinking…</Text>
                </View>
              ) : null}
              {messages.length <= 1 && !busy ? (
                <View style={styles.prompts}>
                  {STARTER_PROMPTS.map((s) => (
                    <Pressable key={s} onPress={() => void ask(s)} style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                      <Text style={[styles.chipText, { color: colors.slate }]}>{s}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </>
          }
          renderItem={({ item: m }) => (
            <View
              style={[
                styles.bubbleRow,
                m.role === 'user' ? styles.bubbleRowUser : styles.bubbleRowAssistant,
              ]}
            >
              <View
                style={[
                  styles.bubble,
                  m.role === 'user'
                    ? { maxWidth: '88%', backgroundColor: colors.accent }
                    : {
                        width: '100%',
                        backgroundColor: colors.surface,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: colors.line,
                      },
                ]}
              >
                <Text
                  style={[
                    styles.bubbleText,
                    { color: m.role === 'user' ? colors.accentOn : colors.ink },
                  ]}
                >
                  {m.text}
                </Text>
                {m.itemId ? (
                  <Pressable
                    onPress={() => router.push(`/asset/${m.itemId}` as Href)}
                    style={styles.openItem}
                    hitSlop={6}
                  >
                    <Text style={[styles.openItemText, { color: colors.accent }]}>Open item</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          )}
        />

        <View
          style={[
            styles.composer,
            { paddingBottom: Math.max(insets.bottom, 8) + DOCK_CLEARANCE },
          ]}
        >
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="What’s new, or what should I look up…"
            placeholderTextColor={colors.faint}
            style={[
              styles.input,
              {
                color: colors.ink,
                backgroundColor: colors.surface,
                borderColor: colors.line,
              },
            ]}
            onSubmitEditing={() => void ask(input)}
            returnKeyType="send"
            editable={!busy}
          />
          <Pressable
            onPress={() => void ask(input)}
            disabled={busy || !input.trim()}
            style={({ pressed }) => [
              styles.send,
              { backgroundColor: colors.accent },
              (busy || !input.trim()) && { opacity: 0.45 },
              pressed && { opacity: 0.9 },
            ]}
            accessibilityLabel="Send"
          >
            <Send size={18} color={colors.accentOn} strokeWidth={2.2} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  brand: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
  switchRow: {
    marginTop: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
  attentionBlock: {
    marginBottom: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  attentionLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  attentionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  attentionTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
  attentionSub: {
    marginTop: 2,
    fontFamily: fonts.sans,
    fontSize: 16,
  },
  list: {
    flex: 1,
    width: '100%',
  },
  thread: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    flexGrow: 1,
    width: '100%',
    alignSelf: 'stretch',
  },
  bubbleRow: {
    width: '100%',
    marginBottom: spacing.sm,
  },
  bubbleRowUser: {
    alignItems: 'flex-end',
  },
  bubbleRowAssistant: {
    alignItems: 'stretch',
  },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  bubbleText: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 23,
  },
  openItem: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  openItemText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
  typing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  typingText: {
    fontFamily: fonts.sans,
    fontSize: 16,
  },
  prompts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: spacing.lg,
    width: '100%',
  },
  chip: {
    flexGrow: 1,
    flexBasis: '46%',
    justifyContent: 'center',
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 23,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingTop: 10,
  },
  input: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 16,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
