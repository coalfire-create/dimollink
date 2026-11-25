import * as THREE from 'three';
import { theme } from '../../theme';

export interface MountedThreeStage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Starts frame loop; callback receives delta seconds (capped) and elapsed time. */
  start: (onFrame: (dt: number, elapsed: number) => void) => void;
  /** Cleanly stops loop, disconnects observers, and frees GPU memory. */
  dispose: () => void;
}

/**
 * Shared Three.js WebGL stage helper used across landing, auth, and studio scenes.
 * Handles capped DPR, tone mapping, soft shadows, ResizeObserver, visibility/intersection
 * pausing, reduced-motion awareness, and deterministic resource disposal.
 */
export function mountThreeStage(
  container: HTMLDivElement,
  options: {
    fov?: number;
    near?: number;
    far?: number;
    alpha?: boolean;
    shadows?: boolean;
  } = {},
): MountedThreeStage | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: options.alpha ?? true,
      powerPreference: 'high-performance',
    });
  } catch {
    return null;
  }

  const width = Math.max(container.clientWidth, 1);
  const height = Math.max(container.clientHeight, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = options.shadows ?? true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const canvas = renderer.domElement;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    options.fov ?? 36,
    width / height,
    options.near ?? 0.1,
    options.far ?? 100,
  );

  let rafId = 0;
  let disposed = false;
  let visibleInViewport = true;
  let pageVisible = typeof document !== 'undefined' ? !document.hidden : true;
  let frameHandler: ((dt: number, elapsed: number) => void) | null = null;
  let lastTime = performance.now();
  let elapsed = 0;

  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderOnce = (dt: number) => {
    if (disposed || !frameHandler) return;
    frameHandler(dt, elapsed);
    renderer.render(scene, camera);
  };

  const tick = (now: number) => {
    if (disposed) return;
    const rawDt = (now - lastTime) / 1000;
    lastTime = now;
    const dt = Math.min(Math.max(rawDt, 0), 0.05);
    elapsed += dt;
    renderOnce(dt);
    if (!reducedMotion && visibleInViewport && pageVisible) {
      rafId = window.requestAnimationFrame(tick);
    } else {
      rafId = 0;
    }
  };

  const syncLoop = () => {
    if (disposed || !frameHandler) return;
    if (reducedMotion) {
      renderOnce(0);
      return;
    }
    const shouldRun = visibleInViewport && pageVisible;
    if (shouldRun && rafId === 0) {
      lastTime = performance.now();
      rafId = window.requestAnimationFrame(tick);
    } else if (!shouldRun && rafId !== 0) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };

  const handleResize = () => {
    if (disposed) return;
    const nextW = Math.max(container.clientWidth, 1);
    const nextH = Math.max(container.clientHeight, 1);
    camera.aspect = nextW / nextH;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(nextW, nextH, false);
    if (reducedMotion) renderOnce(0);
  };

  const resizeObserver =
    typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
  resizeObserver?.observe(container);

  const intersectionObserver =
    typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(
          (entries) => {
            visibleInViewport = entries.some((entry) => entry.isIntersecting);
            syncLoop();
          },
          { threshold: 0.05 },
        )
      : null;
  intersectionObserver?.observe(container);

  const onVisibilityChange = () => {
    pageVisible = !document.hidden;
    syncLoop();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  return {
    renderer,
    scene,
    camera,
    start(onFrame) {
      frameHandler = onFrame;
      syncLoop();
    },
    dispose() {
      disposed = true;
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      disposeObject3D(scene);
      renderer.dispose();
      if (canvas.parentNode === container) {
        container.removeChild(canvas);
      }
    },
  };
}

/** Traverses a scene graph and disposes every geometry and material cleanly. */
export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const material = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
    if (Array.isArray(material)) {
      for (const m of material) m.dispose();
    } else if (material) {
      material.dispose();
    }
  });
}

/** Adds thin architectural blueprint edge lines around a solid BufferGeometry. */
export function createEdgeLines(
  geometry: THREE.BufferGeometry,
  colorHex: number,
  opacity = 0.45,
): THREE.LineSegments {
  const edges = new THREE.EdgesGeometry(geometry, 24);
  const mat = new THREE.LineBasicMaterial({
    color: colorHex,
    transparent: opacity < 1,
    opacity,
  });
  return new THREE.LineSegments(edges, mat);
}

const hex = (css: string) => parseInt(css.replace('#', ''), 16);

/**
 * 3D 모형 색 — 디자인 토큰(메인 코발트 + 보조 테라코타 + 스톤/먹색)에서만 가져온다.
 * 장면마다 hex 를 따로 적으면 앱 색과 어긋나고 "AI가 뽑은 네온 3D"처럼 보인다.
 */
export const SCENE = {
  primary: hex(theme.colors.primary),
  secondary: hex(theme.colors.secondary),
  /** 콘크리트·철골 — 앱의 스톤/먹색 계열. */
  concrete: hex(theme.colors.borderStrong),
  concreteDark: hex(theme.colors.textMuted),
  steel: hex(theme.colors.text),
  ground: hex(theme.onDark.surface),
  groundLine: hex(theme.onDark.divider),
  canvas: hex(theme.onDark.canvas),
  /** 윤곽선 — 색을 입히지 않고 어두운 선으로만 형태를 잡는다. */
  edge: hex(theme.onDark.border),
} as const;
