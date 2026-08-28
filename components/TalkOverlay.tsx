import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import * as Speech from 'expo-speech';
import { Camera, MessageCircle, Mic, Volume2, VolumeX, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
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
import { useTalkOverlay } from '@/lib/TalkOverlayContext';
import { useCurrency } from '@/lib/CurrencyContext';
import { ChatAgentError, runChatAgent } from '@/lib/chat/agent';
import { applyChatActions } from '@/lib/chat/applyActions';
import { composeAppliedReply } from '@/lib/chat/composeReply';
import { isCloseTalkIntent, resolveLocalIntent } from '@/lib/chat/localIntents';
import { resolveOpenItemId } from '@/lib/chat/openItem';
import { hrefForTalkFocus, type TalkFocus } from '@/lib/chat/focus';
import type { ChatMessage } from '@/lib/chat/types';
import { blurActiveElement } from '@/lib/a11y';
import { localDayKey } from '@/lib/dates';
import { saveHomeSurface } from '@/lib/homeSurface';
import { rememberedCaptureHref } from '@/lib/captureContext';
import { getHouseholdPeople } from '@/lib/people';
import {
  loadTalkVoicePrefs,
  saveTalkVoicePrefs,
} from '@/lib/talkVoicePrefs';
import { fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

type Phase = 'idle' | 'listening' | 'thinking' | 'reply';

const isExpoGo = Constants.appOwnership === 'expo';

function ListeningAura({
  active,
  outer,
  inner,
}: {
  active: boolean;
  outer: string;
  inner: string;
}) {
  const pulse = useSharedValue(0);
  const pulseLate = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      cancelAnimation(pulse);
      cancelAnimation(pulseLate);
      pulse.value = 0;
      pulseLate.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
    const t = setTimeout(() => {
      pulseLate.value = withRepeat(
        withTiming(1, { duration: 2000, easing: Easing.out(Easing.ease) }),
        -1,
        false
      );
    }, 700);
    return () => clearTimeout(t);
  }, [active, pulse, pulseLate]);

  const outerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.7 + pulse.value * 0.55 }],
    opacity: (1 - pulse.value) * 0.4,
  }));

  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.75 + pulseLate.value * 0.4 }],
    opacity: (1 - pulseLate.value) * 0.5,
  }));

  if (!active) return null;

  return (
    <>
      <Animated.View
        style={[styles.ring, styles.ringOuter, { backgroundColor: outer }, outerStyle]}
      />
      <Animated.View
        style={[styles.ring, styles.ringInner, { backgroundColor: inner }, innerStyle]}
      />
    </>
  );
}

