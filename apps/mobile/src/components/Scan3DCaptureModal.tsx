import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Pedometer } from 'expo-sensors';
import {
  RECOMMENDED_SCAN_SECONDS,
  SCAN_CAPTURE_COPY,
  SCAN_TARGET_LABELS,
  assessScanDuration,
  type ScanDurationAssessment,
  type ScanTarget,
} from '@dimol/shared';
import { useScanCoach } from '../lib/useScanCoach';
import { AppButton } from './ui';
import { theme } from '../theme';

/**
 * 3D 스캔 촬영 — 건물 주위를 한 바퀴 도는 영상을 찍는다.
 *
 * 기존 가이드 촬영([[site-capture-guide]])과 목적이 다르다. 그쪽은 정해진 방향으로
 * 7장을 끊어 찍어 **빠짐없이 담는 것**이 목표고, 여기는 인접 장면이 계속 겹치도록
 * **끊김 없이 도는 것**이 목표다. 겹침이 끊기면 카메라 위치를 못 풀어 복원이 실패한다.
 *
 * 그래서 화면이 하는 일은 하나다 — **지금 이 길이로 충분한지 촬영 중에 알려주는 것.**
 * 다 찍고 서버에서 20분 태운 뒤 실패를 알리면 사용자는 현장을 이미 떠난 뒤다.
 */

export interface Scan3DCaptureResult {
  /** 녹화된 영상 로컬 URI. 업로드는 호출부가 presigned URL 로 처리한다. */
  videoUri: string;
  target: ScanTarget;
  durationSeconds: number;
  /**
   * 촬영 중 걸은 걸음수. 복원된 카메라 경로 길이와 대조해 **실제 치수 배율**을 얻는다
   * ([[scan-volume]] resolveScale). 건축물대장이 없거나 틀린 현장에서 특히 중요하다.
   * 만보계를 못 쓰는 기기에서는 undefined — 대장 역산으로 폴백한다.
   */
  steps?: number;
}

interface Props {
  visible: boolean;
  target: ScanTarget;
  onClose: () => void;
  onComplete: (result: Scan3DCaptureResult) => void;
}

/** 녹화 상한(초). 이보다 길면 업로드·처리 시간만 늘고 복원 품질은 그대로다. */
const MAX_RECORD_SECONDS = 90;

