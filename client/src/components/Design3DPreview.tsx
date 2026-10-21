// 3D wrap preview for the Design Studio — renders the customer's flat
// design wrapped around a parametric 3D model of cylindrical drinkware
// (mugs, tumblers, stemless wine, water bottles). Preview only: the flat
// artwork remains the production file; this just shows how it sits on
// the curved product. three.js loads on demand the first time the
// preview opens, so the studio bundle doesn't grow for everyone else.

import { useEffect, useRef, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';

export type WrapShapeKind = 'mug' | 'tumbler' | 'lowball' | 'wine' | 'bottle';

export interface WrapShape {
  kind: WrapShapeKind;
  /** Human label for the modal subtitle. */
  label: string;
}

// Which products can be wrapped. Drinkware-shaped names only — apparel,
// flat goods, and anything with a non-cylindrical body stay on the flat
// preview. "bottle opener" must NOT match the bottle shape.
export function wrapShapeFor(name: string, category?: string | null): WrapShape | null {
  const n = ` ${name.toLowerCase()} `;
  const cat = (category ?? '').toLowerCase();
  // Apparel categories never wrap even if the name says "bottle green".
  if (/t-shirt|hoodie|sweatshirt|apparel|outerwear|polos|fleece/.test(cat)) return null;
  if (/opener|keychain|ornament|coaster|plaque|frame|board/.test(n)) return null;
  // Suffix match on purpose: catalog names compound ("LazerMug").
  if (/mug\b|stein\b/.test(n)) return { kind: 'mug', label: 'Ceramic mug' };
  if (/stemless|wine tumbler/.test(n)) return { kind: 'wine', label: 'Stemless wine tumbler' };
  if (/water bottle|\bbottle\b/.test(n)) return { kind: 'bottle', label: 'Water bottle' };
  if (/tumbler|lowball|\bpint\b|polar camel/.test(n)) {
    const oz = parseFloat(/([\d.]+)\s*oz/.exec(n)?.[1] ?? '20');
    return oz <= 12
      ? { kind: 'lowball', label: `${oz} oz. tumbler` }
      : { kind: 'tumbler', label: `${oz} oz. tumbler` };
  }
  return null;
}

// Tight-crop a transparent-background canvas to its visible pixels.
// Same approach as the studio's save-to-library crop.
export function tightCrop(cv: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = cv.getContext('2d');
  if (!ctx) return cv;
  let img: ImageData;
  try { img = ctx.getImageData(0, 0, cv.width, cv.height); } catch { return cv; }
  const { data, width: W, height: H } = img;
  let minX = W, minY = H, maxX = -1, maxY = -1;
  const stride = 8;
  for (let y = 0; y < H; y += stride) {
    const rowOff = y * W * 4;
    for (let x = 0; x < W; x += stride) {
      if (data[rowOff + x * 4 + 3]! > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return cv;
  const pad = stride + 4;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(W - 1, maxX + pad); maxY = Math.min(H - 1, maxY + pad);
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext('2d')!.drawImage(cv, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

// Catalog two-tone names ("White/Green Sublimatable Ceramic Mug",
// "Black/White Color Changing…") name the body and accent colors
// outright — far more reliable than sampling a mostly-white photo.
const NAMED_COLORS: Record<string, string> = {
  white: '#f4f3f0', black: '#1d1d1f', green: '#1d7a43', blue: '#1e4f9c',
  red: '#c0272d', navy: '#20304f', gold: '#c9a227', silver: '#c6c8ca',
  orange: '#e8762c', purple: '#5b3b8c', pink: '#e394b8', maroon: '#6d2230',
  gray: '#8a8d8f', grey: '#8a8d8f', yellow: '#e8c842', teal: '#1d7a82',
};

function namedTwoTone(name: string): { body: string; accent: string } | null {
  const m = /([a-z]+)\s*\/\s*([a-z]+)/i.exec(name);
  if (!m) return null;
  const body = NAMED_COLORS[m[1]!.toLowerCase()];
  const accent = NAMED_COLORS[m[2]!.toLowerCase()];
  return body && accent ? { body, accent } : null;
}

// Average the center region of the product photo to tint the 3D body so
// a blue mug previews blue. Needs CORS-readable images (our catalog CDNs
// allow it); falls back to off-white when unreadable.
async function sampleBodyColor(imageUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const cv = document.createElement('canvas');
        cv.width = 24; cv.height = 24;
        const ctx = cv.getContext('2d')!;
        ctx.drawImage(img, 0, 0, 24, 24);
        const { data } = ctx.getImageData(6, 6, 12, 12);
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3]! < 200) continue; // skip transparent
          const max = Math.max(data[i]!, data[i + 1]!, data[i + 2]!);
          if (max > 248) continue; // skip white backdrop pixels
          r += data[i]!; g += data[i + 1]!; b += data[i + 2]!; n += 1;
        }
        if (n < 8) { resolve(null); return; }
        const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, '0');
        resolve(`#${hex(r)}${hex(g)}${hex(b)}`);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

// Body dimensions in millimetres. The decorated body is an open-ended
// cylinder wall — CylinderGeometry's linear UVs keep the wrap exact
// (LatheGeometry maps V by point index, which smears art toward the
// bottom disc). Rims, lids, caps, and handles are separate untextured
// meshes.
const PROFILES: Record<WrapShapeKind, {
  rBottom: number; rTop: number; wall: number;
  /** [vFrom, vTo] fraction of the wall height the art may cover. */
  printBand: [number, number];
  metal: boolean; handle?: boolean; lid?: boolean; openTop?: boolean; shoulder?: boolean;
}> = {
  mug: { rBottom: 40, rTop: 41, wall: 96, printBand: [0.12, 0.92], metal: false, handle: true, openTop: true },
  tumbler: { rBottom: 35, rTop: 43.5, wall: 172, printBand: [0.12, 0.84], metal: true, lid: true },
  lowball: { rBottom: 35, rTop: 41, wall: 95, printBand: [0.14, 0.82], metal: true, lid: true },
  wine: { rBottom: 32, rTop: 41, wall: 95, printBand: [0.14, 0.82], metal: true, lid: true },
  bottle: { rBottom: 35, rTop: 35, wall: 140, printBand: [0.1, 0.9], metal: true, shoulder: true },
};

interface Props {
  open: boolean;
  onClose: () => void;
  shape: WrapShape;
  /** Tight-cropped transparent PNG of the flat design (data URL), or null when the canvas is empty. */
  designPng: string | null;
  productName: string;
  /** Known body color hex (from the picked product color) — wins over photo sampling. */
  colorHex?: string | null;
  /** Product photo to sample a body tint from when no color is known. */
  imageUrl?: string | null;
}

export default function Design3DPreview({
  open, onClose, shape, designPng, productName, colorHex, imageUrl,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const resetRef = useRef<() => void>(() => {});
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!open) return undefined;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    let disposed = false;
    let cleanup: (() => void) | null = null;
    setStatus('loading');

    (async () => {
      try {
        const [THREE, { OrbitControls }, { RoomEnvironment }] = await Promise.all([
          import('three'),
          import('three/examples/jsm/controls/OrbitControls.js'),
          import('three/examples/jsm/environments/RoomEnvironment.js'),
        ]);
        const twoTone = namedTwoTone(productName);
        const bodyHex = twoTone?.body
          || colorHex
          || (imageUrl ? await sampleBodyColor(imageUrl) : null)
          || '#f1efea';
        // Accent drives the mug handle / rim / interior ("White/Green"
        // mugs have a green handle and inside). Single-color products
        // keep the body color throughout.
        const accentHex = twoTone?.accent || bodyHex;
        const designImg = designPng
          ? await new Promise<HTMLImageElement | null>((resolve) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = () => resolve(null);
            im.src = designPng;
          })
          : null;
        const mount = mountRef.current;
        if (disposed || !mount) return;

        const spec = PROFILES[shape.kind];
        const height = spec.wall + (spec.shoulder ? 50 : spec.lid ? 12 : 0);
        const maxR = Math.max(spec.rBottom, spec.rTop);

        // ── Texture: body color + the flat design pasted on the front
        // sector, aspect preserved. u wraps the circumference.
        const texW = 2048;
        const circumference = 2 * Math.PI * ((spec.rBottom + spec.rTop) / 2);
        const texH = Math.round(texW * (spec.wall / circumference));
        const tex = document.createElement('canvas');
        tex.width = texW; tex.height = texH;
        const tctx = tex.getContext('2d')!;
        tctx.fillStyle = bodyHex;
        tctx.fillRect(0, 0, texW, texH);
        if (designImg) {
          const [vFrom, vTo] = spec.printBand;
          const bandH = (vTo - vFrom) * texH;
          const maxW = texW * 0.38; // design may cover ~135° of the wrap
          let w = maxW;
          let h = w * (designImg.height / designImg.width);
          if (h > bandH) { h = bandH; w = h * (designImg.width / designImg.height); }
          // Lathe seam (u=0) faces the camera after the initial rotation
          // below; center the art across it.
          tctx.drawImage(designImg, (texW - w) / 2, texH - vFrom * texH - (bandH + h) / 2, w, h);
        }
        const texture = new THREE.CanvasTexture(tex);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        texture.wrapS = THREE.RepeatWrapping;
        // Rotate the wrap so the design's center (u=0.5) faces the camera.
        texture.offset.x = 0.5;

        // ── Scene
        const scene = new THREE.Scene();
        const w = mount.clientWidth;
        const hpx = mount.clientHeight;
        const camera = new THREE.PerspectiveCamera(32, w / hpx, 1, 2000);
        camera.position.set(0, height * 0.72, height * 2.35);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(w, hpx);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        mount.appendChild(renderer.domElement);
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

        const group = new THREE.Group();
        scene.add(group);

        const trimMat = (hex: string | number, dark = false) => new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(hex).multiplyScalar(dark ? 0.55 : 1),
          metalness: spec.metal ? 0.45 : 0.02,
          roughness: spec.metal ? 0.4 : 0.32,
          clearcoat: spec.metal ? 0.25 : 0.55,
          clearcoatRoughness: 0.25,
        });
        // Decorated wall — open-ended so UVs stay linear in height.
        const material = trimMat(0xffffff);
        material.map = texture;
        const bodyMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(spec.rTop, spec.rBottom, spec.wall, 96, 1, true),
          material,
        );
        bodyMesh.position.y = spec.wall / 2;
        group.add(bodyMesh);

        // Bottom disc.
        const bottom = new THREE.Mesh(new THREE.CircleGeometry(spec.rBottom, 96), trimMat(bodyHex));
        bottom.rotation.x = -Math.PI / 2;
        bottom.position.y = 0.3;
        group.add(bottom);

        if (spec.openTop) {
          // Rolled rim + darker interior so the mug reads hollow.
          const rim = new THREE.Mesh(new THREE.TorusGeometry(spec.rTop - 1.6, 1.9, 20, 96), trimMat(accentHex));
          rim.rotation.x = Math.PI / 2;
          rim.position.y = spec.wall;
          group.add(rim);
          const inner = new THREE.Mesh(new THREE.CircleGeometry(spec.rTop - 2.4, 96), trimMat(accentHex, true));
          inner.rotation.x = -Math.PI / 2;
          inner.position.y = spec.wall - 5;
          group.add(inner);
        } else if (spec.shoulder) {
          // Bottle shoulder + cap (untextured lathe above the wall).
          const shoulderPts = [
            new THREE.Vector2(spec.rTop, 0), new THREE.Vector2(spec.rTop - 2, 12),
            new THREE.Vector2(20, 26), new THREE.Vector2(14, 32), new THREE.Vector2(14, 34),
          ];
          const shoulder = new THREE.Mesh(new THREE.LatheGeometry(shoulderPts, 96), trimMat(bodyHex));
          shoulder.position.y = spec.wall;
          group.add(shoulder);
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(15.5, 15.5, 18, 96), trimMat(0x222222));
          cap.position.y = spec.wall + 34 + 8;
          group.add(cap);
        } else if (spec.lid) {
          // Clear-style tumbler lid: slightly proud ring + low dome.
          const lid = new THREE.Mesh(new THREE.CylinderGeometry(spec.rTop + 2, spec.rTop + 2, 9, 96), trimMat(0x1f1f1f));
          lid.position.y = spec.wall + 4.5;
          group.add(lid);
          const dome = new THREE.Mesh(new THREE.CylinderGeometry(spec.rTop - 8, spec.rTop + 1, 5, 96), trimMat(0x1f1f1f));
          dome.position.y = spec.wall + 11.5;
          group.add(dome);
        }

        if (spec.handle) {
          // C-shaped handle 90° around from the artwork, like a classic
          // product shot. Torus stays in its native XY plane (vertical);
          // rotation.z turns the half-arc so it opens toward the wall,
          // with both ends landing on the wall surface.
          const handleGeo = new THREE.TorusGeometry(28, 7, 24, 48, Math.PI);
          const handle = new THREE.Mesh(handleGeo, trimMat(accentHex));
          handle.rotation.z = -Math.PI / 2;
          handle.position.set(maxR - 3, spec.wall * 0.52, 0);
          group.add(handle);
        }

        // Soft ground shadow — a radial-gradient disc, cheap and clean.
        const shadowCv = document.createElement('canvas');
        shadowCv.width = 256; shadowCv.height = 256;
        const sctx = shadowCv.getContext('2d')!;
        const grad = sctx.createRadialGradient(128, 128, 10, 128, 128, 120);
        grad.addColorStop(0, 'rgba(40,30,20,0.32)');
        grad.addColorStop(1, 'rgba(40,30,20,0)');
        sctx.fillStyle = grad;
        sctx.fillRect(0, 0, 256, 256);
        const shadowTex = new THREE.CanvasTexture(shadowCv);
        const shadow = new THREE.Mesh(
          new THREE.PlaneGeometry(maxR * 4.4, maxR * 4.4),
          new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.2;
        scene.add(shadow);

        group.position.y = 0;
        const key = new THREE.DirectionalLight(0xfff4e8, 1.1);
        key.position.set(120, 220, 160);
        scene.add(key);
        scene.add(new THREE.AmbientLight(0xffffff, 0.25));

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, height / 2, 0);
        controls.enablePan = false;
        controls.minDistance = height * 1.1;
        controls.maxDistance = height * 4;
        controls.maxPolarAngle = Math.PI * 0.62;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 2.2;
        // Pause the auto-spin once the customer grabs it.
        controls.addEventListener('start', () => { controls.autoRotate = false; });
        controls.update();
        resetRef.current = () => {
          camera.position.set(0, height * 0.72, height * 2.35);
          controls.target.set(0, height / 2, 0);
          controls.autoRotate = true;
          controls.update();
        };

        let raf = 0;
        const tick = () => {
          raf = requestAnimationFrame(tick);
          controls.update();
          renderer.render(scene, camera);
        };
        tick();

        const ro = new ResizeObserver(() => {
          const nw = mount.clientWidth; const nh = mount.clientHeight;
          if (!nw || !nh) return;
          camera.aspect = nw / nh;
          camera.updateProjectionMatrix();
          renderer.setSize(nw, nh);
        });
        ro.observe(mount);

        setStatus('ready');
        cleanup = () => {
          cancelAnimationFrame(raf);
          ro.disconnect();
          controls.dispose();
          pmrem.dispose();
          texture.dispose();
          shadowTex.dispose();
          scene.traverse((o) => {
            const mesh = o as { geometry?: { dispose?: () => void }; material?: { dispose?: () => void } };
            mesh.geometry?.dispose?.();
            mesh.material?.dispose?.();
          });
          renderer.dispose();
          renderer.domElement.remove();
        };
      } catch (err) {
        console.error('[Design3DPreview] failed to start', err);
        if (!disposed) setStatus('error');
      }
    })();

    return () => { disposed = true; cleanup?.(); };
  }, [open, shape.kind, designPng, colorHex, imageUrl]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={`3D preview of ${productName}`}>
      <button
        type="button"
        aria-label="Close 3D preview"
        onClick={onClose}
        tabIndex={-1}
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
      />
      <div className="absolute inset-x-0 bottom-0 top-auto sm:inset-0 sm:m-auto flex h-[82dvh] sm:h-[min(640px,88dvh)] w-full sm:w-[min(560px,92vw)] flex-col rounded-t-3xl sm:rounded-2xl bg-gradient-to-b from-white to-[#f4efe8] shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-4 sm:pt-5">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 truncate">3D preview</h2>
            <p className="text-xs text-gray-500 truncate">{productName}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => resetRef.current()}
              title="Reset view"
              aria-label="Reset view"
              className="grid h-10 w-10 place-items-center rounded-full text-gray-600 hover:bg-black/5"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close 3D preview"
              autoFocus
              className="grid h-10 w-10 place-items-center rounded-full text-gray-700 hover:bg-black/5"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div ref={mountRef} className="relative flex-1 min-h-0 touch-none">
          {status === 'loading' && (
            <div className="absolute inset-0 grid place-items-center text-sm text-gray-500">
              Spinning up the 3D view…
            </div>
          )}
          {status === 'error' && (
            <div className="absolute inset-0 grid place-items-center px-8 text-center text-sm text-gray-500">
              3D preview couldn’t start on this device. Your design is unaffected — it still prints exactly as shown on the flat canvas.
            </div>
          )}
        </div>
        <p className="px-5 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-2 text-center text-[11px] text-gray-400">
          Drag to spin · pinch or scroll to zoom · preview only, actual product may vary
        </p>
      </div>
    </div>
  );
}