function AnimatedListeningOrb({ busy }: { busy: boolean }) {
  const { colors } = useTheme();
  const spin = useSharedValue(0);
  const breathe = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(
      withTiming(1, { duration: 7000, easing: Easing.linear }),
      -1,
      false
    );
    breathe.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    return () => {
      cancelAnimation(spin);
      cancelAnimation(breathe);
    };
  }, [spin, breathe]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  const breatheStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breathe.value * 0.06 }],
  }));

  return (
    <Animated.View style={[styles.orbClip, breatheStyle]}>
      <Animated.View style={[styles.gradientSpin, spinStyle]}>
        <LinearGradient
          colors={[...colors.listenGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <View style={styles.orbFace} pointerEvents="none">
        {busy ? (
          <ActivityIndicator color={colors.onInk} />
        ) : (
          <Mic size={32} color={colors.onInk} strokeWidth={2} />
        )}
      </View>
    </Animated.View>
  );
}

/**
 * Talk orb — stays open & keeps listening until the user closes it.
 */
export function TalkOrb() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { open, closeTalk, talkFocus, setTalkFocus, focusItemId, focusExpenseId } =
    useTalkOverlay();
  const router = useRouter();
  const pathname = usePathname();
  const { items, addItem, updateItem, removeItem, getById } = useInventory();
  const { items: lastDoneItems, logDone, setReminder, remove: removeLastDone } = useLastDone();
  const { members: householdMembers, addMember, updateMember } = useHousehold();
  const { currency: defaultCurrency } = useCurrency();
  const currencyRef = useRef(defaultCurrency);
  currencyRef.current = defaultCurrency;
  const { expenses, addExpense, updateExpense, removeExpense, getById: getExpenseById } = useExpenses();
  const { habits, addHabit, checkIn, findByTitle, getById: getHabitById, updateHabit, removeHabit } = useHabits();
  const { packs: classPacks, addPack, logClass, findPack, pickAttendance, getById: getClassPack, newestPack, removePack, updatePack } = useClasses();
  const { subscriptions, addSubscription, updateSubscription, removeSubscription, getById: getSubscriptionById } = useSubscriptions();
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

  const [phase, setPhase] = useState<Phase>('idle');
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [apiDown, setApiDown] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(true);
  const openRef = useRef(open);
  openRef.current = open;
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
  const speakRepliesRef = useRef(speakReplies);
  speakRepliesRef.current = speakReplies;
  const historyRef = useRef<ChatMessage[]>([]);
  const inventoryRef = useRef(inventory);
  inventoryRef.current = inventory;
  const lastDoneRef = useRef(lastDone);
  lastDoneRef.current = lastDone;
  const expensesRef = useRef(expenseSummary);
  expensesRef.current = expenseSummary;
  const habitsRef = useRef(habitSummary);
  habitsRef.current = habitSummary;
  const classPacksRef = useRef(classPackSummary);
  classPacksRef.current = classPackSummary;
  const subscriptionsRef = useRef(subscriptionSummary);
  subscriptionsRef.current = subscriptionSummary;
  const focusItemIdRef = useRef<string | null>(focusItemId);
  focusItemIdRef.current = focusItemId;
  const focusExpenseIdRef = useRef<string | null>(focusExpenseId);
  focusExpenseIdRef.current = focusExpenseId;
  const talkFocusRef = useRef<TalkFocus | null>(talkFocus);
  talkFocusRef.current = talkFocus;
  const sessionActiveRef = useRef(false);

  useEffect(() => {
    void loadTalkVoicePrefs().then((prefs) => {
      setSpeakReplies(prefs.speakReplies);
    });
  }, []);

  const stopSpeech = useCallback(() => {
    try {
      Speech.stop();
    } catch {
      /* ignore */
    }
  }, []);

  const goToTalkFocus = useCallback(
    (focus: TalkFocus) => {
      stopSpeech();
      setTalkFocus(focus);
      closeTalk();
      const href = hrefForTalkFocus(focus);
      setTimeout(() => {
        router.push(href as never);
      }, 280);
    },
    [closeTalk, router, setTalkFocus, stopSpeech]
  );
  const goToItem = useCallback(
    (id: string) => {
      goToTalkFocus({ kind: 'item', id });
    },
    [goToTalkFocus]
  );
  const goToExpense = useCallback(
    (id: string) => {
      goToTalkFocus({ kind: 'expense', id });
    },
    [goToTalkFocus]
  );
  const transcriptRef = useRef('');
  const handledRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processUtteranceRef = useRef<(utterance: string) => Promise<void>>(
    async () => undefined
  );
  const startListenRef = useRef<() => Promise<void>>(async () => undefined);

  const stopRecognition = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const clearResumeTimer = useCallback(() => {
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }, []);

  /** After a reply: speak it (if enabled), then resume continuous listen. */
  const afterReply = useCallback(
    (spoken: string, resumeMs = 900) => {
      clearResumeTimer();
      const resume = () => {
        if (sessionActiveRef.current && openRef.current) {
          void startListenRef.current();
        }
      };
      if (!speakRepliesRef.current || !spoken.trim()) {
        resumeTimerRef.current = setTimeout(resume, resumeMs);
        return;
      }
      stopSpeech();
      Speech.speak(spoken.trim(), {
        language: 'en-US',
        rate: 1.0,
        pitch: 1.0,
        onDone: resume,
        onStopped: resume,
        onError: resume,
      });
    },
    [clearResumeTimer, stopSpeech]
  );

  const failListen = useCallback(
    (message: string, opts?: { terminal?: boolean }) => {
      if (handledRef.current || phaseRef.current === 'thinking') return;
      stopRecognition();
      setPhase('idle');
      setError(message);
      // Permission denied / no engine: retrying every second is noise — the
      // user has to change something in Settings first.
      if (opts?.terminal) {
        sessionActiveRef.current = false;
        clearResumeTimer();
        return;
      }
      // Keep session open — retry listening shortly
      if (sessionActiveRef.current && openRef.current) {
        clearResumeTimer();
        resumeTimerRef.current = setTimeout(() => {
          if (sessionActiveRef.current && openRef.current) {
            void startListenRef.current();
          }
        }, 900);
      }
    },
    [clearResumeTimer, stopRecognition]
  );

  const processUtterance = useCallback(
    async (utterance: string) => {
      const text = utterance.trim();
      if (!text) {
        failListen('Didn’t catch that — still listening…');
        return;
      }
      if (handledRef.current || phaseRef.current === 'thinking') return;
      handledRef.current = true;
      stopRecognition();

      setHeard(text);
      setError('');
      setPhase('thinking');

      const newestId = inventoryRef.current[0]?.id ?? null;

      // Clear UI commands stay on-device (exit / open item)
      const local = resolveLocalIntent(text, {
        focusItemId: focusItemIdRef.current,
        fallbackItemId: newestId,
        focusExpenseId: focusExpenseIdRef.current,
        talkFocus: talkFocusRef.current,
      });
      if (local) {
        console.log('[Talk] local intent', text, local.actions.map((a) => a.type));
        if (isCloseTalkIntent(text)) {
          setReply(local.reply);
          setPhase('reply');
          sessionActiveRef.current = false;
          clearResumeTimer();
          stopRecognition();
          setTimeout(() => closeTalk(), 350);
          return;
        }
        const applied = await applyChatActions(
          local.actions,
          { addItem, updateItem, removeItem },
          'talk',
          {
            lastUserText: text,
            fallbackFocusId: focusItemIdRef.current || newestId,
            lastFocusExpenseId: focusExpenseIdRef.current,
            lastTalkFocus: talkFocusRef.current,
            defaultCurrency: currencyRef.current,
            resolveItem: (id) => getById(id),
            inventoryList: inventoryRef.current.map((i) => ({
              id: i.id,
              name: i.name,
            })),
            expensesList: expensesRef.current.map((e) => ({
              id: e.id,
              title: e.title,
              merchant: e.merchant,
            })),
            lastDoneList: lastDoneRef.current
              .filter((d) => d.id)
              .map((d) => ({ id: d.id as string, label: d.label })),
          }
        );
        if (applied.talkFocus) setTalkFocus(applied.talkFocus);
        else if (applied.clearedFocus) setTalkFocus(null);
        const localReply = composeAppliedReply({
          actions: local.actions,
          modelReply: local.reply,
          addedName: applied.lastAddedName,
          removedNames: applied.removedNames,
          updatedIds: applied.updatedIds,
          openExpenseId: applied.openExpenseId,
          openItemId: applied.openItemId,
          openTarget: applied.openTarget,
        });
        setReply(localReply);
        setPhase('reply');
        if (applied.openTarget) {
          goToTalkFocus(applied.openTarget);
          return;
        }
        const openId = resolveOpenItemId({
          actions: local.actions,
          openItemId: applied.openItemId,
          focusItemId: applied.focusItemId || focusItemIdRef.current,
          inventoryIds: [
            ...(applied.lastAddedId ? [applied.lastAddedId] : []),
            ...inventoryRef.current.map((i) => i.id),
          ],
        });
        if (openId) {
          goToItem(openId);
          return;
        }
        afterReply(localReply, 900);
        return;
      }

      const nextHistory: ChatMessage[] = [
        ...historyRef.current.slice(-10),
        { role: 'user' as const, content: text },
      ];

      try {
        const turnLocalDate = localDayKey();
        console.log('[Talk] → OpenAI', text, 'focus', focusItemIdRef.current);
        const result = await runChatAgent({
          messages: nextHistory,
          inventory: inventoryRef.current,
          lastDone: lastDoneRef.current,
          expenses: expensesRef.current,
          habits: habitsRef.current,
          classPacks: classPacksRef.current,
          subscriptions: subscriptionsRef.current,
          session: {
            focusItemId: focusItemIdRef.current,
            focusExpenseId: focusExpenseIdRef.current,
            focus: talkFocusRef.current,
          },
          household: householdPeople,
          defaultCurrency: currencyRef.current,
          localDate: turnLocalDate,
        });
        if (!openRef.current || !sessionActiveRef.current) return;
        const applied = await applyChatActions(
          result.actions,
          { addItem, updateItem, removeItem },
          'talk',
          {
            fallbackFocusId: focusItemIdRef.current || newestId,
            resolveItem: (id) => getById(id),
            lastUserText: text,
            defaultCurrency: currencyRef.current,
            lastDone: { logDone, setReminder, remove: removeLastDone },
            household: householdMembers,
            people: { addMember, updateMember },
            expenses: {
              addExpense,
              updateExpense,
              removeExpense,
              getById: getExpenseById,
            },
            expensesList: expensesRef.current.map((e) => ({
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
            subscriptionsList: subscriptionsRef.current.map((s) => ({
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
            habitsList: habitsRef.current.map((h) => ({
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
            classPacksList: classPacksRef.current.map((p) => ({
              id: p.id,
              title: p.title,
            })),
            lastDoneList: lastDoneRef.current
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
          classPackTitle: applied.classPackTitle,
          classPackRemaining: applied.classPackRemaining,
          classPackTotal: applied.classPackTotal,
          classPackScheduleTimeInferred: applied.classPackScheduleTimeInferred,
          classLoggedTitle: applied.classLoggedTitle,
          classLogAttemptFor: applied.classLogAttemptFor,
          reminderLabel: applied.reminderLabel,
          reminderAt: applied.reminderAt,
          removedLastDoneLabel: applied.removedLastDoneLabel,
          updatedClassPack: applied.updatedClassPack,
          renamedPersonFrom: applied.renamedPersonFrom,
          renamedPersonTo: applied.renamedPersonTo,
        });
        console.log(
          '[Talk] ← actions',
          result.actions,
          'reply→',
          spoken,
          'removed',
          applied.removedNames
        );
        setApiDown(false);
        historyRef.current = [
          ...nextHistory,
          { role: 'assistant' as const, content: spoken },
        ].slice(-12);
        setReply(spoken);
        setPhase('reply');

        // If we deleted the item currently on screen, leave that page
        if (applied.removedIds.length) {
          const onAsset = applied.removedIds.some((id) =>
            pathname.includes(`/asset/${id}`)
          );
          if (onAsset) {
            router.replace('/(tabs)/spaces');
          }
        }

        if (applied.openTarget) {
          goToTalkFocus(applied.openTarget);
          return;
        }

        if (applied.openExpenseId) {
          goToExpense(applied.openExpenseId);
          return;
        }

        const openId = resolveOpenItemId({
          actions: result.actions,
          openItemId: applied.openItemId,
          focusItemId:
            applied.focusItemId || applied.lastAddedId || focusItemIdRef.current,
          inventoryIds: [
            ...(applied.lastAddedId ? [applied.lastAddedId] : []),
            ...inventoryRef.current.map((i) => i.id),
          ],
        });
        if (openId) {
          goToItem(openId);
          return;
        }

        // Continuous listen until user closes Talk (after spoken reply finishes)
        afterReply(spoken, 1100);
      } catch (err) {
        handledRef.current = false;
        setPhase('idle');
        setError(
          err instanceof ChatAgentError
            ? err.message
            : 'Something went wrong — still listening…'
        );
        if (err instanceof ChatAgentError) setApiDown(true);
        clearResumeTimer();
        resumeTimerRef.current = setTimeout(() => {
          if (sessionActiveRef.current && openRef.current) {
            void startListenRef.current();
          }
        }, 1200);
      }
    },
    [
      addItem,
      updateItem,
      removeItem,
      getById,
      failListen,
      stopRecognition,
      clearResumeTimer,
      afterReply,
      closeTalk,
      goToItem,
      goToExpense,
      goToTalkFocus,
      setTalkFocus,
      pathname,
      router,
    ]
  );
  processUtteranceRef.current = processUtterance;

  const startListen = useCallback(async () => {
    if (!sessionActiveRef.current || !openRef.current) return;
    blurActiveElement();
    handledRef.current = false;
    transcriptRef.current = '';
    setHeard('');
    setError('');
    stopSpeech();
    // Keep last reply visible while listening for the next turn

    if (isExpoGo) {
      setError('Mic needs a development build. Use Ask to type for now.');
      setPhase('idle');
      return;
    }

    try {
      const available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
      if (!available) {
        failListen('Speech isn’t available on this device.', { terminal: true });
        return;
      }
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        failListen(
          'Microphone blocked — allow access in Settings, then reopen Talk.',
          { terminal: true }
        );
        return;
      }
      setPhase('listening');
      // Bias ASR from the user's own data only — not a fixed brand/store list
      const fromInventory = inventoryRef.current
        .flatMap((i) => [i.brand, i.name, i.room, i.purchasedFrom])
        .filter((s): s is string => Boolean(s && s !== 'Unknown' && s !== '—'));
      const fromExpenses = expensesRef.current
        .flatMap((e) => [e.merchant, e.title])
        .filter((s): s is string => Boolean(s && s !== 'Unknown' && s !== '—'));
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: false,
        addsPunctuation: false,
        contextualStrings: [...new Set([...fromInventory, ...fromExpenses])].slice(0, 40),
      });
    } catch {
      failListen('Couldn’t start listening — retrying…');
    }
  }, [failListen, stopSpeech]);
  startListenRef.current = startListen;

  useSpeechRecognitionEvent('result', (event) => {
    if (!openRef.current || !sessionActiveRef.current) return;
    const transcript = event.results?.[0]?.transcript?.trim();
    if (!transcript) return;
    transcriptRef.current = transcript;
    setHeard(transcript);
    if (event.isFinal) {
      void processUtteranceRef.current(transcript);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (!openRef.current || handledRef.current) return;
    if (event.error === 'aborted') return;
    if (transcriptRef.current) {
      void processUtteranceRef.current(transcriptRef.current);
      return;
    }
    if (event.error === 'not-allowed') {
      failListen(
        'Microphone blocked — allow access in Settings, then reopen Talk.',
        { terminal: true }
      );
      return;
    }
    failListen(
      event.error === 'no-speech' ? 'Still listening…' : 'Listening glitch — retrying…'
    );
  });

  useSpeechRecognitionEvent('end', () => {
    if (!openRef.current || handledRef.current) return;
    if (phaseRef.current !== 'listening') return;
    if (transcriptRef.current) {
      void processUtteranceRef.current(transcriptRef.current);
      return;
    }
    // Silence — keep the session alive and listen again
    if (sessionActiveRef.current) {
      clearResumeTimer();
      resumeTimerRef.current = setTimeout(() => {
        if (sessionActiveRef.current && openRef.current) {
          void startListenRef.current();
        }
      }, 400);
    }
  });

  useEffect(() => {
    if (open) {
      sessionActiveRef.current = true;
      void startListen();
    } else {
      sessionActiveRef.current = false;
      handledRef.current = false;
      transcriptRef.current = '';
      clearResumeTimer();
      stopSpeech();
      stopRecognition();
      setPhase('idle');
      setHeard('');
      setReply('');
      setError('');
      historyRef.current = [];
      // Keep focusItemId across Talk sessions — needed for “open the item”
    }
    return () => {
      clearResumeTimer();
      stopSpeech();
    };
  }, [open, startListen, stopRecognition, clearResumeTimer, stopSpeech]);

  function close() {
    sessionActiveRef.current = false;
    clearResumeTimer();
    stopSpeech();
    stopRecognition();
    closeTalk();
  }

  async function toggleSpeakReplies() {
    const next = !speakReplies;
    setSpeakReplies(next);
    if (!next) stopSpeech();
    await saveTalkVoicePrefs({ speakReplies: next });
  }

  function onOrbPress() {
    if (phase === 'listening') {
      if (transcriptRef.current) {
        void processUtterance(transcriptRef.current);
      }
      // else keep listening — no need to stop the session
      return;
    }
    // Allow recovery if a prior turn got stuck in thinking
    if (phase === 'thinking') {
      handledRef.current = false;
      stopSpeech();
      setError('Cancelled — tap to try again.');
      setPhase('idle');
      return;
    }
    void startListen();
  }

  const orbLive = phase === 'listening';
  const orbBusy = phase === 'thinking';

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
    >
      <View style={styles.orbRoot}>
        <View style={styles.orbDim} />

        <View
          style={[styles.closeBar, { top: insets.top + 14 }]}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={() => void toggleSpeakReplies()}
            style={[styles.voiceBtn, { backgroundColor: colors.surface }]}
            accessibilityLabel={
              speakReplies ? 'Mute spoken replies' : 'Unmute spoken replies'
            }
          >
            {speakReplies ? (
              <Volume2 size={18} color={colors.ink} strokeWidth={2.4} />
            ) : (
              <VolumeX size={18} color={colors.mute} strokeWidth={2.4} />
            )}
          </Pressable>
          <Pressable
            onPress={close}
            style={[styles.closeBtn, { backgroundColor: colors.surface }]}
            accessibilityLabel="Close Talk"
          >
            <X size={18} color={colors.ink} strokeWidth={2.4} />
            <Text style={[styles.closeBtnText, { color: colors.ink }]}>Close</Text>
          </Pressable>
        </View>

        {apiDown ? (
          <View
            style={[
              styles.apiBanner,
              {
                top: insets.top + 58,
                backgroundColor: colors.amberSoft,
                borderColor: colors.amber,
              },
            ]}
            pointerEvents="none"
          >
            <Text style={[styles.apiBannerText, { color: colors.ink }]}>
              Chat service offline — Capture and basic Talk still work.
            </Text>
          </View>
        ) : null}

        <View style={styles.orbStage} pointerEvents="box-none">
          <View style={styles.orbCenter}>
            <Text style={styles.statusLabel}>
              {phase === 'listening'
                ? 'Listening — keep talking'
                : phase === 'thinking'
                  ? 'Thinking…'
                  : phase === 'reply'
                    ? 'Listening again soon…'
                    : 'Talk'}
            </Text>

            {heard ? <Text style={styles.heard}>“{heard}”</Text> : null}

            <View style={styles.orbWrap}>
              <ListeningAura
                active={orbLive}
                outer={colors.accentSoft}
                inner={colors.amberSoft}
              />
              <Pressable
                onPress={onOrbPress}
                style={styles.orbHit}
                accessibilityLabel="Talk"
              >
                {orbLive ? (
                  <AnimatedListeningOrb busy={false} />
                ) : (
                  <View
                    style={[
                      styles.orb,
                      { backgroundColor: colors.accent },
                      orbBusy && { backgroundColor: colors.accentStrong },
                    ]}
                  >
                    {orbBusy ? (
                      <ActivityIndicator color={colors.accentOn} />
                    ) : (
                      <Mic size={32} color={colors.accentOn} strokeWidth={2} />
                    )}
                  </View>
                )}
              </Pressable>
            </View>

            <View style={styles.replySlot}>
              {reply ? (
                <View style={styles.replyBubble}>
                  <Text style={styles.reply}>{reply}</Text>
                </View>
              ) : null}
              {error ? (
                <View style={styles.errorBubble}>
                  <Text style={styles.error}>{error}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Bottom-left dock:
 * - On Ask: Capture · Talk
 * - Elsewhere: Capture · Ask · Talk
 */
export function FloatingNav() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { open, openTalk } = useTalkOverlay();
  const { colors } = useTheme();

  if (pathname.includes('capture') || pathname.includes('onboarding') || pathname.includes('/create') || open)
    return null;

  const onAskScreen = pathname.includes('/ask');

  return (
    <View
      style={[
        styles.dock,
        { bottom: Math.max(insets.bottom, 12) + 10 },
      ]}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.dockChrome,
          {
            backgroundColor: colors.bgElevated,
            borderColor: colors.line,
          },
        ]}
      >
        <DockBtn
          label="Capture"
          onPress={() => {
            blurActiveElement();
            router.push(rememberedCaptureHref());
          }}
          Icon={Camera}
          primary
        />
        {onAskScreen ? null : (
          <DockBtn
            label="Ask"
            onPress={() => {
              blurActiveElement();
              void saveHomeSurface('ask');
              router.navigate('/(tabs)/ask' as never);
            }}
            Icon={MessageCircle}
          />
        )}
        <DockBtn
          label="Talk"
          onPress={() => {
            blurActiveElement();
            openTalk();
          }}
          Icon={Mic}
        />
      </View>
    </View>
  );
}

function DockBtn({
  label,
  onPress,
  Icon,
  primary,
}: {
  label: string;
  onPress: () => void;
  Icon: typeof Mic;
  primary?: boolean;
}) {
  const filled = Boolean(primary);
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.dockBtn,
        {
          backgroundColor: filled ? colors.accent : colors.surface,
          borderColor: filled ? colors.accent : colors.line,
        },
        pressed && { opacity: 0.88, transform: [{ scale: 0.96 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon
        size={20}
        color={filled ? colors.accentOn : colors.slate}
        strokeWidth={2.1}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 60,
  },
  dockChrome: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 6,
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dockBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbRoot: {
    flex: 1,
  },
  orbDim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(30, 24, 18, 0.74)',
  },
  closeBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    zIndex: 3,
  },
  voiceBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  apiBanner: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 4,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  apiBannerText: {
    fontFamily: fonts.sans,
    fontSize: 16,
    textAlign: 'center',
  },
  closeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.full,
  },
  closeBtnText: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
  },
  orbStage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  orbCenter: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  statusLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: spacing.md,
    textAlign: 'center',
    width: '100%',
  },
  heard: {
    fontFamily: fonts.sansMedium,
    fontSize: 18,
    lineHeight: 26,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: spacing.md,
    width: '100%',
  },
  replySlot: {
    marginTop: spacing.xl,
    minHeight: 88,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  replyBubble: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    width: '100%',
  },
  reply: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    lineHeight: 24,
    color: '#FFFFFF',
    textAlign: 'center',
    width: '100%',
  },
  errorBubble: {
    backgroundColor: 'rgba(246, 199, 122, 0.12)',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(246, 199, 122, 0.25)',
    marginTop: spacing.sm,
    width: '100%',
  },
  error: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: '#F6C77A',
    textAlign: 'center',
    width: '100%',
  },
  orbWrap: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  ring: {
    position: 'absolute',
    borderRadius: 999,
  },
  ringOuter: {
    width: 150,
    height: 150,
  },
  ringInner: {
    width: 118,
    height: 118,
  },
  orbHit: {
    zIndex: 2,
  },
  orb: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbClip: {
    width: 84,
    height: 84,
    borderRadius: 42,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientSpin: {
    position: 'absolute',
    width: 140,
    height: 140,
    left: -28,
    top: -28,
  },
  orbFace: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
