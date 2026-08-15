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
import { useSubscriptions } from '@/lib/SubscriptionsContext';
import {
  HABIT_CATEGORIES,
  completionRate,
  currentStreak,
  dayKey,
  loggedOn,
} from '@/lib/habits';
import { getLastDoneAt } from '@/lib/lastDone';
import { useTalkOverlay } from '@/lib/TalkOverlayContext';
import { ChatAgentError, runChatAgent } from '@/lib/chat/agent';
import { applyChatActions } from '@/lib/chat/applyActions';
import { composeAppliedReply } from '@/lib/chat/composeReply';
import { isCloseTalkIntent, resolveLocalIntent } from '@/lib/chat/localIntents';
import { resolveOpenItemId } from '@/lib/chat/openItem';
import type { ChatMessage } from '@/lib/chat/types';
import { blurActiveElement } from '@/lib/a11y';
import { rememberedCaptureHref } from '@/lib/captureContext';
import { getHouseholdPeople } from '@/lib/people';
import {
  loadTalkVoicePrefs,
  saveTalkVoicePrefs,
} from '@/lib/talkVoicePrefs';
import { colors, fonts, radius, spacing } from '@/constants/theme';

type Phase = 'idle' | 'listening' | 'thinking' | 'reply';

const isExpoGo = Constants.appOwnership === 'expo';

const LISTEN_GRADIENT = ['#7A9066', '#C08A3E', '#5F7350', '#E5A95C', '#7A9066'] as const;

function ListeningAura({ active }: { active: boolean }) {
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
      <Animated.View style={[styles.ring, styles.ringOuter, outerStyle]} />
      <Animated.View style={[styles.ring, styles.ringInner, innerStyle]} />
    </>
  );
}

