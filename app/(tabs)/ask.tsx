import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowUp, Camera, Mic } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { dueSoonForHome } from '@/lib/attention';
import { buildAgendaLocalContext } from '@/lib/chat/agendaContext';
import { useInventory } from '@/lib/InventoryContext';
import { useLastDone } from '@/lib/LastDoneContext';
import { useHousehold } from '@/lib/HouseholdContext';
import { useExpenses } from '@/lib/ExpensesContext';
import { useHabits } from '@/lib/HabitsContext';
import { useClasses } from '@/lib/ClassesContext';
import { useSubscriptions } from '@/lib/SubscriptionsContext';
import { localDayKey } from '@/lib/dates';
import {
  HABIT_CATEGORIES,
  completionRate,
  currentStreak,
  dayKey,
  loggedOn,
} from '@/lib/habits';
import { getLastDoneAt } from '@/lib/lastDone';
import { agendaClassesFromPacks, remainingCount, usedCount } from '@/lib/classes';
import { ChatAgentError, runChatAgent } from '@/lib/chat/agent';
import { applyChatActions } from '@/lib/chat/applyActions';
import { composeAppliedReply } from '@/lib/chat/composeReply';
import {
  isCloseTalkIntent,
  resolveLocalIntent,
} from '@/lib/chat/localIntents';
import { resolveOpenItemId } from '@/lib/chat/openItem';
import { hrefForTalkFocus, type TalkFocus } from '@/lib/chat/focus';
import type { ChatMessage } from '@/lib/chat/types';
import {
  AiDailyLimitError,
  assertAiAllowance,
  recordAiTurn,
} from '@/lib/aiUsage';
import { usePlan } from '@/lib/PlanContext';
import { useTalkOverlay } from '@/lib/TalkOverlayContext';
import { useCurrency } from '@/lib/CurrencyContext';
import { getHouseholdPeople, selfAvatarInitial } from '@/lib/people';
import { loadLocalProfile } from '@/lib/profile';
import { blurActiveElement } from '@/lib/a11y';
import { rememberedCaptureHref } from '@/lib/captureContext';
import { fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';
import { HomeHeader } from '@/components/HomeHeader';
import { saveHomeSurface } from '@/lib/homeSurface';

type UiMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Optional, only when an item was added this turn */
  itemId?: string;
};

/** One line of the composer, including a little room under the glyphs. */
const INPUT_LINE_H = 22;
const INPUT_MIN_H = Platform.OS === 'android' ? 44 : INPUT_LINE_H + 6;
const INPUT_MAX_H = 120;

