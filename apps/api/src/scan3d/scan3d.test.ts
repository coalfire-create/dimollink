import { SCAN_VIDEO_MAX_BYTES, isValidScanKey, scan3DProgress } from '@dimol/shared';
import { describe, expect, it } from 'vitest';
import { Scan3DQueue } from './queue.js';
import { MockReconstructor, SCAN_STAGE_ORDER, normalizeResult } from './reconstructor.js';
import { buildScanKeys, validateScanPresignInput } from './upload.js';

describe('Scan3DQueue — 진행 단계', () => {
  it('생성 직후는 대기 상태에 진행률 0', () => {
    const job = new Scan3DQueue().createJob();
    expect(job.status).toBe('PENDING');
    expect(job.progress).toBe(0);
  });

  it('단계가 진행되면 진행률이 자동 계산된다', () => {
    const queue = new Scan3DQueue();
    const job = queue.createJob();
    queue.advance(job.id, 'MATCHING');
    const updated = queue.getJob(job.id)!;
    expect(updated.status).toBe('IN_PROGRESS');
    expect(updated.stage).toBe('MATCHING');
    expect(updated.progress).toBe(scan3DProgress('MATCHING'));
  });

  it('완료되면 진행률 1 이고 단계가 지워진다', () => {
    const queue = new Scan3DQueue();
    const job = queue.createJob();
    queue.advance(job.id, 'SPLATTING');
    queue.complete(job.id, {
      grossVolumeM3: 300,
      scaleSource: 'AR_POSE',
      usable: true,
      reasons: [],
      artifacts: {},
      frameCount: 150,
    });
    const done = queue.getJob(job.id)!;
    expect(done.status).toBe('COMPLETED');
    expect(done.progress).toBe(1);
    expect(done.stage).toBeUndefined();
    expect(done.result?.grossVolumeM3).toBe(300);
  });

  it('실패는 사유를 남긴다', () => {
    const queue = new Scan3DQueue();
    const job = queue.createJob();
    queue.fail(job.id, '복원 실패');
    expect(queue.getJob(job.id)?.status).toBe('FAILED');
    expect(queue.getJob(job.id)?.error).toBe('복원 실패');
  });

  it('없는 잡을 갱신해도 터지지 않는다', () => {
    const queue = new Scan3DQueue();
    expect(() => queue.advance('없음', 'MATCHING')).not.toThrow();
    expect(() => queue.fail('없음', 'x')).not.toThrow();
    expect(queue.getJob('없음')).toBeUndefined();
  });

  it('오래된 완료 잡만 정리한다(진행 중인 잡은 남긴다)', () => {
    const queue = new Scan3DQueue();
    const done = queue.createJob();
    const running = queue.createJob();
    queue.complete(done.id, {
      grossVolumeM3: 1, scaleSource: 'NONE', usable: false, reasons: [], artifacts: {}, frameCount: 0,
    });
    queue.advance(running.id, 'MATCHING');

    const later = Date.now() + 48 * 60 * 60 * 1000;
    expect(queue.prune(24 * 60 * 60 * 1000, later)).toBe(1);
    expect(queue.getJob(done.id)).toBeUndefined();
    expect(queue.getJob(running.id)).toBeDefined();
  });
});

describe('MockReconstructor — GPU 없이 전 경로 검증', () => {
  it('단계를 순서대로 보고한다', async () => {
    const stages: string[] = [];
    await new MockReconstructor().reconstruct(
      { jobId: 'j', videoKey: 'k', target: 'EXTERIOR', hasArPose: true },
      (s) => stages.push(s),
    );
    expect(stages).toEqual([...SCAN_STAGE_ORDER]);
  });

  it('대장 연면적이 있으면 층고 3m 기준 부피를 낸다(원단위와 정합)', async () => {
    const result = await new MockReconstructor().reconstruct(
      { jobId: 'j', videoKey: 'k', target: 'EXTERIOR', ledgerFloorAreaM2: 100 },
      () => {},
    );
    expect(result.grossVolumeM3).toBe(300);
    expect(result.scaleSource).toBe('LEDGER_AREA');
    expect(result.usable).toBe(true);
  });

  it('스케일 근거가 없으면 쓸 수 없다고 표시한다', async () => {
    const result = await new MockReconstructor().reconstruct(
      { jobId: 'j', videoKey: 'k', target: 'EXTERIOR' },
      () => {},
    );
    expect(result.usable).toBe(false);
    expect(result.reasons.join()).toContain('치수');
  });
});

