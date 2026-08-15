import { useMemo, useRef, useState } from 'react';
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
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Package, Search as SearchIcon, Send } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { greetingForNow, user } from '@/data/mock';
import { dueSoonForHome } from '@/lib/attention';
import { useInventory } from '@/lib/InventoryContext';
import { useLastDone } from '@/lib/LastDoneContext';
import { useHousehold } from '@/lib/HouseholdContext';
import { useExpenses } from '@/lib/ExpensesContext';
import { useHabits } from '@/lib/HabitsContext';
import { useSubscriptions } from '@/lib/SubscriptionsContext';
import {
  HABIT_CATEGORIES,
  completionRate,
  currentStreak,
  dayKey,
  loggedOn,
} from '@/lib/habits';
import { getLastDoneAt } from '@/lib/lastDone';
import { ChatAgentError, runChatAgent } from '@/lib/chat/agent';
import { applyChatActions } from '@/lib/chat/applyActions';
import { composeAppliedReply } from '@/lib/chat/composeReply';
import { isCloseTalkIntent, resolveLocalIntent } from '@/lib/chat/localIntents';
import { resolveOpenItemId } from '@/lib/chat/openItem';
import type { ChatMessage } from '@/lib/chat/types';
import { useTalkOverlay } from '@/lib/TalkOverlayContext';
import { getHouseholdPeople } from '@/lib/people';
import { blurActiveElement } from '@/lib/a11y';
import { colors, fonts, radius, spacing } from '@/constants/theme';

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
  'I bought headphones',
  'What’s in my kitchen?',
  'Where’s my passport?',
];

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const listRef = useRef<FlatList<UiMessage>>(null);
  const { focusItemId, setFocusItemId } = useTalkOverlay();
  const focusItemIdRef = useRef<string | null>(focusItemId);
  focusItemIdRef.current = focusItemId;
  const { items, addItem, updateItem, removeItem, getById } = useInventory();
  const { items: lastDoneItems, logDone } = useLastDone();
  const { members: householdMembers } = useHousehold();
  const { expenses, addExpense } = useExpenses();
  const { habits, addHabit, checkIn, findByTitle, getById: getHabitById, updateHabit } = useHabits();
  const { subscriptions, addSubscription } = useSubscriptions();
  const householdPeople = useMemo(
    () => getHouseholdPeople(householdMembers),
    [householdMembers]
  );
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
      })),
    [habits]
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
      })),
    [subscriptions]
  );
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: `${greetingForNow()}. Tell me what you got, or ask about something you own — I’ll keep the conversation going.`,
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
        label: i.label,
        lastDoneAt: getLastDoneAt(i),
        remindAt: i.remindAt,
        inventoryItemId: i.inventoryItemId,
        itemName: i.inventoryItemId
          ? items.find((x) => x.id === i.inventoryItemId)?.name
          : undefined,
      })),
    [lastDoneItems, items]
  );

  const topAttention = useMemo(() => {
    return dueSoonForHome(items, lastDoneItems, subscriptions);
  }, [items, lastDoneItems, subscriptions]);

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
              subscriptions: subscriptionSummary,
              session: { focusItemId: focusItemIdRef.current },
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
          lastDone: { logDone },
          household: householdMembers,
          expenses: { addExpense },
          subscriptions: { addSubscription },
          habits: {
            addHabit,
            updateHabit,
            checkIn,
            findByTitle,
            getById: getHabitById,
          },
        }
      );
      if (applied.clearedFocus) setFocusItemId(null);
      else if (applied.focusItemId || applied.lastAddedId) {
        setFocusItemId(applied.focusItemId || applied.lastAddedId);
      }

      const spoken = composeAppliedReply({
        actions: result.actions,
        modelReply: result.reply,
        addedName: applied.lastAddedName,
        assignedTo: applied.lastAssignedTo,
        removedNames: applied.removedNames,
        loggedDoneLabel: applied.loggedDoneLabel,
        loggedExpenseTitle: applied.loggedExpenseTitle,
        loggedExpenseAmount: applied.loggedExpenseAmount,
        loggedSubscriptionTitle: applied.loggedSubscriptionTitle,
        loggedSubscriptionAmount: applied.loggedSubscriptionAmount,
        habitCheckInTitle: applied.habitCheckInTitle,
        habitStreak: applied.habitStreak,
        habitCheckInDays: applied.habitCheckInDays,
      });

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

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: spoken,
          itemId: applied.lastAddedId ?? openId ?? undefined,
        },
      ]);

      if (openId) {
        router.push(`/asset/${openId}` as Href);
      }
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
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.brand}>LifeOS</Text>
            <Text style={styles.subtitle}>Ask</Text>
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
            style={styles.avatar}
            accessibilityLabel="Profile"
          >
            <Text style={styles.avatarLetter}>{user.firstName.slice(0, 1)}</Text>
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.thread}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListHeaderComponent={
            topAttention.length ? (
              <View style={styles.attentionBlock}>
                <Text style={styles.attentionLabel}>Due soon</Text>
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
                          backgroundColor: colors.forest,
                        },
                      ]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.attentionTitle}>{a.title}</Text>
                      <Text style={styles.attentionSub}>{a.subtitle}</Text>
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
                  <ActivityIndicator color={colors.forest} size="small" />
                  <Text style={styles.typingText}>Thinking…</Text>
                </View>
              ) : null}
              {messages.length <= 1 && !busy ? (
                <View style={styles.prompts}>
                  {STARTER_PROMPTS.map((s) => (
                    <Pressable key={s} onPress={() => void ask(s)} style={styles.chip}>
                      <Text style={styles.chipText}>{s}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </>
          }
          renderItem={({ item: m }) => (
            <View
              style={[
                styles.bubble,
                m.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
              ]}
            >
              <Text
                style={[
                  styles.bubbleText,
                  m.role === 'user' && { color: colors.forestOn },
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
                  <Text style={styles.openItemText}>Open item</Text>
                </Pressable>
              ) : null}
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
            style={styles.input}
            onSubmitEditing={() => void ask(input)}
            returnKeyType="send"
            editable={!busy}
          />
          <Pressable
            onPress={() => void ask(input)}
            disabled={busy || !input.trim()}
            style={({ pressed }) => [
              styles.send,
              (busy || !input.trim()) && { opacity: 0.45 },
              pressed && { opacity: 0.9 },
            ]}
            accessibilityLabel="Send"
          >
            <Send size={18} color={colors.forestOn} strokeWidth={2.2} />
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
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  brand: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.mute,
  },
  subtitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 22,
    letterSpacing: -0.4,
    color: colors.ink,
    marginTop: 10,
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
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.white,
  },
  attentionBlock: {
    marginBottom: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: spacing.md,
  },
  attentionLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.mute,
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
    backgroundColor: colors.amber,
  },
  attentionTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.ink,
  },
  attentionSub: {
    marginTop: 2,
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.mute,
  },
  thread: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    flexGrow: 1,
  },
  bubble: {
    maxWidth: '88%',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: colors.forest,
  },
  bubbleAssistant: {
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  bubbleText: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 23,
    color: colors.ink,
  },
  openItem: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  openItemText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.forest,
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
    fontSize: 13,
    color: colors.mute,
  },
  prompts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: spacing.lg,
  },
  chip: {
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.slate,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.xl,
    paddingTop: 10,
  },
  input: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.white,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
