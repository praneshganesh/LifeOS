import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
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
import { rememberedCaptureHref } from '@/lib/captureContext';
import { saveHomeSurface } from '@/lib/homeSurface';
import { getHouseholdPeople } from '@/lib/people';
import {
  loadTalkVoicePrefs,
  saveTalkVoicePrefs,
} from '@/lib/talkVoicePrefs';
import { mergeFinalSpeechPart } from '@/lib/speechAccumulate';
import { fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

type Phase = 'idle' | 'listening' | 'thinking' | 'reply';

/** Pause after last speech before we send to AI — slow reminders need room to breathe. */
const SPEECH_COMMIT_MS = 1800;

const isExpoGo = Constants.appOwnership === 'expo';

function ListeningAura({
  active,
}: {
  active: boolean;
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
      withTiming(1, { duration: 2800, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
    const t = setTimeout(() => {
      pulseLate.value = withRepeat(
        withTiming(1, { duration: 2800, easing: Easing.out(Easing.ease) }),
        -1,
        false
      );
    }, 900);
    return () => clearTimeout(t);
  }, [active, pulse, pulseLate]);

  const outerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.85 + pulse.value * 0.45 }],
    opacity: (1 - pulse.value) * 0.28,
  }));

  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.9 + pulseLate.value * 0.32 }],
    opacity: (1 - pulseLate.value) * 0.22,
  }));

  if (!active) return null;

  return (
    <>
      <Animated.View style={[styles.ring, styles.ringOuter, outerStyle]} />
      <Animated.View style={[styles.ring, styles.ringInner, innerStyle]} />
    </>
  );
}

