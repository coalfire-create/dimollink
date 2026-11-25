import React, { useEffect, useRef, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mountThreeStage, SCENE } from './three-stage.web';

/**
 * 첫 화면·로그인 옆의 3D 오브젝트 하나 — 폐기물 컨테이너 + "처리 완료" 체크 배지.
 *
 * 토스 계열의 점토(clay) 질감: 둥근 모서리, 매트한 단색, 바닥에 옅은 그림자 하나.
 * 선(와이어프레임)·네온·자동 회전은 쓰지 않는다. 움직임은 두 가지뿐이다 —
 * 마우스를 따라 살짝 기울고, 배지가 천천히 떠 있다. 모션 줄이기 설정이면 멈춘 그림 한 장.
 */
export function HeroObject3D({ style }: { style?: StyleProp<ViewStyle> }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(true);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const stage = mountThreeStage(host, { fov: 28, alpha: true, shadows: true });
    if (!stage) {
      setReady(false);
      return;
    }
    const { scene, camera, renderer } = stage;
    // 색을 토큰 그대로 내려고 톤매핑을 끈다(ACES 는 파랑을 탁하게 만든다).
    renderer.toneMapping = THREE.NoToneMapping;

    camera.position.set(6.2, 4.6, 7.4);
    camera.lookAt(0.25, 0.75, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xe5e8eb, 2.0));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(3, 7, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    const sc = key.shadow.camera;
    sc.left = -4;
    sc.right = 4;
    sc.top = 4;
    sc.bottom = -4;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-5, 2, -2);
    scene.add(fill);

    const clay = (color: number) =>
      new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.55,
        metalness: 0,
        clearcoat: 0.3,
        clearcoatRoughness: 0.5,
      });
    const blue = clay(SCENE.primary);
    const white = clay(0xffffff);
    const grey = clay(SCENE.concrete);
    const greyDark = clay(0xb0b8c1);

    const root = new THREE.Group();
    scene.add(root);

    const block = (
      size: [number, number, number],
      mat: THREE.Material,
      pos: [number, number, number],
      rot: [number, number, number] = [0, 0, 0],
      parent: THREE.Object3D = root,
    ) => {
      const r = Math.min(...size) * 0.28;
      const mesh = new THREE.Mesh(new RoundedBoxGeometry(...size, 4, r), mat);
      mesh.position.set(...pos);
      mesh.rotation.set(...rot);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // 컨테이너 — 바닥 + 네 벽, 위는 열려 있다.
    const W = 2.6;
    const D = 1.5;
    const H = 1.0;
    const T = 0.16;
    block([W, T, D], blue, [0, T / 2, 0]);
    block([W, H, T], blue, [0, H / 2, D / 2 - T / 2]);
    block([W, H, T], blue, [0, H / 2, -D / 2 + T / 2]);
    block([T, H, D], blue, [W / 2 - T / 2, H / 2, 0]);
    block([T, H, D], blue, [-W / 2 + T / 2, H / 2, 0]);

    // 안에 담긴 잔해 — 콘크리트 조각(흰·회색)과 배관 하나.
    block([0.7, 0.5, 0.55], white, [-0.6, 0.55, 0.05], [0.2, 0.4, 0.1]);
    block([0.55, 0.45, 0.5], grey, [0.15, 0.6, -0.15], [-0.15, -0.3, 0.25]);
    block([0.6, 0.4, 0.45], white, [0.75, 0.62, 0.1], [0.1, 0.6, -0.2]);
    block([0.45, 0.35, 0.4], greyDark, [-0.15, 0.95, 0.2], [0.5, 0.2, 0.3]);
    block([0.4, 0.3, 0.35], grey, [0.5, 1.0, -0.2], [-0.3, 0.9, 0.1]);
    block([0.35, 0.3, 0.3], white, [-0.75, 1.0, -0.2], [0.3, -0.5, 0.4]);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.5, 24), greyDark);
    pipe.position.set(0.1, 1.05, 0.35);
    pipe.rotation.set(0, 0.2, Math.PI / 2 - 0.35);
    pipe.castShadow = true;
    root.add(pipe);

    // "처리 완료" 배지 — 흰 원판 위 파란 체크.
    const badge = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.46, 0.14, 48).rotateX(Math.PI / 2),
      white,
    );
    disc.castShadow = true;
    badge.add(disc);
    block([0.1, 0.26, 0.08], blue, [-0.1, -0.05, 0.08], [0, 0, 0.75], badge);
    block([0.1, 0.46, 0.08], blue, [0.1, 0.03, 0.08], [0, 0, -0.62], badge);
    badge.position.set(1.75, 2.45, 0.2);
    badge.lookAt(camera.position);
    root.add(badge);

    // 그림자만 받는 바닥.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.ShadowMaterial({ opacity: 0.08 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const BASE_YAW = -0.3;
    root.rotation.y = BASE_YAW;
    let targetYaw = BASE_YAW;
    let targetPitch = 0;
    const onMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      targetYaw = BASE_YAW + Math.max(-1, Math.min(1, nx)) * 0.3;
      targetPitch = Math.max(-1, Math.min(1, ny)) * 0.06;
    };
    const onLeave = () => {
      targetYaw = BASE_YAW;
      targetPitch = 0;
    };
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);

    const badgeY = badge.position.y;
    stage.start((dt, elapsed) => {
      const k = Math.min(1, dt * 4);
      root.rotation.y += (targetYaw - root.rotation.y) * k;
      root.rotation.x += (targetPitch - root.rotation.x) * k;
      badge.position.y = badgeY + Math.sin(elapsed * 1.3) * 0.06;
    });

    return () => {
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      stage.dispose();
    };
  }, []);

  return (
    <View style={style}>
      {ready ? <div ref={hostRef} style={{ width: '100%', height: '100%' }} /> : null}
    </View>
  );
}
