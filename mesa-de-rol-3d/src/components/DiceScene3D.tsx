import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { DEFAULT_DICE_CONFIG, DiceConfig, DiceType, TableSurface } from '../types';
import { createTableEnvironment } from './TableDecor3D';

export interface DiceCanvasElement extends HTMLCanvasElement {
  __throwDice?: () => void;
  __spawnDice?: (type: DiceType, count: number) => void;
  __updateSurface?: (surface: TableSurface) => void;
  __rebuildDiceAssets?: (config?: DiceConfig) => void;
  __resetCamera?: () => void;
}

interface DiceScene3DProps {
  currentDiceType: DiceType;
  currentDiceCount: number;
  onRollComplete: (resultText: string, totalValue: number, individualValues: number[]) => void;
  onRollStart: () => void;
  rollTrigger: number;
  diceConfig?: DiceConfig;
  tableSurface?: TableSurface;
  soundEnabled?: boolean;
}

interface DiceItem {
  mesh: THREE.Mesh;
  body: CANNON.Body;
  index: number;
  diceType: DiceType;
}

interface SceneState {
  scene: THREE.Scene | null;
  camera: THREE.PerspectiveCamera | null;
  renderer: THREE.WebGLRenderer | null;
  world: CANNON.World | null;
  floorMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> | null;
  diceList: DiceItem[];
  currentDiceType: DiceType;
  currentDiceCount: number;
  isRolling: boolean;
  audioCtx: AudioContext | null;
  checkInterval: ReturnType<typeof setInterval> | null;
  targetRadius: number;
  cameraRadius: number;
  targetTheta: number;
  cameraTheta: number;
  targetPhi: number;
  cameraPhi: number;
  lookAtTarget: THREE.Vector3;
  d4Mats?: THREE.MeshStandardMaterial[];
  d6Mats?: THREE.MeshStandardMaterial[];
  d8Mats?: THREE.MeshStandardMaterial[];
  d10Mats?: THREE.MeshStandardMaterial[];
  d100TensMats?: THREE.MeshStandardMaterial[];
  d12Mats?: THREE.MeshStandardMaterial[];
  d20Mats?: THREE.MeshStandardMaterial[];
  d4Geom?: THREE.BufferGeometry;
  d6Geom?: THREE.BufferGeometry;
  d8Geom?: THREE.BufferGeometry;
  d10Geom?: THREE.BufferGeometry;
  d12Geom?: THREE.BufferGeometry;
  d20Geom?: THREE.BufferGeometry;
  d4Shape?: CANNON.ConvexPolyhedron;
  d6Shape?: CANNON.Box;
  d8Shape?: CANNON.ConvexPolyhedron;
  d10Shape?: CANNON.ConvexPolyhedron;
  d12Shape?: CANNON.ConvexPolyhedron;
  d20Shape?: CANNON.ConvexPolyhedron;
}