/** How tall the composer must be so a wrapped second line stays visible. */
function composerHeight(text: string, reported: number): number {
  const wraps = Math.max(
    1,
    text.split('\n').length,
    Math.ceil(text.trim().length / 34) || 1
  );
  const estimated = wraps * INPUT_LINE_H + (Platform.OS === 'android' ? 8 : 6);
  return Math.min(INPUT_MAX_H, Math.max(INPUT_MIN_H, reported, text.trim() ? estimated : INPUT_MIN_H));
}

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
  const { entitlement } = usePlan();
  const listRef = useRef<FlatList<UiMessage>>(null);
  const inputRef = useRef<TextInput>(null);
  const { talkFocus, setTalkFocus, focusItemId, focusExpenseId, openTalk } =
    useTalkOverlay();
  const focusItemIdRef = useRef<string | null>(focusItemId);
  focusItemIdRef.current = focusItemId;
  const focusExpenseIdRef = useRef<string | null>(focusExpenseId);
  focusExpenseIdRef.current = focusExpenseId;
  const talkFocusRef = useRef<TalkFocus | null>(talkFocus);
  talkFocusRef.current = talkFocus;
  const { items, addItem, updateItem, removeItem, getById } = useInventory();
  const { items: lastDoneItems, logDone, setReminder, updateActivity, remove: removeLastDone } = useLastDone();
  const { members: householdMembers, addMember, updateMember } = useHousehold();
  const { currency: defaultCurrency } = useCurrency();
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
      // Land in the composer so tapping Ask from Today (or elsewhere) is ready to type.
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
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
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_H);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Add a thing, check in a habit, log a session, or ask about a document.',
    },
  ]);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setKeyboardOpen(true);
        // Keep the thread pinned so the composer isn't covered mid-scroll.
        requestAnimationFrame(() =>
          listRef.current?.scrollToEnd({ animated: true })
        );
      }
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardOpen(false)
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

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
    setInputHeight(INPUT_MIN_H);

    try {
      const newestId = items[0]?.id ?? null;
      const turnLocalDate = localDayKey();
      // Ask keeps close/exit for the model; Talk overlay handles dismiss locally.
      const local = resolveLocalIntent(
        question,
        buildAgendaLocalContext({
          inventory: items,
          lastDone: lastDoneItems,
          subscriptions,
          classPacks,
          habits,
          members: householdMembers,
          focusItemId: focusItemIdRef.current,
          focusExpenseId: focusExpenseIdRef.current,
          talkFocus: talkFocusRef.current,
          fallbackItemId: newestId,
        })
      );
      const useLocal = local && !isCloseTalkIntent(question);
      if (!useLocal) {
        await assertAiAllowance(entitlement.planId);
      }
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
              defaultCurrency,
              localDate: turnLocalDate,
            });
      if (!useLocal) {
        const used = result.aiAllowance?.used;
        await recordAiTurn(
          turnLocalDate,
          typeof used === 'number' ? used : undefined
        );
      }

      const applied = await applyChatActions(
        result.actions,
        { addItem, updateItem, removeItem },
        'talk',
        {
          fallbackFocusId: focusItemIdRef.current || newestId,
          resolveItem: (id) => getById(id),
          lastUserText: question,
          defaultCurrency,
          lastDone: { logDone, setReminder, updateActivity, remove: removeLastDone },
          household: householdMembers,
          people: { addMember, updateMember },
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
          localDate: turnLocalDate,
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
        addedHabitTitle: applied.addedHabitTitle,
        addedHabitWhy: applied.addedHabitWhy,
        addedHabitAlready: applied.addedHabitAlready,
        updatedHabit: applied.updatedHabit,
        updatedHabitTitle: applied.updatedHabitTitle,
        classPackTitle: applied.classPackTitle,
        classPackRemaining: applied.classPackRemaining,
        classPackTotal: applied.classPackTotal,
        classPackScheduleTimeInferred: applied.classPackScheduleTimeInferred,
        classLoggedTitle: applied.classLoggedTitle,
        classLogAttemptFor: applied.classLogAttemptFor,
        reminderLabel: applied.reminderLabel,
        reminderAt: applied.reminderAt,
        updatedReminder: applied.updatedReminder,
        removedLastDoneLabel: applied.removedLastDoneLabel,
        updatedClassPack: applied.updatedClassPack,
        renamedPersonFrom: applied.renamedPersonFrom,
        renamedPersonTo: applied.renamedPersonTo,
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
        err instanceof AiDailyLimitError || err instanceof ChatAgentError
          ? err.message
          : 'Something went wrong talking to Saavi. Try again in a moment.';
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', text },
      ]);
      if (err instanceof AiDailyLimitError && entitlement.planId === 'trial') {
        router.push('/settings/plan' as Href);
      }
    } finally {
      setBusy(false);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }

  return (
    <Screen>
      {/* react-native-keyboard-controller: works with Android edge-to-edge,
          where the RN KeyboardAvoidingView + adjustResize combo fails. */}
      <KeyboardAvoidingView
        style={{ flex: 1, width: '100%' }}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <HomeHeader surface="ask" avatarLetter={avatarLetter} />

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          style={styles.list}
          contentContainerStyle={styles.thread}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListHeaderComponent={
            topAttention.length ? (
              <View style={[styles.attentionBlock, { backgroundColor: colors.surface, borderColor: colors.lineStrong }]}>
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
                    <Text
                      style={[styles.attentionTitle, { color: colors.ink, flex: 1 }]}
                      numberOfLines={2}
                    >
                      {a.title}
                      <Text style={[styles.attentionSub, { color: colors.mute }]}>
                        {' · '}
                        {a.subtitle}
                      </Text>
                    </Text>
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
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.prompts}
                  contentContainerStyle={styles.promptsInner}
                >
                  {STARTER_PROMPTS.map((s) => (
                    <Pressable key={s} onPress={() => void ask(s)} style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.lineStrong }]}>
                      <Text style={[styles.chipText, { color: colors.ink }]}>{s}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
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
              <View style={styles.bubble}>
                <Text
                  style={[
                    styles.bubbleText,
                    {
                      color: m.role === 'user' ? colors.accent : colors.ink,
                      textAlign: m.role === 'user' ? 'right' : 'left',
                    },
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
            {
              // Flush on the keyboard when open; respect the home indicator when closed.
              // No own background, sits on the Screen wash like everything else.
              paddingBottom: keyboardOpen ? 8 : Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View
            style={[
              styles.composerCard,
              { backgroundColor: colors.surface, borderColor: colors.lineStrong },
            ]}
          >
            <TextInput
              ref={inputRef}
              value={input}
              onChangeText={(text) => {
                setInput(text);
                setInputHeight((h) => composerHeight(text, h));
              }}
              onContentSizeChange={(e) => {
                const raw = Math.ceil(e.nativeEvent.contentSize.height);
                // Android contentSize often under-reports with custom fonts / lineHeight.
                const h = Platform.OS === 'android' ? raw + 6 : raw;
                setInputHeight(composerHeight(input, h));
              }}
              placeholder="What’s new, or what should I look up…"
              placeholderTextColor={colors.faint}
              style={[styles.input, { height: inputHeight, color: colors.ink }]}
              multiline
              scrollEnabled={inputHeight >= INPUT_MAX_H}
              textAlignVertical="top"
              blurOnSubmit={false}
              editable={!busy}
            />
            <View style={styles.composerActions}>
              <View style={styles.composerActionGroup}>
                <Pressable
                  onPress={() => {
                    blurActiveElement();
                    Keyboard.dismiss();
                    router.push(rememberedCaptureHref());
                  }}
                  style={({ pressed }) => [
                    styles.roundBtn,
                    { borderColor: colors.lineStrong },
                    pressed && { opacity: 0.7 },
                  ]}
                  accessibilityLabel="Capture with camera"
                >
                  <Camera size={18} color={colors.ink} strokeWidth={2} />
                </Pressable>
                <Pressable
                  onPress={() => {
                    Keyboard.dismiss();
                    openTalk();
                  }}
                  style={({ pressed }) => [
                    styles.roundBtn,
                    { borderColor: colors.lineStrong },
                    pressed && { opacity: 0.7 },
                  ]}
                  accessibilityLabel="Talk instead"
                >
                  <Mic size={18} color={colors.ink} strokeWidth={2} />
                </Pressable>
              </View>
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
                <ArrowUp size={19} color={colors.accentOn} strokeWidth={2.4} />
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  attentionBlock: {
    marginBottom: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  attentionLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    marginBottom: 2,
  },
  attentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  attentionTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
  attentionSub: {
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
    alignItems: 'flex-start',
  },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    // Extra bottom pad on Android so descenders don't kiss the border
    // (includeFontPadding is also disabled on the shared Text component).
    paddingBottom: Platform.OS === 'android' ? 14 : 10,
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
    marginTop: spacing.md,
    marginHorizontal: -spacing.lg,
  },
  promptsInner: {
    gap: 8,
    paddingHorizontal: spacing.lg,
  },
  chip: {
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.5,
    minHeight: 40,
    justifyContent: 'center',
  },
  chipText: {
    fontFamily: fonts.sansSemi,
    fontSize: 15,
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  composer: {
    paddingHorizontal: spacing.md,
    paddingTop: 6,
  },
  composerCard: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'android' ? 12 : 8,
  },
  input: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 22,
    padding: 0,
    paddingTop: Platform.OS === 'android' ? 2 : 0,
    paddingBottom: Platform.OS === 'android' ? 6 : 0,
    maxHeight: INPUT_MAX_H,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  composerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  composerActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roundBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  send: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