/** Soft ChatGPT-like listening orb — no mic glyph while live. */
function AnimatedListeningOrb({
  busy,
  live,
}: {
  busy: boolean;
  live: boolean;
}) {
  const { colors } = useTheme();
  const spin = useSharedValue(0);
  const breathe = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(
      withTiming(1, { duration: live ? 9000 : 7000, easing: Easing.linear }),
      -1,
      false
    );
    breathe.value = withRepeat(
      withTiming(1, { duration: live ? 2200 : 1600, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    return () => {
      cancelAnimation(spin);
      cancelAnimation(breathe);
    };
  }, [spin, breathe, live]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  const breatheStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breathe.value * (live ? 0.08 : 0.04) }],
  }));

  return (
    <Animated.View style={[styles.orbClip, live && styles.orbClipLive, breatheStyle]}>
      <Animated.View style={[styles.gradientSpin, spinStyle]}>
        <LinearGradient
          colors={
            live
              ? [colors.listenGradient[0]!, colors.listenGradient[2]!, colors.listenGradient[1]!, colors.listenGradient[0]!]
              : [...colors.listenGradient]
          }
          start={{ x: 0.15, y: 0.1 }}
          end={{ x: 0.9, y: 0.95 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      {/* Soft vignette so the orb reads as a glow, not a hard disc */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.22)']}
        style={styles.orbVignette}
        pointerEvents="none"
      />
      <View style={styles.orbFace} pointerEvents="none">
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : live ? null : (
          <Mic size={30} color="#FFFFFF" strokeWidth={2} />
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
  /** Final ASR segments for continuous / slow dictation. */
  const finalPartsRef = useRef<string[]>([]);
  const handledRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processUtteranceRef = useRef<(utterance: string) => Promise<void>>(
    async () => undefined
  );
  const startListenRef = useRef<() => Promise<void>>(async () => undefined);
  const continueListenRef = useRef<() => Promise<void>>(async () => undefined);

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

  const clearCommitTimer = useCallback(() => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
  }, []);

  /** Wait for a real pause before sending to AI — slow reminders often pause mid-sentence. */
  const scheduleCommit = useCallback(() => {
    clearCommitTimer();
    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;
      const text = transcriptRef.current.trim();
      if (!text) return;
      if (!openRef.current || !sessionActiveRef.current) return;
      if (handledRef.current || phaseRef.current === 'thinking') return;
      void processUtteranceRef.current(text);
    }, SPEECH_COMMIT_MS);
  }, [clearCommitTimer]);

  const mergeSpeechChunk = useCallback((chunk: string, isFinal: boolean) => {
    const text = chunk.trim();
    if (!text) return;
    if (isFinal) {
      finalPartsRef.current = mergeFinalSpeechPart(finalPartsRef.current, text);
      transcriptRef.current = finalPartsRef.current.join(' ').trim();
    } else {
      const base = finalPartsRef.current.join(' ').trim();
      // Prefer the longer live string when the engine re-sends the whole phrase.
      if (!base) {
        transcriptRef.current = text;
      } else if (text.startsWith(base) || base.startsWith(text)) {
        transcriptRef.current = text.length >= base.length ? text : base;
      } else {
        transcriptRef.current = `${base} ${text}`.trim();
      }
    }
    setHeard(transcriptRef.current);
  }, []);

  /** After a reply: speak it (if enabled), then resume continuous listen. */
  const afterReply = useCallback(
    (spoken: string, resumeMs = 900) => {
      clearResumeTimer();
      let resumed = false;
      const resume = () => {
        if (resumed) return;
        resumed = true;
        clearResumeTimer();
        if (sessionActiveRef.current && openRef.current) {
          void startListenRef.current();
        }
      };
      if (!speakRepliesRef.current || !spoken.trim()) {
        resumeTimerRef.current = setTimeout(resume, resumeMs);
        return;
      }
      stopSpeech();
      // Web (and some native paths) never fire Speech onDone/onError — always
      // schedule a fallback so Talk keeps listening without another mic tap.
      const wordCount = spoken.trim().split(/\s+/).filter(Boolean).length;
      const estimateMs = Math.min(
        14000,
        Math.max(resumeMs + 600, Math.round(wordCount * 340) + 700)
      );
      resumeTimerRef.current = setTimeout(resume, estimateMs);
      try {
        Speech.speak(spoken.trim(), {
          language: 'en-US',
          rate: 1.0,
          pitch: 1.0,
          onDone: resume,
          onStopped: resume,
          onError: resume,
        });
      } catch {
        resume();
      }
    },
    [clearResumeTimer, stopSpeech]
  );

  const failListen = useCallback(
    (message: string, opts?: { terminal?: boolean }) => {
      if (handledRef.current || phaseRef.current === 'thinking') return;
      clearCommitTimer();
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
    [clearResumeTimer, clearCommitTimer, stopRecognition]
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
      clearCommitTimer();
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
      clearCommitTimer,
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
    clearCommitTimer();
    finalPartsRef.current = [];
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
        // Keep listening through mid-sentence pauses (long reminders / Talk).
        continuous: true,
        requiresOnDeviceRecognition: false,
        addsPunctuation: false,
        iosTaskHint: 'dictation',
        androidIntentOptions: {
          // Default OS silence cutoffs are ~1–3s and chop slow speech.
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 8000,
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 4000,
        },
        contextualStrings: [...new Set([...fromInventory, ...fromExpenses])].slice(0, 40),
      });
    } catch {
      failListen('Couldn’t start listening — retrying…');
    }
  }, [clearCommitTimer, failListen, stopSpeech]);
  startListenRef.current = startListen;

  /** Restart the mic for the same turn — keeps transcript so slow speech can continue. */
  const continueListen = useCallback(async () => {
    if (!sessionActiveRef.current || !openRef.current) return;
    if (handledRef.current || phaseRef.current === 'thinking') return;
    if (isExpoGo) return;
    try {
      const available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
      if (!available) return;
      setPhase('listening');
      const fromInventory = inventoryRef.current
        .flatMap((i) => [i.brand, i.name, i.room, i.purchasedFrom])
        .filter((s): s is string => Boolean(s && s !== 'Unknown' && s !== '—'));
      const fromExpenses = expensesRef.current
        .flatMap((e) => [e.merchant, e.title])
        .filter((s): s is string => Boolean(s && s !== 'Unknown' && s !== '—'));
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: true,
        requiresOnDeviceRecognition: false,
        addsPunctuation: false,
        iosTaskHint: 'dictation',
        androidIntentOptions: {
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 8000,
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 4000,
        },
        contextualStrings: [...new Set([...fromInventory, ...fromExpenses])].slice(0, 40),
      });
    } catch {
      /* scheduleCommit will still fire with what we have */
    }
  }, []);
  continueListenRef.current = continueListen;

  useSpeechRecognitionEvent('result', (event) => {
    if (!openRef.current || !sessionActiveRef.current) return;
    if (handledRef.current || phaseRef.current === 'thinking') return;
    const transcript = event.results?.[0]?.transcript?.trim();
    if (!transcript) return;
    mergeSpeechChunk(transcript, Boolean(event.isFinal));
    // Never send on the first final — wait for a real pause so slow speech
    // isn't chopped mid-reminder.
    scheduleCommit();
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (!openRef.current || handledRef.current) return;
    if (event.error === 'aborted') return;
    if (transcriptRef.current) {
      scheduleCommit();
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
      // Engine ended the session — still wait briefly so a restart can append
      // more speech if the user was only pausing.
      scheduleCommit();
      clearResumeTimer();
      resumeTimerRef.current = setTimeout(() => {
        if (
          !sessionActiveRef.current ||
          !openRef.current ||
          handledRef.current ||
          phaseRef.current === 'thinking'
        ) {
          return;
        }
        // Continue the same turn — don't wipe what we already heard.
        void continueListenRef.current();
      }, 350);
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
      finalPartsRef.current = [];
      clearCommitTimer();
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
      clearCommitTimer();
      clearResumeTimer();
      stopSpeech();
    };
  }, [open, startListen, stopRecognition, clearResumeTimer, clearCommitTimer, stopSpeech]);

  function close() {
    sessionActiveRef.current = false;
    clearCommitTimer();
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
        clearCommitTimer();
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
        <LinearGradient
          colors={['#0A0A0C', '#111114', '#0A0A0C']}
          style={StyleSheet.absoluteFill}
        />
        {/* Soft bottom ambient — Claude-like listening glow */}
        {orbLive ? (
          <LinearGradient
            colors={['transparent', 'rgba(120,160,255,0.14)', 'rgba(180,200,255,0.08)']}
            style={styles.bottomGlow}
            pointerEvents="none"
          />
        ) : null}

        <View
          style={[styles.closeBar, { top: insets.top + 12 }]}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={() => void toggleSpeakReplies()}
            style={styles.iconBtn}
            accessibilityLabel={
              speakReplies ? 'Mute spoken replies' : 'Unmute spoken replies'
            }
          >
            {speakReplies ? (
              <Volume2 size={20} color="rgba(255,255,255,0.85)" strokeWidth={2.2} />
            ) : (
              <VolumeX size={20} color="rgba(255,255,255,0.45)" strokeWidth={2.2} />
            )}
          </Pressable>
          <View style={{ flex: 1 }} />
        </View>

        {apiDown ? (
          <View
            style={[
              styles.apiBanner,
              {
                top: insets.top + 58,
                backgroundColor: 'rgba(246,199,122,0.16)',
                borderColor: 'rgba(246,199,122,0.35)',
              },
            ]}
            pointerEvents="none"
          >
            <Text style={[styles.apiBannerText, { color: '#F6E7C5' }]}>
              Chat service offline — Capture and basic Talk still work.
            </Text>
          </View>
        ) : null}

        <View style={styles.orbStage} pointerEvents="box-none">
          <View style={styles.orbCenter}>
            {/* Live transcript sits above the orb — quiet, not quoted */}
            <View style={styles.transcriptSlot}>
              {heard && (phase === 'listening' || phase === 'thinking') ? (
                <Text style={styles.heard} numberOfLines={5}>
                  {heard}
                </Text>
              ) : null}
              {!heard && phase === 'listening' ? (
                <Text style={styles.statusQuiet}>Listening</Text>
              ) : null}
              {phase === 'thinking' && !heard ? (
                <Text style={styles.statusQuiet}>Thinking</Text>
              ) : null}
              {phase === 'idle' && !reply ? (
                <Text style={styles.statusQuiet}>Tap to talk</Text>
              ) : null}
            </View>

            <View style={styles.orbWrap}>
              <ListeningAura active={orbLive} />
              <Pressable
                onPress={onOrbPress}
                style={styles.orbHit}
                accessibilityLabel={
                  phase === 'listening' ? 'Send what you said' : 'Talk'
                }
              >
                <AnimatedListeningOrb busy={orbBusy} live={orbLive} />
              </Pressable>
            </View>

            <View style={styles.replySlot}>
              {reply && phase !== 'listening' ? (
                <Text style={styles.reply} numberOfLines={8}>
                  {reply}
                </Text>
              ) : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>
          </View>
        </View>

        <View
          style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}
        >
          <Pressable
            onPress={onOrbPress}
            style={[
              styles.bottomMic,
              orbLive && { backgroundColor: '#FFFFFF' },
            ]}
            accessibilityLabel={phase === 'listening' ? 'Finish speaking' : 'Start talking'}
          >
            <Mic
              size={22}
              color={orbLive ? '#0A0A0C' : 'rgba(255,255,255,0.92)'}
              strokeWidth={2.2}
            />
          </Pressable>
          <Pressable
            onPress={close}
            style={styles.bottomClose}
            accessibilityLabel="Close Talk"
          >
            <X size={22} color="#0A0A0C" strokeWidth={2.4} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Bottom dock: Capture · Ask · Talk — reachable from anywhere.
 * Hidden on Ask — the chat composer has its own capture/talk buttons.
 */
export function FloatingNav() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { open, openTalk } = useTalkOverlay();
  const { colors } = useTheme();
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardOpen(true)
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

  if (
    pathname.includes('capture') ||
    pathname.includes('onboarding') ||
    pathname.includes('/create') ||
    pathname.includes('/ask') ||
    open ||
    keyboardOpen
  )
    return null;

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
        <DockBtn
          label="Ask"
          onPress={() => {
            blurActiveElement();
            void saveHomeSurface('ask');
            router.navigate('/(tabs)/ask' as never);
          }}
          Icon={MessageCircle}
        />
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
    gap: 6,
    padding: 5,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dockBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbRoot: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  bottomGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 180,
  },
  closeBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 3,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
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
    fontSize: 15,
    textAlign: 'center',
  },
  orbStage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: 88,
  },
  orbCenter: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
  },
  transcriptSlot: {
    minHeight: 96,
    width: '100%',
    justifyContent: 'flex-end',
    marginBottom: spacing.lg,
    paddingHorizontal: 8,
  },
  statusQuiet: {
    fontFamily: fonts.sansMedium,
    fontSize: 17,
    letterSpacing: -0.2,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },
  heard: {
    fontFamily: fonts.sans,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.3,
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
  },
  replySlot: {
    marginTop: spacing.xl,
    minHeight: 72,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 4,
  },
  reply: {
    fontFamily: fonts.sansMedium,
    fontSize: 18,
    lineHeight: 26,
    letterSpacing: -0.2,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
  },
  error: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 21,
    color: 'rgba(246, 199, 122, 0.9)',
    textAlign: 'center',
    marginTop: 8,
  },
  orbWrap: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(140,170,255,0.35)',
  },
  ringOuter: {
    width: 210,
    height: 210,
  },
  ringInner: {
    width: 168,
    height: 168,
  },
  orbHit: {
    zIndex: 2,
  },
  orbClip: {
    width: 112,
    height: 112,
    borderRadius: 56,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbClipLive: {
    width: 148,
    height: 148,
    borderRadius: 74,
  },
  gradientSpin: {
    position: 'absolute',
    width: 220,
    height: 220,
    left: -36,
    top: -36,
  },
  orbVignette: {
    ...StyleSheet.absoluteFill,
  },
  orbFace: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    paddingTop: 12,
  },
  bottomMic: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  bottomClose: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
});
