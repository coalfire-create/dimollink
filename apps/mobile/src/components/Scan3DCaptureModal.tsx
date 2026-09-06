import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  RECOMMENDED_SCAN_SECONDS,
  SCAN_CAPTURE_COPY,
  SCAN_TARGET_LABELS,
  assessScanDuration,
  type ScanDurationAssessment,
  type ScanTarget,
} from '@dimol/shared';
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

  async function start() {
    if (!cameraRef.current || recording) return;
    setElapsed(0);
    setRecording(true);
    try {
      // recordAsync 는 중지될 때까지 resolve 되지 않는다.
      const video = await cameraRef.current.recordAsync({ maxDuration: MAX_RECORD_SECONDS });
      if (video?.uri) {
        onComplete({ videoUri: video.uri, target, durationSeconds: elapsed });
      }
    } catch {
      // 녹화 실패는 사용자 흐름을 막지 않는다 — 다시 시도할 수 있게 상태만 되돌린다.
    } finally {
      setRecording(false);
    }
  }

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
                  {/* 촬영 중 판정 — 다 찍고 실패를 알리는 것보다 지금 말하는 편이 낫다. */}
                  <Text
                    style={[
                      styles.assessment,
                      assessment.hasSelectionSurplus && styles.assessmentGood,
                    ]}
                  >
                    {assessment.message}
                  </Text>
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
  screen: { backgroundColor: '#000000', flex: 1 },
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
  headerTitle: { color: '#FFFFFF', fontSize: font.bodyLarge, fontWeight: '800' },
  headerBody: { color: '#E5E7EB', fontSize: font.body, marginTop: spacing.xs },
  statusCard: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: radius.card,
    padding: spacing.md,
  },
  timerRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  recDot: { backgroundColor: colors.error, borderRadius: 6, height: 12, width: 12 },
  timer: { color: '#FFFFFF', fontSize: font.bodyLarge, fontWeight: '800' },
  assessment: { color: '#FCD34D', fontSize: font.body, marginTop: spacing.xs },
  assessmentGood: { color: '#6EE7B7' },
  tips: { maxHeight: 220 },
  tipsContent: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: radius.card,
    padding: spacing.md,
  },
  tip: { color: '#E5E7EB', fontSize: font.body, marginBottom: spacing.xs },
  scaleHint: { color: '#93C5FD', fontSize: font.body, marginTop: spacing.xs },
  controls: { gap: spacing.sm },
  textButton: { alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  textButtonLabel: { color: '#FFFFFF', fontSize: font.body, fontWeight: '700' },
});