function AnimatedListeningOrb({ busy }: { busy: boolean }) {
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
          colors={[...LISTEN_GRADIENT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <View style={styles.orbFace} pointerEvents="none">
        {busy ? (
          <ActivityIndicator color={colors.pure} />
        ) : (
          <Mic size={32} color={colors.pure} strokeWidth={2} />
        )}
      </View>
    </Animated.View>
  );
}

/**
 * Talk orb — stays open & keeps listening until the user closes it.
 */
export function TalkOrb() {
  const insets = useSafeAreaInsets();
  const { open, closeTalk, focusItemId, setFocusItemId } = useTalkOverlay();
  const router = useRouter();
  const pathname = usePathname();
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

  const [phase, setPhase] = useState<Phase>('idle');
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [apiDown, setApiDown] = useState(false);
  const [viaAi, setViaAi] = useState(false);
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
  const subscriptionsRef = useRef(subscriptionSummary);
  subscriptionsRef.current = subscriptionSummary;
  const focusItemIdRef = useRef<string | null>(focusItemId);
  focusItemIdRef.current = focusItemId;
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

  const goToItem = useCallback(
    (id: string) => {
      stopSpeech();
      setFocusItemId(id);
      closeTalk();
      // Modal must unmount before stack navigation or push is dropped
      setTimeout(() => {
        router.push(`/asset/${id}` as never);
      }, 280);
    },
    [closeTalk, router, setFocusItemId, stopSpeech]
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
    (message: string) => {
      if (handledRef.current || phaseRef.current === 'thinking') return;
      stopRecognition();
      setPhase('idle');
      setError(message);
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
      setViaAi(false);

      const newestId = inventoryRef.current[0]?.id ?? null;

      // Clear UI commands stay on-device (exit / open item)
      const local = resolveLocalIntent(text, {
        focusItemId: focusItemIdRef.current,
        fallbackItemId: newestId,
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
            fallbackFocusId: focusItemIdRef.current || newestId,
            resolveItem: (id) => getById(id),
          }
        );
        if (applied.clearedFocus) setFocusItemId(null);
        else if (applied.focusItemId) setFocusItemId(applied.focusItemId);
        const localReply = composeAppliedReply({
          actions: local.actions,
          modelReply: local.reply,
          addedName: applied.lastAddedName,
          removedNames: applied.removedNames,
        });
        setReply(localReply);
        setViaAi(false);
        setPhase('reply');
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
        console.log('[Talk] → OpenAI', text, 'focus', focusItemIdRef.current);
        const result = await runChatAgent({
          messages: nextHistory,
          inventory: inventoryRef.current,
          lastDone: lastDoneRef.current,
          expenses: expensesRef.current,
          habits: habitsRef.current,
          subscriptions: subscriptionsRef.current,
          session: { focusItemId: focusItemIdRef.current },
          household: householdPeople,
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
        setViaAi(true);
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
        setViaAi(false);
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
      setFocusItemId,
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
        failListen('Speech isn’t available on this device.');
        return;
      }
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        failListen('Allow microphone access to talk.');
        return;
      }
      setPhase('listening');
      // Bias ASR with the user's own inventory names/brands — not a hardcoded brand list
      const fromInventory = inventoryRef.current
        .flatMap((i) => [i.brand, i.name, i.room])
        .filter((s) => s && s !== 'Unknown' && s !== '—')
        .slice(0, 24);
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: false,
        addsPunctuation: false,
        contextualStrings: fromInventory,
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
    failListen(
      event.error === 'not-allowed'
        ? 'Microphone blocked.'
        : event.error === 'no-speech'
          ? 'Still listening…'
          : 'Listening glitch — retrying…'
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
      setViaAi(false);
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
            style={styles.voiceBtn}
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
            style={styles.closeBtn}
            accessibilityLabel="Close Talk"
          >
            <X size={18} color={colors.ink} strokeWidth={2.4} />
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </View>

        {apiDown ? (
          <View
            style={[styles.apiBanner, { top: insets.top + 58 }]}
            pointerEvents="none"
          >
            <Text style={styles.apiBannerText}>
              Chat service offline — Capture and local Talk still work on this device.
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
              <ListeningAura active={orbLive} />
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
                      orbBusy && styles.orbBusy,
                    ]}
                  >
                    {orbBusy ? (
                      <ActivityIndicator color={colors.forestOn} />
                    ) : (
                      <Mic size={32} color={colors.forestOn} strokeWidth={2} />
                    )}
                  </View>
                )}
              </Pressable>
            </View>

            <View style={styles.replySlot}>
              {reply ? (
                <View style={styles.replyCard}>
                  {viaAi ? <Text style={styles.viaAi}>Via AI</Text> : null}
                  <Text style={styles.reply}>{reply}</Text>
                </View>
              ) : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
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

  if (pathname.includes('capture') || pathname.includes('onboarding') || open) return null;

  const onAskScreen =
    (pathname === '/' || pathname.includes('(tabs)')) &&
    !pathname.includes('spaces') &&
    !pathname.includes('search') &&
    !pathname.includes('done') &&
    !pathname.includes('ai');

  return (
    <View
      style={[
        styles.dock,
        { bottom: Math.max(insets.bottom, 12) + 8 },
      ]}
      pointerEvents="box-none"
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
            router.navigate('/(tabs)' as never);
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
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.dockBtn,
        filled && styles.dockBtnFilled,
        pressed && { opacity: 0.88, transform: [{ scale: 0.96 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon
        size={20}
        color={filled ? colors.forestOn : colors.slate}
        strokeWidth={2.1}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 16,
    zIndex: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dockBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0B1220',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  dockBtnFilled: {
    backgroundColor: colors.forest,
    borderColor: colors.forest,
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
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  apiBanner: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 4,
    backgroundColor: colors.amberSoft,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.amber,
  },
  apiBannerText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.ink,
    textAlign: 'center',
  },
  closeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.full,
  },
  closeBtnText: {
    fontFamily: fonts.sansSemi,
    fontSize: 14,
    color: colors.ink,
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
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: spacing.md,
    textAlign: 'center',
    width: '100%',
  },
  heard: {
    fontFamily: fonts.sansMedium,
    fontSize: 18,
    lineHeight: 26,
    color: colors.pure,
    textAlign: 'center',
    marginBottom: spacing.md,
    width: '100%',
  },
  replySlot: {
    marginTop: spacing.lg,
    minHeight: 88,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  replyCard: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  viaAi: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.forest,
    marginBottom: 6,
  },
  reply: {
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
    textAlign: 'center',
  },
  error: {
    marginTop: spacing.md,
    fontFamily: fonts.sans,
    fontSize: 14,
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
    backgroundColor: 'rgba(95, 115, 80, 0.28)',
  },
  ringInner: {
    width: 118,
    height: 118,
    backgroundColor: 'rgba(192, 138, 62, 0.32)',
  },
  orbHit: {
    zIndex: 2,
  },
  orb: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbBusy: {
    backgroundColor: colors.forestBright,
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