describe('normalizeResult — 복원 서버 응답 정규화', () => {
  it('usable 을 말해주지 않으면 쓰지 않는다(모르면 안 쓰는 쪽이 안전)', () => {
    expect(normalizeResult({ grossVolumeM3: 300 }).usable).toBe(false);
  });

  it('알 수 없는 스케일 출처는 NONE 으로 떨어뜨린다', () => {
    expect(normalizeResult({ scaleSource: '수상한값' }).scaleSource).toBe('NONE');
    expect(normalizeResult({ scaleSource: 'AR_POSE' }).scaleSource).toBe('AR_POSE');
  });

  it('누락 필드는 안전한 기본값으로 채운다', () => {
    const r = normalizeResult({});
    expect(r.grossVolumeM3).toBe(0);
    expect(r.reasons).toEqual([]);
    expect(r.frameCount).toBe(0);
  });

  it('산출물 key 를 계약 필드명으로 옮긴다', () => {
    const r = normalizeResult({ artifacts: { scene: 'a.ply', mesh: 'b.glb', thumbnail: 'c.jpg' } });
    expect(r.artifacts.splatKey).toBe('a.ply');
    expect(r.artifacts.meshKey).toBe('b.glb');
    expect(r.artifacts.thumbnailKey).toBe('c.jpg');
  });
});

describe('영상 업로드 presign 검증', () => {
  it('mp4·mov 를 허용한다', () => {
    for (const contentType of ['video/mp4', 'video/quicktime']) {
      expect(validateScanPresignInput({ contentType, contentLength: 1000 }).ok).toBe(true);
    }
  });

  it('허용되지 않는 형식을 막는다', () => {
    const result = validateScanPresignInput({ contentType: 'video/avi', contentLength: 1000 });
    expect(result.ok).toBe(false);
  });

  it('크기 상한을 넘으면 더 짧게 찍으라고 안내한다', () => {
    const result = validateScanPresignInput({
      contentType: 'video/mp4',
      contentLength: SCAN_VIDEO_MAX_BYTES + 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('짧게');
  });

  it('크기 누락·0 을 막는다', () => {
    expect(validateScanPresignInput({ contentType: 'video/mp4' }).ok).toBe(false);
    expect(validateScanPresignInput({ contentType: 'video/mp4', contentLength: 0 }).ok).toBe(false);
  });

  it('본문이 없으면 막는다', () => {
    expect(validateScanPresignInput(null).ok).toBe(false);
  });
});

describe('스캔 오브젝트 키', () => {
  it('스캔 id 하나로 산출물을 묶는다(정리·삭제가 쉽게)', () => {
    const keys = buildScanKeys('video/mp4');
    expect(keys.video).toBe(`site-scans/${keys.scanId}/video.mp4`);
    expect(keys.scene).toBe(`site-scans/${keys.scanId}/scene.ply`);
    expect(keys.mesh).toBe(`site-scans/${keys.scanId}/mesh.glb`);
  });

  it('mov 확장자를 반영한다', () => {
    expect(buildScanKeys('video/quicktime').video).toMatch(/\.mov$/);
  });

  it('발급한 키가 모두 검증을 통과한다', () => {
    const keys = buildScanKeys('video/mp4');
    for (const key of [keys.video, keys.scene, keys.mesh, keys.thumbnail]) {
      expect(isValidScanKey(key)).toBe(true);
    }
  });

  it('임의 경로·경로 탈출을 막는다', () => {
    expect(isValidScanKey('site-scans/../secret')).toBe(false);
    expect(isValidScanKey('other/x/video.mp4')).toBe(false);
    expect(isValidScanKey('site-scans/notauuid/video.mp4')).toBe(false);
  });

  it('키에 PII 가 들어가지 않는다(UUID 만)', () => {
    const keys = buildScanKeys('video/mp4');
    expect(keys.scanId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