export function Scan3DCaptureModal({ visible, target, onClose, onComplete }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 걸음수 — 한 바퀴 도는 동안의 실제 이동 거리를 재는 유일한 무의존 수단.
  const [steps, setSteps] = useState<number | undefined>();
  const pedometerRef = useRef<{ remove: () => void } | null>(null);

  // 녹화 중 1초마다 경과 시간을 올려 판정 문구를 갱신한다.
  useEffect(() => {
    if (!recording) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    timerRef.current = setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [recording]);

  // 상한에 닿으면 자동 종료(사용자가 계속 돌고 있어도).
  useEffect(() => {
    if (recording && elapsed >= MAX_RECORD_SECONDS) void stop();
  }, [elapsed, recording]);

  useEffect(() => {
    if (!visible) {
      setRecording(false);
      setElapsed(0);
    }
  }, [visible]);

  const assessment: ScanDurationAssessment = assessScanDuration(elapsed);
  // 찍는 도중에 속도·커버리지를 판정해 화면으로 알린다([[scan-coach]]).
  const coach = useScanCoach(recording);

  async function start() {
    if (!cameraRef.current || recording) return;
    setElapsed(0);
    setSteps(undefined);
    setRecording(true);
    void startPedometer();
    try {
      // recordAsync 는 중지될 때까지 resolve 되지 않는다.
      const video = await cameraRef.current.recordAsync({ maxDuration: MAX_RECORD_SECONDS });
      if (video?.uri) {
        onComplete({ videoUri: video.uri, target, durationSeconds: elapsed, steps });
      }
    } catch {
      // 녹화 실패는 사용자 흐름을 막지 않는다 — 다시 시도할 수 있게 상태만 되돌린다.
    } finally {
      stopPedometer();
      setRecording(false);
    }
  }

  /** 만보계 구독. 미지원 기기·권한 거부는 촬영을 막지 않는다(대장 역산으로 폴백). */
  async function startPedometer() {
    try {
      if (!(await Pedometer.isAvailableAsync())) return;
      const permission = await Pedometer.requestPermissionsAsync();
      if (!permission.granted) return;
      setSteps(0);
      pedometerRef.current = Pedometer.watchStepCount((result) => setSteps(result.steps));
    } catch {
      // 만보계는 정확도를 올리는 보조 수단일 뿐 — 실패해도 스캔은 계속된다.
    }
  }

  function stopPedometer() {
    pedometerRef.current?.remove();
    pedometerRef.current = null;
  }

  useEffect(() => stopPedometer, []);

  async function stop() {
    if (!cameraRef.current || !recording) return;
    cameraRef.current.stopRecording();
  }

  if (!visible) return null;

  const needsPermission = !permission?.granted;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        {needsPermission ? (
          <View style={styles.center}>
            <Text style={styles.title}>카메라 권한이 필요합니다</Text>
            <Text style={styles.body}>현장을 촬영해 3D로 만들려면 카메라를 사용해야 해요.</Text>
            <AppButton label="권한 허용하기" onPress={() => void requestPermission()} />
            <Pressable onPress={onClose} style={styles.textButton}>
              <Text style={styles.textButtonLabel}>닫기</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <CameraView ref={cameraRef} style={styles.camera} mode="video" facing="back" />

            <View style={styles.overlay} pointerEvents="box-none">
              <View style={styles.header}>
                <Text style={styles.headerTitle}>{SCAN_TARGET_LABELS[target]}</Text>
                <Text style={styles.headerBody}>
                  {target === 'EXTERIOR'
                    ? SCAN_CAPTURE_COPY.exteriorIntro
                    : SCAN_CAPTURE_COPY.interiorIntro}
                </Text>
              </View>

              {recording ? (
                <View style={styles.statusCard}>
                  <View style={styles.timerRow}>
                    <View style={styles.recDot} />
                    <Text style={styles.timer}>
                      {elapsed}초 / 권장 {RECOMMENDED_SCAN_SECONDS.min}~
                      {RECOMMENDED_SCAN_SECONDS.max}초
                    </Text>
                  </View>
                  {/* 실시간 코치 — 가장 중요한 한 마디만. 걸으면서 여러 줄은 못 읽는다. */}
                  {coach.supported ? (
                    <Text
                      style={[
                        styles.coach,
                        coach.advice.level === 'warn' && styles.coachWarn,
                        coach.advice.level === 'good' && styles.coachGood,
                      ]}
                    >
                      {coach.advice.message}
                    </Text>
                  ) : null}
                  {/* 한 바퀴 커버리지 — 어디를 안 찍었는지 눈으로 보이게. */}
                  {coach.supported ? (
                    <View style={styles.sectorRow}>
                      {coach.state.covered.map((done, i) => (
                        <View
                          key={i}
                          style={[
                            styles.sector,
                            done && styles.sectorDone,
                            coach.state.blurred[i] && styles.sectorBlurred,
                          ]}
                        />
                      ))}
                    </View>
                  ) : null}
                  {/* 촬영 길이 판정 — 다 찍고 실패를 알리는 것보다 지금 말하는 편이 낫다. */}
                  <Text
                    style={[
                      styles.assessment,
                      assessment.hasSelectionSurplus && styles.assessmentGood,
                    ]}
                  >
                    {assessment.message}
                  </Text>
                  {/* 걸음수는 실제 치수 기준이 된다 — 사용자에게도 왜 걸어야 하는지 보인다. */}
                  {steps !== undefined ? (
                    <Text style={styles.steps}>{steps}걸음 — 실제 크기 측정에 쓰입니다</Text>
                  ) : null}
                </View>
              ) : (
                <ScrollView style={styles.tips} contentContainerStyle={styles.tipsContent}>
                  {SCAN_CAPTURE_COPY.tips.map((tip) => (
                    <Text key={tip} style={styles.tip}>
                      • {tip}
                    </Text>
                  ))}
                  <Text style={styles.scaleHint}>{SCAN_CAPTURE_COPY.scaleHint}</Text>
                </ScrollView>
              )}

              <View style={styles.controls}>
                {recording ? (
                  <AppButton
                    label={assessment.ok ? '촬영 완료' : `조금 더 (${elapsed}초)`}
                    onPress={() => void stop()}
                  />
                ) : (
                  <AppButton label="한 바퀴 촬영 시작" onPress={() => void start()} />
                )}
                <Pressable onPress={onClose} style={styles.textButton}>
                  <Text style={styles.textButtonLabel}>닫기</Text>
                </Pressable>
              </View>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const { colors, font, spacing, radius } = theme;

const styles = StyleSheet.create({
  screen: { backgroundColor: theme.colors.cameraBackground, flex: 1 },
  camera: { ...StyleSheet.absoluteFillObject },
  overlay: { flex: 1, justifyContent: 'space-between', padding: spacing.md },
  center: { alignItems: 'center', flex: 1, gap: spacing.md, justifyContent: 'center', padding: spacing.md },
  title: { color: colors.text, fontSize: font.title, fontWeight: '800' },
  body: { color: colors.textMuted, fontSize: font.body, textAlign: 'center' },
  header: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: radius.card,
    padding: spacing.md,
  },
  headerTitle: { color: colors.background, fontSize: font.bodyLarge, fontWeight: '800' },
  headerBody: { color: colors.border, fontSize: font.body, marginTop: spacing.xs },
  statusCard: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: radius.card,
    padding: spacing.md,
  },
  timerRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  recDot: { backgroundColor: colors.error, borderRadius: 6, height: 12, width: 12 },
  timer: { color: colors.background, fontSize: font.bodyLarge, fontWeight: '800' },
  assessment: { color: colors.warningOnDark, fontSize: font.body, marginTop: spacing.xs },
  // 코치 문구는 가장 크고 눈에 띄게 — 걸으면서 흘깃 봐도 읽혀야 한다.
  coach: { color: colors.background, fontSize: font.bodyLarge, fontWeight: '800', marginTop: spacing.xs },
  coachWarn: { color: colors.errorOnDark },
  coachGood: { color: colors.successOnDark },
  sectorRow: { flexDirection: 'row', gap: spacing.xs / 2, marginTop: spacing.xs },
  sector: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 2,
    flex: 1,
    height: 8,
  },
  sectorDone: { backgroundColor: colors.successOnDark },
  sectorBlurred: { backgroundColor: colors.errorOnDark },
  assessmentGood: { color: colors.successOnDark },
  steps: { color: colors.primary, fontSize: font.body, marginTop: spacing.xs },
  tips: { maxHeight: 220 },
  tipsContent: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: radius.card,
    padding: spacing.md,
  },
  tip: { color: colors.border, fontSize: font.body, marginBottom: spacing.xs },
  scaleHint: { color: colors.primary, fontSize: font.body, marginTop: spacing.xs },
  controls: { gap: spacing.sm },
  textButton: { alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  textButtonLabel: { color: colors.background, fontSize: font.body, fontWeight: '700' },
});