export const DiceScene3D: React.FC<DiceScene3DProps> = ({
  currentDiceType,
  currentDiceCount,
  onRollComplete,
  onRollStart,
  rollTrigger,
  diceConfig,
  tableSurface = 'dark_wood',
  soundEnabled = true,
}) => {
  const canvasRef = useRef<DiceCanvasElement | null>(null);
  const diceConfigRef = useRef<DiceConfig>(diceConfig || DEFAULT_DICE_CONFIG);
  diceConfigRef.current = diceConfig || DEFAULT_DICE_CONFIG;

  const diceTypeRef = useRef<DiceType>(currentDiceType);
  diceTypeRef.current = currentDiceType;

  const diceCountRef = useRef<number>(currentDiceCount);
  diceCountRef.current = currentDiceCount;

  const onRollCompleteRef = useRef(onRollComplete);
  onRollCompleteRef.current = onRollComplete;

  const onRollStartRef = useRef(onRollStart);
  onRollStartRef.current = onRollStart;

  const tableSurfaceRef = useRef<TableSurface>(tableSurface);
  tableSurfaceRef.current = tableSurface;

  const soundEnabledRef = useRef<boolean>(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  const stateRef = useRef<SceneState>({
    scene: null,
    camera: null,
    renderer: null,
    world: null,
    floorMesh: null,
    diceList: [],
    currentDiceType,
    currentDiceCount,
    isRolling: false,
    audioCtx: null,
    checkInterval: null,
    targetRadius: 18.5,
    cameraRadius: 18.5,
    targetTheta: 0,
    cameraTheta: 0,
    targetPhi: 0.95,
    cameraPhi: 0.95,
    lookAtTarget: new THREE.Vector3(0, 0.2, 0),
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const state = stateRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0c0a08');
    scene.fog = new THREE.FogExp2('#0c0a08', 0.015);
    state.scene = scene;

    const getViewportSize = () => {
      const parent = canvas.parentElement;
      const width = Math.max(1, parent?.clientWidth || window.innerWidth || 1);
      const height = Math.max(1, parent?.clientHeight || window.innerHeight || 1);
      return { width, height };
    };

    const { width: initialWidth, height: initialHeight } = getViewportSize();
    const camera = new THREE.PerspectiveCamera(42, initialWidth / initialHeight, 0.1, 100);
    state.camera = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(initialWidth, initialHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    state.renderer = renderer;

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTexture = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    roomEnv.dispose();
    pmremGenerator.dispose();
    scene.environment = envTexture;
    scene.environmentIntensity = 0.55;

    const hemiLight = new THREE.HemisphereLight(0x9fb8df, 0x26170b, 0.42);
    scene.add(hemiLight);

    const ambientLight = new THREE.AmbientLight(0xfff1dd, 0.35);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff5dc, 1.65);
    keyLight.position.set(12, 24, 14);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 65;
    keyLight.shadow.camera.left = -16;
    keyLight.shadow.camera.right = 16;
    keyLight.shadow.camera.top = 16;
    keyLight.shadow.camera.bottom = -16;
    keyLight.shadow.bias = -0.0003;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x9fc2ff, 0.48);
    fillLight.position.set(-14, 12, -14);
    scene.add(fillLight);

    const world = new CANNON.World();
    world.gravity.set(0, -36, 0);
    state.world = world;

    const groundMat = new CANNON.Material('ground');
    const diceMat = new CANNON.Material('dice');

    const groundDiceContact = new CANNON.ContactMaterial(groundMat, diceMat, {
      friction: 0.52,
      restitution: 0.28,
      contactEquationStiffness: 1e7,
      contactEquationRelaxation: 3,
    });
    const diceDiceContact = new CANNON.ContactMaterial(diceMat, diceMat, {
      friction: 0.48,
      restitution: 0.32,
    });

    world.addContactMaterial(groundDiceContact);
    world.addContactMaterial(diceDiceContact);
    world.defaultContactMaterial.friction = 0.55;
    world.defaultContactMaterial.restitution = 0.25;

    const groundBody = new CANNON.Body({ mass: 0, material: groundMat });
    groundBody.addShape(new CANNON.Plane());
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    world.addBody(groundBody);

    const arenaRadius = 7.5;
    const tableEnv = createTableEnvironment(
      arenaRadius,
      tableSurfaceRef.current,
      renderer.capabilities.getMaxAnisotropy()
    );
    scene.add(tableEnv.group);
    const wallSegments = 12;
    const wallHeight = 8;
    const wallThickness = 1;
    const segmentAngle = (Math.PI * 2) / wallSegments;
    const segmentWidth = 2 * arenaRadius * Math.tan(Math.PI / wallSegments) + 0.4;

    for (let i = 0; i < wallSegments; i++) {
      const angle = i * segmentAngle + segmentAngle / 2;
      const x = Math.cos(angle) * (arenaRadius + wallThickness / 2);
      const z = Math.sin(angle) * (arenaRadius + wallThickness / 2);
      const wallBody = new CANNON.Body({ mass: 0, material: groundMat });
      wallBody.addShape(new CANNON.Box(new CANNON.Vec3(segmentWidth / 2 + 0.5, wallHeight, wallThickness)));
      wallBody.position.set(x, wallHeight / 2, z);
      wallBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -angle + Math.PI / 2);
      world.addBody(wallBody);
    }

    function paintDieFaceBackground(
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      config: DiceConfig
    ) {
      const grad = ctx.createRadialGradient(
        width * 0.5,
        height * 0.5,
        width * 0.08,
        width * 0.5,
        height * 0.5,
        width * 0.72
      );
      grad.addColorStop(0, config.primaryColor || '#2e2318');
      grad.addColorStop(0.65, config.primaryColor || '#1a130c');
      grad.addColorStop(1, config.secondaryColor || '#0c0805');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      const isIvory = config.themeId === 'ivory';
      for (let i = 0; i < 18; i++) {
        const cx = Math.random() * width;
        const cy = Math.random() * height;
        const r = 20 + Math.random() * 50;
        const spot = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
        spot.addColorStop(0, isIvory ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.12)');
        spot.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = spot;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawDieNumeral(
      ctx: CanvasRenderingContext2D,
      text: string,
      x: number,
      y: number,
      fontSize: number,
      config: DiceConfig,
      showDot = false,
      dotOffset = 60
    ) {
      ctx.save();
      ctx.font = `bold ${fontSize}px "Cinzel", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const isIvory = config.themeId === 'ivory';
      const shadowColor = isIvory ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.95)';
      const strokeColor = isIvory ? '#f2e8d5' : '#000000';

      ctx.fillStyle = shadowColor;
      ctx.fillText(text, x + 3, y + 4);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = Math.max(6, fontSize * 0.1);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeText(text, x, y);
      ctx.fillStyle = config.numeralColor || '#fff9e6';
      ctx.fillText(text, x, y);

      if (showDot) {
        const r = Math.max(7, fontSize * 0.07);
        ctx.fillStyle = shadowColor;
        ctx.beginPath();
        ctx.arc(x + 2, y + dotOffset + 2, r + 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y + dotOffset, r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = config.numeralColor || '#fff9e6';
        ctx.beginPath();
        ctx.arc(x, y + dotOffset, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function buildD6Materials(config: DiceConfig): THREE.MeshStandardMaterial[] {
      const mats: THREE.MeshStandardMaterial[] = [];
      for (let i = 1; i <= 6; i++) {
        const texCanvas = document.createElement('canvas');
        texCanvas.width = 512;
        texCanvas.height = 512;
        const ctx = texCanvas.getContext('2d')!;
        paintDieFaceBackground(ctx, 512, 512, config);

        ctx.strokeStyle = config.numeralColor || '#ba9858';
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 14;
        ctx.strokeRect(20, 20, 472, 472);

        ctx.strokeStyle = config.secondaryColor || '#4a361c';
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 8;
        ctx.strokeRect(36, 36, 440, 440);
        ctx.globalAlpha = 1;

        drawDieNumeral(ctx, i.toString(), 256, 256, 240, config, i === 6, 115);

        const texture = new THREE.CanvasTexture(texCanvas);
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        mats.push(
          new THREE.MeshStandardMaterial({
            map: texture,
            roughness: config.roughness ?? 0.35,
            metalness: config.metalness ?? 0.8,
          })
        );
      }
      return [mats[0], mats[5], mats[1], mats[4], mats[2], mats[3]];
    }

    function buildStandardPolyMaterials(
      count: number,
      values: number[],
      config: DiceConfig
    ): THREE.MeshStandardMaterial[] {
      const mats: THREE.MeshStandardMaterial[] = [];
      for (let i = 0; i < count; i++) {
        const val = values[i];
        const label = val.toString();
        const texCanvas = document.createElement('canvas');
        texCanvas.width = 512;
        texCanvas.height = 512;
        const ctx = texCanvas.getContext('2d')!;
        paintDieFaceBackground(ctx, 512, 512, config);
        const fontSize = label.length > 2 ? 150 : label.length > 1 ? 170 : 210;
        drawDieNumeral(ctx, label, 256, 256, fontSize, config, val === 6 || val === 9, 95);

        const texture = new THREE.CanvasTexture(texCanvas);
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        mats.push(
          new THREE.MeshStandardMaterial({
            map: texture,
            roughness: config.roughness ?? 0.35,
            metalness: config.metalness ?? 0.8,
          })
        );
      }
      return mats;
    }

    function buildD10Materials(
      values: number[],
      isTens = false,
      config: DiceConfig
    ): THREE.MeshStandardMaterial[] {
      const mats: THREE.MeshStandardMaterial[] = [];
      for (let i = 0; i < values.length; i++) {
        const val = values[i];
        const label = isTens ? (val === 0 ? '00' : (val * 10).toString()) : val.toString();
        const texCanvas = document.createElement('canvas');
        texCanvas.width = 512;
        texCanvas.height = 512;
        const ctx = texCanvas.getContext('2d')!;
        paintDieFaceBackground(ctx, 512, 512, config);
        drawDieNumeral(ctx, label, 256, 295, isTens ? 160 : 200, config, !isTens && (val === 6 || val === 9), 95);

        const texture = new THREE.CanvasTexture(texCanvas);
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        mats.push(
          new THREE.MeshStandardMaterial({
            map: texture,
            roughness: config.roughness ?? 0.35,
            metalness: config.metalness ?? 0.8,
          })
        );
      }
      return mats;
    }

    function buildD4Materials(faceNumbers: number[][], config: DiceConfig): THREE.MeshStandardMaterial[] {
      const mats: THREE.MeshStandardMaterial[] = [];
      for (let i = 0; i < 4; i++) {
        const nums = faceNumbers[i];
        const texCanvas = document.createElement('canvas');
        texCanvas.width = 512;
        texCanvas.height = 512;
        const ctx = texCanvas.getContext('2d')!;
        paintDieFaceBackground(ctx, 512, 512, config);

        ctx.strokeStyle = config.numeralColor || '#ba9858';
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(256, 40);
        ctx.lineTo(472, 452);
        ctx.lineTo(40, 452);
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 1;

        drawDieNumeral(ctx, nums[0].toString(), 256, 130, 92, config);
        drawDieNumeral(ctx, nums[1].toString(), 126, 384, 92, config);
        drawDieNumeral(ctx, nums[2].toString(), 386, 384, 92, config);

        const texture = new THREE.CanvasTexture(texCanvas);
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        mats.push(
          new THREE.MeshStandardMaterial({
            map: texture,
            roughness: config.roughness ?? 0.35,
            metalness: config.metalness ?? 0.8,
          })
        );
      }
      return mats;
    }

    function computeFaceNormal(verts: THREE.Vector3[], face: number[]): THREE.Vector3 {
      const a = verts[face[0]];
      const b = verts[face[1]];
      const c = verts[face[2]];
      const ab = new THREE.Vector3().subVectors(b, a);
      const bc = new THREE.Vector3().subVectors(c, b);
      const n = new THREE.Vector3().crossVectors(bc, ab);
      if (n.lengthSq() > 0) n.normalize();
      n.negate();
      return n;
    }

    function ensureOutwardWinding(verts: THREE.Vector3[], faces: number[][]): number[][] {
      return faces.map((face) => {
        const centroid = new THREE.Vector3();
        face.forEach((idx) => centroid.add(verts[idx]));
        centroid.divideScalar(face.length);

        const forward = [...face];
        if (computeFaceNormal(verts, forward).dot(centroid) >= 0) return forward;

        const reversed = [...face].reverse();
        if (computeFaceNormal(verts, reversed).dot(centroid) >= 0) return reversed;

        for (let shift = 1; shift < face.length; shift++) {
          const rotated = face.slice(shift).concat(face.slice(0, shift));
          if (computeFaceNormal(verts, rotated).dot(centroid) >= 0) return rotated;
        }
        for (let shift = 1; shift < reversed.length; shift++) {
          const rotated = reversed.slice(shift).concat(reversed.slice(0, shift));
          if (computeFaceNormal(verts, rotated).dot(centroid) >= 0) return rotated;
        }
        return forward;
      });
    }

    const d4RawFaces = [
      [1, 3, 2],
      [0, 2, 3],
      [0, 3, 1],
      [0, 1, 2],
    ];
    const d4BaseVerts = [
      new THREE.Vector3(1, 1, 1),
      new THREE.Vector3(1, -1, -1),
      new THREE.Vector3(-1, 1, -1),
      new THREE.Vector3(-1, -1, 1),
    ];
    const d4PeakDirs = d4BaseVerts;
    const d4Faces = ensureOutwardWinding(d4BaseVerts, d4RawFaces);
    const d4FaceNumbers = d4Faces.map((f) => [f[0] + 1, f[1] + 1, f[2] + 1]);

    const d8R = 1.3;
    const d8BaseVerts = [
      new THREE.Vector3(d8R, 0, 0),
      new THREE.Vector3(-d8R, 0, 0),
      new THREE.Vector3(0, d8R, 0),
      new THREE.Vector3(0, -d8R, 0),
      new THREE.Vector3(0, 0, d8R),
      new THREE.Vector3(0, 0, -d8R),
    ];
    const d8Faces = ensureOutwardWinding(d8BaseVerts, [
      [2, 4, 0],
      [2, 1, 4],
      [2, 5, 1],
      [2, 0, 5],
      [3, 1, 5],
      [3, 5, 0],
      [3, 0, 4],
      [3, 4, 1],
    ]);
    const d8Values = [1, 2, 3, 4, 8, 7, 6, 5];
    const d8Normals = d8Faces.map((f) => {
      const a = d8BaseVerts[f[0]];
      const b = d8BaseVerts[f[1]];
      const c = d8BaseVerts[f[2]];
      return new THREE.Vector3()
        .crossVectors(new THREE.Vector3().subVectors(b, a), new THREE.Vector3().subVectors(c, b))
        .normalize();
    });

    const d10H = 1.35;
    const d10R = 1.25;
    const d10Step = (2 * Math.PI) / 10;
    const d10ZOffset = (d10H * (1 - Math.cos(d10Step))) / (1 + Math.cos(d10Step));
    const d10BaseVerts: THREE.Vector3[] = [];
    for (let i = 0; i < 10; i++) {
      const a = i * d10Step;
      d10BaseVerts.push(new THREE.Vector3(d10R * Math.cos(a), i % 2 === 0 ? -d10ZOffset : +d10ZOffset, d10R * Math.sin(a)));
    }
    d10BaseVerts.push(new THREE.Vector3(0, d10H, 0));
    d10BaseVerts.push(new THREE.Vector3(0, -d10H, 0));

    const d10Faces: number[][] = [];
    for (let i = 0; i < 10; i++) {
      const prev = (i - 1 + 10) % 10;
      const next = (i + 1) % 10;
      if (i % 2 === 0) {
        d10Faces.push([10, next, i, prev]);
      } else {
        d10Faces.push([11, prev, i, next]);
      }
    }
    const d10Values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const d10Normals = d10Faces.map((f) => {
      const a = d10BaseVerts[f[0]];
      const b = d10BaseVerts[f[1]];
      const d = d10BaseVerts[f[3]];
      const ab = new THREE.Vector3().subVectors(b, a);
      const ad = new THREE.Vector3().subVectors(d, a);
      return new THREE.Vector3().crossVectors(ab, ad).normalize();
    });

    const phi = (1 + Math.sqrt(5)) / 2;
    const invPhi = 1 / phi;
    const d12Scale = 1.3 / Math.sqrt(3);
    const d12BaseVerts = [
      new THREE.Vector3(d12Scale, d12Scale, d12Scale),
      new THREE.Vector3(d12Scale, d12Scale, -d12Scale),
      new THREE.Vector3(d12Scale, -d12Scale, d12Scale),
      new THREE.Vector3(d12Scale, -d12Scale, -d12Scale),
      new THREE.Vector3(-d12Scale, d12Scale, d12Scale),
      new THREE.Vector3(-d12Scale, d12Scale, -d12Scale),
      new THREE.Vector3(-d12Scale, -d12Scale, d12Scale),
      new THREE.Vector3(-d12Scale, -d12Scale, -d12Scale),
      new THREE.Vector3(0, d12Scale * invPhi, d12Scale * phi),
      new THREE.Vector3(0, d12Scale * invPhi, -d12Scale * phi),
      new THREE.Vector3(0, -d12Scale * invPhi, d12Scale * phi),
      new THREE.Vector3(0, -d12Scale * invPhi, -d12Scale * phi),
      new THREE.Vector3(d12Scale * invPhi, d12Scale * phi, 0),
      new THREE.Vector3(d12Scale * invPhi, -d12Scale * phi, 0),
      new THREE.Vector3(-d12Scale * invPhi, d12Scale * phi, 0),
      new THREE.Vector3(-d12Scale * invPhi, -d12Scale * phi, 0),
      new THREE.Vector3(d12Scale * phi, 0, d12Scale * invPhi),
      new THREE.Vector3(d12Scale * phi, 0, -d12Scale * invPhi),
      new THREE.Vector3(-d12Scale * phi, 0, d12Scale * invPhi),
      new THREE.Vector3(-d12Scale * phi, 0, -d12Scale * invPhi),
    ];
    const d12Faces = ensureOutwardWinding(d12BaseVerts, [
      [8, 10, 2, 16, 0],
      [8, 0, 12, 14, 4],
      [8, 4, 18, 6, 10],
      [9, 11, 7, 19, 5],
      [9, 5, 14, 12, 1],
      [9, 1, 17, 3, 11],
      [16, 2, 13, 3, 17],
      [16, 17, 1, 12, 0],
      [18, 4, 14, 5, 19],
      [18, 19, 7, 15, 6],
      [10, 6, 15, 13, 2],
      [11, 3, 13, 15, 7],
    ]);
    const d12Values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const d12Normals = d12Faces.map((f) => {
      const a = d12BaseVerts[f[0]];
      const b = d12BaseVerts[f[1]];
      const c = d12BaseVerts[f[2]];
      return new THREE.Vector3()
        .crossVectors(new THREE.Vector3().subVectors(b, a), new THREE.Vector3().subVectors(c, b))
        .normalize();
    });

    const d20Scale = 1.35 / Math.sqrt(1 + phi * phi);
    const d20BaseVerts = [
      new THREE.Vector3(0, d20Scale, phi * d20Scale),
      new THREE.Vector3(0, -d20Scale, phi * d20Scale),
      new THREE.Vector3(0, d20Scale, -phi * d20Scale),
      new THREE.Vector3(0, -d20Scale, -phi * d20Scale),
      new THREE.Vector3(d20Scale, phi * d20Scale, 0),
      new THREE.Vector3(-d20Scale, phi * d20Scale, 0),
      new THREE.Vector3(d20Scale, -phi * d20Scale, 0),
      new THREE.Vector3(-d20Scale, -phi * d20Scale, 0),
      new THREE.Vector3(phi * d20Scale, 0, d20Scale),
      new THREE.Vector3(-phi * d20Scale, 0, d20Scale),
      new THREE.Vector3(phi * d20Scale, 0, -d20Scale),
      new THREE.Vector3(-phi * d20Scale, 0, -d20Scale),
    ];
    const d20Faces = ensureOutwardWinding(d20BaseVerts, [
      [0, 1, 8],
      [0, 1, 9],
      [0, 4, 5],
      [0, 4, 8],
      [0, 5, 9],
      [1, 6, 7],
      [1, 6, 8],
      [1, 7, 9],
      [2, 3, 10],
      [2, 3, 11],
      [2, 4, 5],
      [2, 4, 10],
      [2, 5, 11],
      [3, 6, 7],
      [3, 6, 10],
      [3, 7, 11],
      [4, 8, 10],
      [5, 9, 11],
      [6, 8, 10],
      [7, 9, 11],
    ]);
    const d20Values = Array.from({ length: 20 }, (_, i) => i + 1);
    const d20Normals = d20Faces.map((f) => {
      const a = d20BaseVerts[f[0]];
      const b = d20BaseVerts[f[1]];
      const c = d20BaseVerts[f[2]];
      return new THREE.Vector3()
        .crossVectors(new THREE.Vector3().subVectors(b, a), new THREE.Vector3().subVectors(c, b))
        .normalize();
    });

    function createTriangularGeometry(verts: THREE.Vector3[], faces: number[][]): THREE.BufferGeometry {
      const geom = new THREE.BufferGeometry();
      const pos: number[] = [];
      const uvs: number[] = [];
      faces.forEach((f, idx) => {
        const a = verts[f[0]];
        const b = verts[f[1]];
        const c = verts[f[2]];
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        uvs.push(0.5, 0.92, 0.08, 0.16, 0.92, 0.16);
        geom.addGroup(idx * 3, 3, idx);
      });
      geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geom.computeVertexNormals();
      return geom;
    }

    function createKiteGeometry(verts: THREE.Vector3[], faces: number[][]): THREE.BufferGeometry {
      const geom = new THREE.BufferGeometry();
      const pos: number[] = [];
      const uvs: number[] = [];
      const norms: number[] = [];
      faces.forEach((f, idx) => {
        const a = verts[f[0]];
        const b = verts[f[1]];
        const c = verts[f[2]];
        const d = verts[f[3]];
        const ab = new THREE.Vector3().subVectors(b, a);
        const ad = new THREE.Vector3().subVectors(d, a);
        const n = new THREE.Vector3().crossVectors(ab, ad).normalize();

        pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        norms.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z);
        uvs.push(0.5, 0.98, 0.86, 0.2, 0.5, 0.02);

        pos.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
        norms.push(n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z);
        uvs.push(0.5, 0.98, 0.5, 0.02, 0.14, 0.2);

        geom.addGroup(idx * 6, 6, idx);
      });
      geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geom.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
      geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      return geom;
    }

    function createPentagonalGeometry(verts: THREE.Vector3[], faces: number[][]): THREE.BufferGeometry {
      const geom = new THREE.BufferGeometry();
      const pos: number[] = [];
      const uvs: number[] = [];
      faces.forEach((f, idx) => {
        const a = verts[f[0]];
        const b = verts[f[1]];
        const c = verts[f[2]];
        const d = verts[f[3]];
        const e = verts[f[4]];
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        uvs.push(0.5, 0.9, 0.1, 0.6, 0.25, 0.15);
        pos.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
        uvs.push(0.5, 0.9, 0.25, 0.15, 0.75, 0.15);
        pos.push(a.x, a.y, a.z, d.x, d.y, d.z, e.x, e.y, e.z);
        uvs.push(0.5, 0.9, 0.75, 0.15, 0.9, 0.6);
        geom.addGroup(idx * 9, 9, idx);
      });
      geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geom.computeVertexNormals();
      return geom;
    }

    function createConvexShape(verts: THREE.Vector3[], faces: number[][], scale = 1): CANNON.ConvexPolyhedron {
      const cannonVerts = verts.map((v) => new CANNON.Vec3(v.x * scale, v.y * scale, v.z * scale));
      const shape = new CANNON.ConvexPolyhedron({ vertices: cannonVerts, faces });
      try {
        shape.computeNormals();
        shape.computeEdges();
        shape.updateBoundingSphereRadius();
      } catch (err) {
        console.warn('Convex compute error', err);
      }
      return shape;
    }

    function rebuildDiceAssets(config?: DiceConfig) {
      const activeConfig = config || diceConfigRef.current || DEFAULT_DICE_CONFIG;
      const scale = Math.max(0.4, Math.min(2.5, activeConfig.scale || 1));

      const disposeMats = (mats?: THREE.MeshStandardMaterial[]) => {
        if (!mats) return;
        mats.forEach((m) => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      };

      disposeMats(state.d4Mats);
      disposeMats(state.d6Mats);
      disposeMats(state.d8Mats);
      disposeMats(state.d10Mats);
      disposeMats(state.d100TensMats);
      disposeMats(state.d12Mats);
      disposeMats(state.d20Mats);

      state.d4Geom?.dispose();
      state.d6Geom?.dispose();
      state.d8Geom?.dispose();
      state.d10Geom?.dispose();
      state.d12Geom?.dispose();
      state.d20Geom?.dispose();

      state.d6Mats = buildD6Materials(activeConfig);
      state.d4Mats = buildD4Materials(d4FaceNumbers, activeConfig);
      state.d8Mats = buildStandardPolyMaterials(8, d8Values, activeConfig);
      state.d10Mats = buildD10Materials(d10Values, false, activeConfig);
      state.d100TensMats = buildD10Materials(d10Values, true, activeConfig);
      state.d12Mats = buildStandardPolyMaterials(12, d12Values, activeConfig);
      state.d20Mats = buildStandardPolyMaterials(20, d20Values, activeConfig);

      const d6Size = 1.35 * scale;
      state.d6Geom = new THREE.BoxGeometry(d6Size, d6Size, d6Size);
      state.d6Shape = new CANNON.Box(new CANNON.Vec3(d6Size / 2, d6Size / 2, d6Size / 2));

      const d4Scale = (1.35 / Math.sqrt(3)) * scale;
      const d4Verts = [
        new THREE.Vector3(d4Scale, d4Scale, d4Scale),
        new THREE.Vector3(d4Scale, -d4Scale, -d4Scale),
        new THREE.Vector3(-d4Scale, d4Scale, -d4Scale),
        new THREE.Vector3(-d4Scale, -d4Scale, d4Scale),
      ];
      state.d4Geom = createTriangularGeometry(d4Verts, d4Faces);
      state.d4Shape = createConvexShape(d4Verts, d4Faces, 1);

      const d8Verts = d8BaseVerts.map((v) => v.clone().multiplyScalar(scale));
      state.d8Geom = createTriangularGeometry(d8Verts, d8Faces);
      state.d8Shape = createConvexShape(d8Verts, d8Faces, 1);

      const d10Verts = d10BaseVerts.map((v) => v.clone().multiplyScalar(scale));
      state.d10Geom = createKiteGeometry(d10Verts, d10Faces);
      state.d10Shape = createConvexShape(d10Verts, d10Faces, 1);

      const d12Verts = d12BaseVerts.map((v) => v.clone().multiplyScalar(scale));
      state.d12Geom = createPentagonalGeometry(d12Verts, d12Faces);
      state.d12Shape = createConvexShape(d12Verts, d12Faces, 1);

      const d20Verts = d20BaseVerts.map((v) => v.clone().multiplyScalar(scale));
      state.d20Geom = createTriangularGeometry(d20Verts, d20Faces);
      state.d20Shape = createConvexShape(d20Verts, d20Faces, 1);

      if (state.diceList.length > 0 && !state.isRolling) {
        spawnDice(state.currentDiceType, state.currentDiceCount);
      }
    }

    rebuildDiceAssets(diceConfigRef.current);

    function playCollisionSound(impactVelocity: number) {
      if (!soundEnabledRef.current) return;
      if (!state.audioCtx) {
        try {
          const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          state.audioCtx = new AudioCtx();
        } catch {
          return;
        }
      }
      if (state.audioCtx.state === 'suspended') {
        state.audioCtx.resume().catch(() => {});
      }
      try {
        const osc = state.audioCtx.createOscillator();
        const gain = state.audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(160 + Math.random() * 60, state.audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(32, state.audioCtx.currentTime + 0.08);
        gain.gain.setValueAtTime(Math.min(Math.max(impactVelocity / 24, 0.04), 0.45), state.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, state.audioCtx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(state.audioCtx.destination);
        osc.start();
        osc.stop(state.audioCtx.currentTime + 0.08);
      } catch {
        // Ignore audio errors
      }
    }

    function updateCameraPosition() {
      if (!state.camera) return;
      state.camera.position.x =
        state.lookAtTarget.x + state.cameraRadius * Math.sin(state.cameraPhi) * Math.sin(state.cameraTheta);
      state.camera.position.y = state.lookAtTarget.y + state.cameraRadius * Math.cos(state.cameraPhi);
      state.camera.position.z =
        state.lookAtTarget.z + state.cameraRadius * Math.sin(state.cameraPhi) * Math.cos(state.cameraTheta);
      state.camera.lookAt(state.lookAtTarget);
    }
    updateCameraPosition();

    let isDragging = false;
    let isPanning = false;
    let downX = 0;
    let downY = 0;
    let lastX = 0;
    let lastY = 0;
    let shiftPressed = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        shiftPressed = true;
      }
      const target = e.target as HTMLElement | null;
      if (
        e.code === 'Space' &&
        target &&
        !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)
      ) {
        e.preventDefault();
        throwDice();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        shiftPressed = false;
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('.hud-panel, button, input, select')) return;
      isDragging = true;
      downX = e.clientX;
      downY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
      isPanning = e.shiftKey || shiftPressed || e.button === 1 || e.button === 2;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Ignore capture errors
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (isPanning || e.shiftKey || shiftPressed) {
        const panSpeed = state.cameraRadius * 0.0018;
        const cosT = Math.cos(state.cameraTheta);
        const sinT = Math.sin(state.cameraTheta);
        const cosP = Math.cos(state.cameraPhi);
        const rx = cosT;
        const rz = -sinT;
        const fx = -sinT;
        const fz = -cosT;
        state.lookAtTarget.x -= (rx * dx - fx * dy * cosP) * panSpeed;
        state.lookAtTarget.z -= (rz * dx - fz * dy * cosP) * panSpeed;
      } else {
        state.targetTheta -= dx * 0.0058;
        state.targetPhi = Math.max(0.18, Math.min(1.42, state.targetPhi - dy * 0.0058));
      }
      lastX = e.clientX;
      lastY = e.clientY;
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!isDragging) return;
      isDragging = false;
      isPanning = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore release errors
      }
      if (Math.hypot(e.clientX - downX, e.clientY - downY) < 5 && e.button === 0 && !e.shiftKey && !shiftPressed) {
        throwDice();
      }
    };

    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target !== canvas || target.closest('.hud-panel, textarea, input, select'))) return;
      e.preventDefault();
      state.targetRadius = Math.max(7, Math.min(38, state.targetRadius + e.deltaY * 0.016));
    };

    const handleResize = () => {
      if (!state.camera || !state.renderer) return;
      const { width, height } = getViewportSize();
      const aspect = width / height;
      const baseHalfRad = THREE.MathUtils.degToRad(42 / 2);
      const adaptedFov =
        aspect < 1.35
          ? Math.min(68, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(baseHalfRad) * (1.35 / Math.max(0.45, aspect)))))
          : 42;
      state.camera.fov = adaptedFov;
      state.camera.aspect = aspect;
      state.camera.updateProjectionMatrix();
      state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      state.renderer.setSize(width, height);
    };

    handleResize();

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(canvas.parentElement || canvas);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('resize', handleResize);

    function spawnDice(type: DiceType, count: number) {
      if (!state.scene || !state.world) return;
      state.currentDiceType = type;
      state.currentDiceCount = count;

      state.diceList.forEach((item) => {
        state.scene?.remove(item.mesh);
        state.world?.removeBody(item.body);
      });
      state.diceList = [];

      let geom = state.d6Geom;
      let mats = state.d6Mats;
      let shape: CANNON.Shape | undefined = state.d6Shape;

      if (type === 'd4') {
        geom = state.d4Geom;
        mats = state.d4Mats;
        shape = state.d4Shape;
      } else if (type === 'd8') {
        geom = state.d8Geom;
        mats = state.d8Mats;
        shape = state.d8Shape;
      } else if (type === 'd10' || type === 'd100') {
        geom = state.d10Geom;
        mats = state.d10Mats;
        shape = state.d10Shape;
      } else if (type === 'd12') {
        geom = state.d12Geom;
        mats = state.d12Mats;
        shape = state.d12Shape;
      } else if (type === 'd20') {
        geom = state.d20Geom;
        mats = state.d20Mats;
        shape = state.d20Shape;
      }

      const scale = diceConfigRef.current?.scale || 1;
      const totalDice = type === 'd100' ? 2 : count;

      for (let i = 0; i < totalDice; i++) {
        const activeMats = type === 'd100' && i === 0 ? state.d100TensMats : mats;
        if (!geom || !activeMats || !shape) continue;

        const mesh = new THREE.Mesh(geom, activeMats);
        mesh.castShadow = true;
        state.scene.add(mesh);

        const body = new CANNON.Body({
          mass: 2 * Math.pow(scale, 2),
          shape,
          material: diceMat,
          linearDamping: 0.35,
          angularDamping: 0.42,
        });

        body.addEventListener('collide', (event: { contact: CANNON.ContactEquation }) => {
          const v = event.contact.getImpactVelocityAlongNormal();
          if (v > 1.2) playCollisionSound(v);
        });

        const cols = totalDice <= 5 ? totalDice : Math.ceil(totalDice / 2);
        const row = Math.floor(i / cols);
        const col = i % cols;
        const rowLen = row === 0 ? Math.min(totalDice, cols) : totalDice - cols;
        const x = (col - (rowLen - 1) / 2) * (2.2 * Math.max(0.75, scale));
        const z = (row - 0.5) * (2.4 * Math.max(0.75, scale));

        body.position.set(x, 1.4 * scale, z);
        state.world.addBody(body);
        state.diceList.push({ mesh, body, index: i, diceType: type });
      }
    }

    function throwDice() {
      if (state.isRolling) return;
      if (state.checkInterval) clearInterval(state.checkInterval);
      state.isRolling = true;
      onRollStartRef.current();

      const scale = diceConfigRef.current?.scale || 1;
      state.diceList.forEach((item, idx) => {
        item.body.position.set(
          (Math.random() - 0.5) * 2.8 * scale,
          5 * scale + idx * 0.28,
          (Math.random() - 0.5) * 2.8 * scale
        );
        item.body.velocity.set(
          (Math.random() - 0.5) * 16 * Math.sqrt(scale),
          3.5 * scale,
          (Math.random() - 0.5) * 16 * Math.sqrt(scale)
        );
        item.body.angularVelocity.set(
          (Math.random() - 0.5) * 44,
          (Math.random() - 0.5) * 44,
          (Math.random() - 0.5) * 44
        );
      });

      let settledChecks = 0;
      let elapsedMs = 0;
      state.checkInterval = setInterval(() => {
        elapsedMs += 100;
        let allSettled = true;
        state.diceList.forEach((item) => {
          const lin = item.body.velocity.length();
          const ang = item.body.angularVelocity.length();
          if (lin < 0.6 && ang < 2.5) {
            item.body.velocity.x *= 0.92;
            item.body.velocity.y *= 0.92;
            item.body.velocity.z *= 0.92;
            item.body.angularVelocity.x *= 0.88;
            item.body.angularVelocity.y *= 0.88;
            item.body.angularVelocity.z *= 0.88;
          }
          if (lin > 0.12 || ang > 0.18) {
            allSettled = false;
          }
        });

        if (allSettled || elapsedMs >= 3500) {
          settledChecks++;
          if (settledChecks >= 3 || elapsedMs >= 3500) {
            if (state.checkInterval) clearInterval(state.checkInterval);
            state.diceList.forEach((item) => {
              item.body.velocity.set(0, 0, 0);
              item.body.angularVelocity.set(0, 0, 0);
            });
            state.isRolling = false;
            evaluateResults();
          }
        } else {
          settledChecks = 0;
        }
      }, 100);
    }

    function evaluateResults() {
      const up = new THREE.Vector3(0, 1, 0);
      let totalValue = 0;
      const individualValues: number[] = [];
      const activeType = state.currentDiceType || diceTypeRef.current;

      state.diceList.forEach((item) => {
        let val = 0;
        const q = new THREE.Quaternion(
          item.body.quaternion.x,
          item.body.quaternion.y,
          item.body.quaternion.z,
          item.body.quaternion.w
        );
        item.mesh.position.set(item.body.position.x, item.body.position.y, item.body.position.z);
        item.mesh.quaternion.copy(q);

        const type = item.diceType || activeType;
        if (type === 'd4') {
          let maxY = -Infinity;
          let bestIdx = 0;
          d4PeakDirs.forEach((dir, idx) => {
            const transformed = dir.clone().applyQuaternion(q);
            if (transformed.y > maxY) {
              maxY = transformed.y;
              bestIdx = idx;
            }
          });
          val = bestIdx + 1;
        } else if (type === 'd6') {
          const d6Faces = [
            { v: 1, n: new THREE.Vector3(1, 0, 0) },
            { v: 6, n: new THREE.Vector3(-1, 0, 0) },
            { v: 2, n: new THREE.Vector3(0, 1, 0) },
            { v: 5, n: new THREE.Vector3(0, -1, 0) },
            { v: 3, n: new THREE.Vector3(0, 0, 1) },
            { v: 4, n: new THREE.Vector3(0, 0, -1) },
          ];
          let bestDot = -Infinity;
          d6Faces.forEach((face) => {
            const dot = face.n.clone().applyQuaternion(q).dot(up);
            if (dot > bestDot) {
              bestDot = dot;
              val = face.v;
            }
          });
        } else if (type === 'd8') {
          let bestDot = -Infinity;
          d8Normals.forEach((n, idx) => {
            const dot = n.clone().applyQuaternion(q).dot(up);
            if (dot > bestDot) {
              bestDot = dot;
              val = d8Values[idx];
            }
          });
        } else if (type === 'd10') {
          let bestDot = -Infinity;
          d10Normals.forEach((n, idx) => {
            const dot = n.clone().applyQuaternion(q).dot(up);
            if (dot > bestDot) {
              bestDot = dot;
              val = d10Values[idx];
            }
          });
        } else if (type === 'd12') {
          let bestDot = -Infinity;
          d12Normals.forEach((n, idx) => {
            const dot = n.clone().applyQuaternion(q).dot(up);
            if (dot > bestDot) {
              bestDot = dot;
              val = d12Values[idx];
            }
          });
        } else if (type === 'd20') {
          let bestDot = -Infinity;
          d20Normals.forEach((n, idx) => {
            const dot = n.clone().applyQuaternion(q).dot(up);
            if (dot > bestDot) {
              bestDot = dot;
              val = d20Values[idx];
            }
          });
        } else if (type === 'd100') {
          let bestDot = -Infinity;
          d10Normals.forEach((n, idx) => {
            const dot = n.clone().applyQuaternion(q).dot(up);
            if (dot > bestDot) {
              bestDot = dot;
              val = d10Values[idx];
            }
          });
          if (item.index === 0) {
            val = val === 0 ? 0 : val * 10;
          }
        }

        individualValues.push(val);
        totalValue += val === 0 && type === 'd10' ? 10 : val;
      });

      let resultText = '';
      if (activeType === 'd100' && individualValues.length === 2) {
        const tens = individualValues[0];
        const units = individualValues[1];
        let combined = tens + units;
        if (combined === 0) combined = 100;
        resultText = combined.toString();
        totalValue = combined;
      } else if (individualValues.length === 1) {
        const single = individualValues[0];
        resultText = single === 0 && activeType === 'd10' ? '10' : single.toString();
      } else {
        resultText = totalValue.toString();
      }

      onRollCompleteRef.current(resultText, totalValue, individualValues);
    }

    spawnDice(diceTypeRef.current, diceCountRef.current);

    canvas.__throwDice = throwDice;
    canvas.__spawnDice = spawnDice;
    canvas.__updateSurface = (surface: TableSurface) => {
      tableEnv.updateSurface(surface);
    };
    canvas.__rebuildDiceAssets = (config?: DiceConfig) => {
      if (config) diceConfigRef.current = config;
      rebuildDiceAssets(diceConfigRef.current);
    };
    canvas.__resetCamera = () => {
      state.targetRadius = 18.5;
      state.targetTheta = 0;
      state.targetPhi = 0.95;
      state.lookAtTarget.set(0, 0.2, 0);
    };

    const clock = new THREE.Clock();
    let animFrameId = 0;
    function animate() {
      animFrameId = requestAnimationFrame(animate);
      state.cameraRadius += (state.targetRadius - state.cameraRadius) * 0.12;
      state.cameraTheta += (state.targetTheta - state.cameraTheta) * 0.12;
      state.cameraPhi += (state.targetPhi - state.cameraPhi) * 0.12;
      updateCameraPosition();

      tableEnv.updateAnimation(clock.getElapsedTime(), state.camera ?? undefined);
      state.world?.step(1 / 60);

      const maxDist = arenaRadius * 0.95;
      state.diceList.forEach((item) => {
        const dist = Math.hypot(item.body.position.x, item.body.position.z);
        if (dist > maxDist) {
          const factor = (maxDist * 0.88) / dist;
          item.body.position.x *= factor;
          item.body.position.z *= factor;
          item.body.velocity.x *= -0.35;
          item.body.velocity.z *= -0.35;
        }
        if (item.body.position.y < -1.5) {
          item.body.position.set(0, 1.2, 0);
          item.body.velocity.set(0, 0, 0);
          item.body.angularVelocity.set(0, 0, 0);
        }
        item.mesh.position.set(item.body.position.x, item.body.position.y, item.body.position.z);
        item.mesh.quaternion.set(
          item.body.quaternion.x,
          item.body.quaternion.y,
          item.body.quaternion.z,
          item.body.quaternion.w
        );
      });

      if (state.renderer && state.scene && state.camera) {
        state.renderer.render(state.scene, state.camera);
      }
    }

    animate();

    return () => {
      cancelAnimationFrame(animFrameId);
      if (state.checkInterval) clearInterval(state.checkInterval);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      tableEnv.dispose();
      envTexture.dispose();
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.__spawnDice?.(currentDiceType, currentDiceCount);
  }, [currentDiceType, currentDiceCount]);

  useEffect(() => {
    if (rollTrigger === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.__throwDice?.();
  }, [rollTrigger]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.__updateSurface?.(tableSurface || 'dark_wood');
  }, [tableSurface]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.__rebuildDiceAssets?.(diceConfig);
  }, [
    diceConfig?.scale,
    diceConfig?.primaryColor,
    diceConfig?.secondaryColor,
    diceConfig?.numeralColor,
    diceConfig?.metalness,
    diceConfig?.roughness,
    diceConfig?.themeId,
  ]);

  return (
    <canvas
      id="webgl-canvas"
      ref={canvasRef}
      className="absolute inset-0 w-full h-full block z-0 select-none cursor-grab active:cursor-grabbing"
    />
  );
};
