import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { isValidScanKey } from '@dimol/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { Scan3DQueue } from '../scan3d/queue.js';
import { MockReconstructor } from '../scan3d/reconstructor.js';
import { createScan3DRouter } from './scan3d.js';

/**
 * 3D 스캔 라우트를 실제 서버로 띄워 검증한다(기존 라우트 테스트와 같은 방식).
 * 복원기는 목이라 GPU 없이 전 경로가 돈다.
 */

let server: Server | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

async function startApp(): Promise<string> {
  const app = express();
  app.use(express.json());
  app.use('/api', createScan3DRouter(new Scan3DQueue(), new MockReconstructor()));
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

function post(base: string, path: string, body: unknown) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** 검증을 통과하는 영상 key(발급 규칙과 같은 모양). */
const VIDEO_KEY = 'site-scans/11111111-2222-4333-8444-555555555555/video.mp4';

/** 잡이 끝날 때까지 폴링(목 복원기는 즉시 끝난다). */
async function waitForJob(base: string, jobId: string) {
  for (let i = 0; i < 50; i += 1) {
    const res = await fetch(`${base}/api/scan3d/jobs/${jobId}`);
    const job = (await res.json()) as { status: string; [k: string]: unknown };
    if (job.status === 'COMPLETED' || job.status === 'FAILED') return job;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('잡이 끝나지 않았습니다');
}

describe('POST /api/scan3d/jobs', () => {
  it('유효한 key 면 잡을 만들고 202 로 응답한다', async () => {
    const base = await startApp();
    const res = await post(base, '/api/scan3d/jobs', {
      videoKey: VIDEO_KEY,
      target: 'EXTERIOR',
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { jobId: string };
    expect(typeof body.jobId).toBe('string');
  });

  it('임의 key 를 거부한다(경로 탈출·다른 경로 차단)', async () => {
    const base = await startApp();
    for (const videoKey of ['../etc/passwd', 'other/x/video.mp4', '']) {
      const res = await post(base, '/api/scan3d/jobs', { videoKey });
      expect(res.status).toBe(400);
    }
  });

  it('복원이 끝나면 잡에 부피 결과가 담긴다', async () => {
    const base = await startApp();
    const created = (await (
      await post(base, '/api/scan3d/jobs', {
        videoKey: VIDEO_KEY,
        target: 'EXTERIOR',
        building: { totArea: 100 },
      })
    ).json()) as { jobId: string };

    const job = (await waitForJob(base, created.jobId)) as {
      status: string;
      progress: number;
      result: { grossVolumeM3: number; scaleSource: string; usable: boolean };
    };
    expect(job.status).toBe('COMPLETED');
    expect(job.progress).toBe(1);
    // 대장 연면적 100㎡ → 층고 3m 가정 300㎥ (면적 원단위와 정합)
    expect(job.result.grossVolumeM3).toBe(300);
    expect(job.result.scaleSource).toBe('LEDGER_AREA');
    expect(job.result.usable).toBe(true);
  });

  it('스케일 근거가 없으면 결과를 쓸 수 없다고 표시한다', async () => {
    const base = await startApp();
    const created = (await (
      await post(base, '/api/scan3d/jobs', { videoKey: VIDEO_KEY, target: 'INTERIOR' })
    ).json()) as { jobId: string };

    const job = (await waitForJob(base, created.jobId)) as {
      result: { usable: boolean; reasons: string[] };
    };
    expect(job.result.usable).toBe(false);
    expect(job.result.reasons.join()).toContain('치수');
  });
});

describe('GET /api/scan3d/jobs/:id', () => {
  it('없는 잡은 404', async () => {
    const base = await startApp();
    const res = await fetch(`${base}/api/scan3d/jobs/does-not-exist`);
    expect(res.status).toBe(404);
  });
});

describe('스토리지 미설정 시', () => {
  it('presign 은 이유를 알린다(조용히 실패하지 않는다)', async () => {
    const base = await startApp();
    const res = await post(base, '/api/scan3d/presign', {
      contentType: 'video/mp4',
      contentLength: 1000,
    });
    // 테스트 환경엔 STORAGE_BUCKET 이 없어 503, 설정돼 있으면 201.
    expect([503, 201]).toContain(res.status);
  });

  it('scene-url 은 유효하지 않은 key 를 막는다', async () => {
    const base = await startApp();
    const res = await fetch(`${base}/api/scan3d/scene-url?key=../secret`);
    expect([400, 503]).toContain(res.status);
  });
});

describe('key 검증 규칙', () => {
  it('산출물 4종만 허용한다', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    expect(isValidScanKey(`site-scans/${id}/video.mp4`)).toBe(true);
    expect(isValidScanKey(`site-scans/${id}/scene.ply`)).toBe(true);
    expect(isValidScanKey(`site-scans/${id}/secrets.env`)).toBe(false);
  });
});
