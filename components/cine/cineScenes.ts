// Canvas drawing routines for synthetic ultrasound cine-loops.
// Ported verbatim from the design prototype (cine-loop.jsx).
//
// i18n note: this module lives outside React (it's a pure canvas
// drawing routine, called from CineLoop's animation loop). The
// scenes that paint clinical labels via `ctx.fillText` (ECG strip,
// info card subtitle) accept a `labels` field on `DrawOpts` so the
// React caller can resolve dict keys via `useT()` and thread the
// translated strings in. Hardcoded Spanish strings are kept as
// fallbacks — for tests and any non-React consumer the visual
// stays unchanged.

type Ctx = CanvasRenderingContext2D;

/**
 * Optional translated labels for scenes that paint clinical text.
 * The shape mirrors the canvas-rendered strings inside `scEcg` and
 * `scInfo`; if omitted, the routines fall back to the Spanish-
 * baseline strings preserved at the callsite below.
 */
export interface SceneLabels {
  /** ECG strip caption — one of three based on `kind`. */
  ecg?: {
    stemi: string;
    afib: string;
    bav: string;
  };
  /** Info-card subtitle — one of three based on `kind`. */
  info?: {
    blue: string;
    rush: string;
    fast: string;
  };
}

interface DrawOpts {
  refreshSpeckle?: boolean;
  labels?: SceneLabels;
}

// Module-level switch consumed by speckle() on the current frame. Set by
// drawScene() at the top of each call. Scoped per-context via the
// speckleCache so multiple canvases don't trample each other.
let CURRENT_REFRESH = true;

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function clipFan(ctx: Ctx, W: number, H: number, type: "linear" | "curve" | "sector" = "sector") {
  ctx.save();
  ctx.beginPath();
  if (type === "linear") {
    const m = W * 0.05;
    ctx.moveTo(m, H * 0.05);
    ctx.lineTo(W - m, H * 0.05);
    ctx.lineTo(W - m * 0.5, H * 0.95);
    ctx.lineTo(m * 0.5, H * 0.95);
    ctx.closePath();
  } else if (type === "curve") {
    const cx = W / 2,
      top = H * 0.06;
    const angle = Math.PI / 3.2;
    const r1 = H * 0.18,
      r2 = H * 0.95;
    ctx.moveTo(cx + Math.sin(-angle) * r1, top + Math.cos(-angle) * r1);
    ctx.arc(cx, top, r1, -Math.PI / 2 - angle, -Math.PI / 2 + angle, false);
    ctx.lineTo(cx + Math.sin(angle) * r2, top + Math.cos(angle) * r2);
    ctx.arc(cx, top, r2, -Math.PI / 2 + angle, -Math.PI / 2 - angle, true);
    ctx.closePath();
  } else {
    const cx = W / 2,
      top = H * 0.04;
    const angle = Math.PI / 4;
    const r = H * 0.96;
    ctx.moveTo(cx, top);
    ctx.arc(cx, top, r, -Math.PI / 2 - angle, -Math.PI / 2 + angle, false);
    ctx.closePath();
  }
  ctx.clip();
}

// Cache the last speckled imagedata per canvas size so we can reuse it
// when the caller throttles speckle updates (every Nth frame). Without
// this the drawing would lose its grain entirely on skipped frames.
const speckleCache = new WeakMap<Ctx, { w: number; h: number; data: ImageData }>();

function speckle(ctx: Ctx, W: number, H: number, _t: number, density = 0.5, intensity = 0.6) {
  if (!CURRENT_REFRESH) {
    const cached = speckleCache.get(ctx);
    if (cached && cached.w === W && cached.h === H) {
      ctx.putImageData(cached.data, 0, 0);
      return;
    }
    // Fall through and compute on first frame even when refresh=false.
  }
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // Indices i..i+3 are guaranteed in-bounds by the loop guard
    // (i < d.length and i steps by 4); the `!` quiets
    // noUncheckedIndexedAccess on this hot path.
    if (d[i + 3]! === 0) continue;
    const r = Math.random();
    if (r < density) {
      const v = Math.pow(Math.random(), 2.2) * 255 * intensity;
      d[i] = d[i + 1] = d[i + 2] = clamp(d[i]! + v, 0, 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  speckleCache.set(ctx, { w: W, h: H, data: img });
}

function gradientDepth(ctx: Ctx, W: number, H: number) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(255,255,255,0.18)");
  g.addColorStop(0.5, "rgba(255,255,255,0.08)");
  g.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

export function drawChrome(ctx: Ctx, W: number, H: number, dpr: number, kind: string) {
  ctx.save();
  // top-left brand + mode
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.font = `bold ${10 * dpr}px ui-monospace, Menlo, monospace`;
  ctx.textBaseline = "top";
  ctx.fillText("POCUS", 8 * dpr, 8 * dpr);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = `${9 * dpr}px ui-monospace, Menlo, monospace`;
  ctx.fillText(kind.toUpperCase(), 8 * dpr, 22 * dpr);

  // top-right gain / freq pill
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = `${8.5 * dpr}px ui-monospace, Menlo, monospace`;
  const stamp = `G 60  D ${Math.round(H / dpr / 30)}`;
  const stampW = ctx.measureText(stamp).width;
  ctx.fillText(stamp, W - stampW - 8 * dpr, 8 * dpr);

  // depth scale on the right edge with major+minor ticks
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1 * dpr;
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = `${8.5 * dpr}px ui-monospace, Menlo, monospace`;
  for (let i = 0; i <= 12; i++) {
    const y = (H / 12) * i;
    const isMajor = i % 2 === 0;
    const tickLen = isMajor ? 10 * dpr : 5 * dpr;
    ctx.beginPath();
    ctx.moveTo(W - 4 * dpr, y);
    ctx.lineTo(W - 4 * dpr - tickLen, y);
    ctx.stroke();
    if (isMajor && i > 0 && i < 12) {
      ctx.fillText(`${i}`, W - 22 * dpr, y - 4 * dpr);
    }
  }

  // bottom-left timestamp tick
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillText("CINE-LOOP", 8 * dpr, H - 16 * dpr);
  ctx.restore();
}

export function drawScene(
  ctx: Ctx,
  W: number,
  H: number,
  t: number,
  kind: string,
  opts: DrawOpts = {},
) {
  CURRENT_REFRESH = opts.refreshSpeckle !== false;
  switch (kind) {
    case "blines":
      return scBlines(ctx, W, H, t);
    case "tamponade":
      return scTamponade(ctx, W, H, t);
    case "morrison":
      return scMorrison(ctx, W, H, t);
    case "seashore":
      return scSeashore(ctx, W, H, t);
    case "ijv":
      return scIJV(ctx, W, H, t);
    case "dvt":
      return scDVT(ctx, W, H, t);
    case "hydro":
      return scHydro(ctx, W, H, t);
    case "ob":
      return scOB(ctx, W, H, t);
    case "lvfunction":
      return scLV(ctx, W, H, t);
    case "aaa":
      return scAAA(ctx, W, H, t);
    case "consolidation":
      return scConsolidation(ctx, W, H, t);
    case "gallstone":
      return scGallstone(ctx, W, H, t);
    case "ecg-stemi":
    case "ecg-afib":
    case "ecg-block":
      return scECG(ctx, W, H, t, kind, opts.labels?.ecg);
    case "info-blue":
    case "info-rush":
    case "info-fast":
      return scInfo(ctx, W, H, t, kind, opts.labels?.info);
    default:
      return scBlines(ctx, W, H, t);
  }
}

function scBlines(ctx: Ctx, W: number, H: number, t: number) {
  clipFan(ctx, W, H, "linear");
  ctx.fillStyle = "#0d0d0d";
  ctx.fillRect(0, 0, W, H);
  const pleuraY = H * 0.25 + Math.sin(t * 2.2) * H * 0.005;
  const grad = ctx.createLinearGradient(0, pleuraY - 6, 0, pleuraY + 6);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.95)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, pleuraY - 6, W, 12);

  ctx.fillStyle = "rgba(180,180,180,0.25)";
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(0, H * 0.1 + i * 8, W, 1.5);
  }

  const lines = [
    { x: 0.18, w: 0.06, ph: 0 },
    { x: 0.32, w: 0.05, ph: 0.6 },
    { x: 0.48, w: 0.07, ph: 1.2 },
    { x: 0.62, w: 0.05, ph: 0.3 },
    { x: 0.78, w: 0.06, ph: 1.8 },
  ];
  lines.forEach((L) => {
    const xc = W * L.x;
    const w = W * L.w;
    const pulse = 0.6 + 0.4 * Math.sin(t * 3 + L.ph);
    const g = ctx.createLinearGradient(0, pleuraY, 0, H);
    g.addColorStop(0, `rgba(255,255,255,${0.85 * pulse})`);
    g.addColorStop(0.6, `rgba(220,220,220,${0.5 * pulse})`);
    g.addColorStop(1, "rgba(180,180,180,0)");
    ctx.fillStyle = g;
    ctx.fillRect(xc - w / 2, pleuraY, w, H);
  });

  speckle(ctx, W, H, t, 0.4, 0.3);
  gradientDepth(ctx, W, H);
  ctx.restore();
}

function scTamponade(ctx: Ctx, W: number, H: number, t: number) {
  clipFan(ctx, W, H, "sector");
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2,
    cy = H * 0.55;
  ctx.strokeStyle = "rgba(230,230,230,0.7)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(cx, cy, W * 0.32, H * 0.34, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#020202";
  ctx.beginPath();
  ctx.ellipse(cx, cy, W * 0.3, H * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  const beat = 0.5 + 0.5 * Math.max(0, Math.sin(t * 2.5));
  const sz = 1 - beat * 0.18;

  ctx.fillStyle = "rgba(120,120,120,0.55)";
  ctx.beginPath();
  ctx.ellipse(cx, cy, W * 0.24 * sz, H * 0.26 * sz, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(200,200,200,0.7)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(cx, cy, W * 0.24 * sz, H * 0.26 * sz, 0, 0, Math.PI * 2);
  ctx.stroke();

  const collapse = 0.5 + 0.5 * Math.sin(t * 2.5 + 0.8);
  ctx.fillStyle = "rgba(140,140,140,0.55)";
  ctx.beginPath();
  ctx.ellipse(
    cx + W * 0.13,
    cy - H * 0.16,
    W * 0.07 * (1 - collapse * 0.5),
    H * 0.06,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  ctx.fillStyle = "#050505";
  ctx.beginPath();
  ctx.ellipse(cx - W * 0.06, cy, W * 0.1 * sz, H * 0.18 * sz, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + W * 0.06, cy, W * 0.1 * sz, H * 0.18 * sz, 0, 0, Math.PI * 2);
  ctx.fill();

  speckle(ctx, W, H, t, 0.35, 0.25);
  gradientDepth(ctx, W, H);
  ctx.restore();
}

function scMorrison(ctx: Ctx, W: number, H: number, t: number) {
  clipFan(ctx, W, H, "curve");
  ctx.fillStyle = "#0c0c0c";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(110,110,110,0.7)";
  ctx.beginPath();
  ctx.moveTo(W * 0.1, H * 0.15);
  ctx.bezierCurveTo(W * 0.4, H * 0.1, W * 0.7, H * 0.3, W * 0.85, H * 0.45);
  ctx.lineTo(W * 0.85, H * 0.65);
  ctx.bezierCurveTo(W * 0.6, H * 0.55, W * 0.3, H * 0.5, W * 0.1, H * 0.55);
  ctx.closePath();
  ctx.fill();

  const offset = Math.sin(t * 0.8) * 4;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.moveTo(W * 0.1, H * 0.55 + offset);
  ctx.bezierCurveTo(
    W * 0.3,
    H * 0.5 + offset,
    W * 0.6,
    H * 0.55 + offset,
    W * 0.85,
    H * 0.65 + offset,
  );
  ctx.lineTo(W * 0.85, H * 0.7 + offset);
  ctx.bezierCurveTo(
    W * 0.55,
    H * 0.6 + offset,
    W * 0.3,
    H * 0.6 + offset,
    W * 0.1,
    H * 0.62 + offset,
  );
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(140,140,140,0.75)";
  ctx.beginPath();
  ctx.ellipse(W * 0.5, H * 0.78 + offset, W * 0.28, H * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(220,220,220,0.7)";
  ctx.beginPath();
  ctx.ellipse(W * 0.5, H * 0.78 + offset, W * 0.1, H * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();

  speckle(ctx, W, H, t, 0.45, 0.4);
  gradientDepth(ctx, W, H);
  ctx.restore();
}

function scSeashore(ctx: Ctx, W: number, H: number, t: number) {
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, W, H);

  const splitY = H * 0.4;
  ctx.fillStyle = "rgba(180,180,180,0.5)";
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(0, H * 0.05 + i * (splitY / 8), W, 1.5);
  }

  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fillRect(0, splitY, W, 2);

  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, splitY + 2, W, H - splitY - 2);
  for (let i = 0; i < 800; i++) {
    const x = Math.random() * W;
    const y = splitY + 4 + Math.random() * (H - splitY - 6);
    const v = Math.random() * 200 + 50;
    ctx.fillStyle = `rgba(${v},${v},${v},${0.4 + Math.random() * 0.4})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  const sweepX = (t * W * 0.3) % W;
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(sweepX, 0, 2, H);
}

function scIJV(ctx: Ctx, W: number, H: number, t: number) {
  clipFan(ctx, W, H, "linear");
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, W, H);

  const pulse = 1 + 0.1 * Math.sin(t * 5);
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "rgba(220,220,220,0.8)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(W * 0.4, H * 0.5, W * 0.07 * pulse, W * 0.07 * pulse, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#000";
  ctx.strokeStyle = "rgba(200,200,200,0.7)";
  ctx.beginPath();
  ctx.ellipse(W * 0.6, H * 0.45, W * 0.11, W * 0.09, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const needleProgress = (t * 0.3) % 1;
  const nx0 = W * 0.95;
  const ny0 = H * 0.15;
  const nxEnd = W * (0.95 - needleProgress * 0.4);
  const nyEnd = H * (0.15 + needleProgress * 0.35);
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(nx0, ny0);
  ctx.lineTo(nxEnd, nyEnd);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,1)";
  ctx.beginPath();
  ctx.arc(nxEnd, nyEnd, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "11px ui-monospace, Menlo, monospace";
  ctx.fillText("CA", W * 0.36, H * 0.5);
  ctx.fillText("IJV", W * 0.57, H * 0.45);

  speckle(ctx, W, H, t, 0.4, 0.35);
  gradientDepth(ctx, W, H);
  ctx.restore();
}

function scDVT(ctx: Ctx, W: number, H: number, t: number) {
  clipFan(ctx, W, H, "linear");
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, W, H);

  const press = (Math.sin(t * 1.2) + 1) / 2;

  ctx.fillStyle = "#000";
  ctx.strokeStyle = "rgba(220,220,220,0.8)";
  ctx.lineWidth = 2.5;
  const aPulse = 1 + 0.08 * Math.sin(t * 5);
  ctx.beginPath();
  ctx.ellipse(W * 0.35, H * 0.5, W * 0.06 * aPulse, W * 0.06 * aPulse, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(80,80,80,0.6)";
  ctx.strokeStyle = "rgba(200,200,200,0.7)";
  ctx.lineWidth = 2.5;
  const vrx = W * 0.1;
  const vry = W * 0.09 * (1 - press * 0.05);
  ctx.beginPath();
  ctx.ellipse(W * 0.55, H * 0.5, vrx, vry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * vrx * 0.9;
    const px = W * 0.55 + Math.cos(a) * r;
    const py = H * 0.5 + Math.sin(a) * r * 0.85;
    ctx.fillStyle = `rgba(${150 + Math.random() * 80},${150 + Math.random() * 80},${
      150 + Math.random() * 80
    },0.5)`;
    ctx.fillRect(px, py, 2, 2);
  }

  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = "10px ui-monospace, Menlo, monospace";
  ctx.fillText(press > 0.5 ? "COMPRESS" : "RELEASE", W * 0.04, H * 0.06);

  speckle(ctx, W, H, t, 0.4, 0.35);
  gradientDepth(ctx, W, H);
  ctx.restore();
}

function scHydro(ctx: Ctx, W: number, H: number, t: number) {
  clipFan(ctx, W, H, "curve");
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(120,120,120,0.65)";
  ctx.beginPath();
  ctx.ellipse(W * 0.5, H * 0.5, W * 0.32, H * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(W * 0.5, H * 0.5, W * 0.1, H * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(
      W * 0.5 + Math.cos(ang) * W * 0.16,
      H * 0.5 + Math.sin(ang) * H * 0.16,
      W * 0.06,
      W * 0.05,
      ang,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.fillStyle = "#000";
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    ctx.save();
    ctx.translate(W * 0.5, H * 0.5);
    ctx.rotate(ang);
    ctx.fillRect(0, -4, W * 0.16, 8);
    ctx.restore();
  }

  ctx.strokeStyle = "rgba(200,200,200,0.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(W * 0.5, H * 0.5, W * 0.32, H * 0.32, 0, 0, Math.PI * 2);
  ctx.stroke();

  speckle(ctx, W, H, t, 0.5, 0.4);
  gradientDepth(ctx, W, H);
  ctx.restore();
}

function scOB(ctx: Ctx, W: number, H: number, t: number) {
  clipFan(ctx, W, H, "sector");
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(120,120,120,0.6)";
  ctx.beginPath();
  ctx.ellipse(W * 0.5, H * 0.55, W * 0.4, H * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#000";
  ctx.strokeStyle = "rgba(230,230,230,0.85)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(W * 0.5, H * 0.55, W * 0.18, H * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(220,220,220,0.7)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(W * 0.43, H * 0.52, W * 0.025, W * 0.025, 0, 0, Math.PI * 2);
  ctx.stroke();

  const beat = 0.5 + 0.5 * Math.sin(t * 6);
  ctx.fillStyle = `rgba(${200 + beat * 55},${200 + beat * 55},${200 + beat * 55},0.9)`;
  ctx.beginPath();
  ctx.ellipse(W * 0.55, H * 0.58, W * 0.025 + beat * 2, W * 0.018 + beat * 2, 0, 0, Math.PI * 2);
  ctx.fill();

  speckle(ctx, W, H, t, 0.45, 0.35);
  gradientDepth(ctx, W, H);
  ctx.restore();
}

function scLV(ctx: Ctx, W: number, H: number, t: number) {
  clipFan(ctx, W, H, "sector");
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, W, H);

  const cx = W * 0.5,
    cy = H * 0.55;
  const beat = 0.5 + 0.5 * Math.max(0, Math.sin(t * 1.8));
  const contraction = 1 - beat * 0.06;

  ctx.strokeStyle = "rgba(200,200,200,0.7)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.ellipse(cx, cy, W * 0.3 * contraction, H * 0.32 * contraction, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#020202";
  ctx.beginPath();
  ctx.ellipse(cx, cy, W * 0.27 * contraction, H * 0.29 * contraction, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(120,120,120,0.55)";
  ctx.beginPath();
  ctx.ellipse(cx, cy - H * 0.36, W * 0.16, H * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#040404";
  ctx.beginPath();
  ctx.ellipse(cx, cy - H * 0.36, W * 0.13, H * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 1.5;
  const valveAngle = Math.sin(t * 1.8) * 0.3;
  ctx.beginPath();
  ctx.moveTo(cx - W * 0.1, cy - H * 0.25 + valveAngle * 8);
  ctx.lineTo(cx + W * 0.1, cy - H * 0.25 - valveAngle * 8);
  ctx.stroke();

  speckle(ctx, W, H, t, 0.4, 0.3);
  gradientDepth(ctx, W, H);
  ctx.restore();
}

function scAAA(ctx: Ctx, W: number, H: number, t: number) {
  clipFan(ctx, W, H, "curve");
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, W, H);

  const cx = W * 0.5,
    cy = H * 0.5;
  const pulse = 1 + 0.04 * Math.sin(t * 4);

  ctx.strokeStyle = "rgba(220,220,220,0.85)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(cx, cy, W * 0.28 * pulse, W * 0.28 * pulse, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(cx, cy, W * 0.27 * pulse, W * 0.27 * pulse, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(110,110,110,0.7)";
  ctx.beginPath();
  ctx.ellipse(
    cx + W * 0.05,
    cy,
    W * 0.22 * pulse,
    W * 0.2 * pulse,
    0,
    Math.PI * 0.6,
    Math.PI * 1.4,
  );
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(180, 220, 255, 0.85)";
  ctx.lineWidth = 1.5;
  const drawCaliper = (x: number, y: number) => {
    ctx.beginPath();
    ctx.moveTo(x - 5, y);
    ctx.lineTo(x + 5, y);
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x, y + 5);
    ctx.stroke();
  };
  drawCaliper(cx - W * 0.28 * pulse, cy);
  drawCaliper(cx + W * 0.28 * pulse, cy);
  ctx.strokeStyle = "rgba(180, 220, 255, 0.4)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(cx - W * 0.28 * pulse, cy);
  ctx.lineTo(cx + W * 0.28 * pulse, cy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(180, 220, 255, 0.85)";
  ctx.font = "10px ui-monospace, Menlo, monospace";
  ctx.fillText("6.2 cm", cx - 16, cy - 8);

  speckle(ctx, W, H, t, 0.45, 0.35);
  gradientDepth(ctx, W, H);
  ctx.restore();
}

function scConsolidation(ctx: Ctx, W: number, H: number, t: number) {
  clipFan(ctx, W, H, "curve");
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(100,100,100,0.7)";
  ctx.beginPath();
  ctx.moveTo(W * 0.1, H * 0.2);
  ctx.bezierCurveTo(W * 0.4, H * 0.15, W * 0.7, H * 0.2, W * 0.9, H * 0.3);
  ctx.lineTo(W * 0.9, H * 0.95);
  ctx.lineTo(W * 0.1, H * 0.95);
  ctx.closePath();
  ctx.fill();

  const bronchograms = [
    { x: 0.3, y: 0.45, ph: 0 },
    { x: 0.5, y: 0.55, ph: 1 },
    { x: 0.65, y: 0.5, ph: 2 },
    { x: 0.4, y: 0.65, ph: 0.5 },
    { x: 0.6, y: 0.7, ph: 1.5 },
    { x: 0.35, y: 0.78, ph: 2.5 },
    { x: 0.55, y: 0.85, ph: 1.8 },
  ];
  bronchograms.forEach((b) => {
    const move = Math.sin(t * 1.5 + b.ph) * 4;
    const x = W * b.x;
    const y = H * b.y + move;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.arc(x, y, 3 + Math.sin(t + b.ph), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W * 0.1, H * 0.2);
  ctx.bezierCurveTo(W * 0.4, H * 0.15, W * 0.7, H * 0.2, W * 0.9, H * 0.3);
  ctx.stroke();

  speckle(ctx, W, H, t, 0.55, 0.4);
  gradientDepth(ctx, W, H);
  ctx.restore();
}

function scGallstone(ctx: Ctx, W: number, H: number, t: number) {
  clipFan(ctx, W, H, "curve");
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(100,100,100,0.5)";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#020202";
  ctx.strokeStyle = "rgba(220,220,220,0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(W * 0.45, H * 0.42, W * 0.18, H * 0.14, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const stoneX = W * 0.42 + Math.sin(t * 0.8) * 3;
  const stoneY = H * 0.48 + Math.cos(t * 0.6) * 2;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.arc(stoneX, stoneY, W * 0.04, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.moveTo(stoneX - W * 0.04, stoneY);
  ctx.lineTo(stoneX + W * 0.04, stoneY);
  ctx.lineTo(stoneX + W * 0.05, H);
  ctx.lineTo(stoneX - W * 0.05, H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  speckle(ctx, W, H, t, 0.5, 0.4);
  gradientDepth(ctx, W, H);
  ctx.restore();
}

function scECG(
  ctx: Ctx,
  W: number,
  H: number,
  t: number,
  kind: string,
  labels?: SceneLabels["ecg"],
) {
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(180,40,40,0.25)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += W / 30) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += H / 18) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  const baseline = H * 0.5;
  const period = kind === "ecg-block" ? 1.6 : kind === "ecg-afib" ? 0.55 : 0.8;
  const sweep = (t * 0.5) % 1;
  const cursor = sweep * W;

  ctx.strokeStyle = "rgba(160,255,180,0.95)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x < W; x++) {
    const local = ((x / W) * (W / period / 80)) % 1;
    let y = baseline;
    if (kind === "ecg-afib") {
      const noise = Math.sin(x * 0.6 + t * 4) * 4 + Math.sin(x * 1.7 + t * 3) * 3;
      y += noise;
      if (local < 0.05) y -= 30 * (local / 0.05);
      else if (local < 0.1) y += 18 * ((local - 0.05) / 0.05);
    } else if (kind === "ecg-block") {
      const pPhase = (x * 0.04 + t * 1.5) % 1;
      if (pPhase < 0.05) y -= 6;
      if (local < 0.04) y -= 30;
      else if (local < 0.09) y += 14;
    } else {
      // ecg-stemi: ST elevation after R
      if (local < 0.04) y -= 8;
      else if (local < 0.07) y -= 38;
      else if (local < 0.1) y += 12;
      else if (local < 0.25) y -= 14; // elevated ST
    }
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.fillStyle = "rgba(160,255,180,0.55)";
  ctx.fillRect(cursor, 0, 2, H);

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "10px ui-monospace, Menlo, monospace";
  // Use the translated labels when the React caller provided them
  // via `drawScene(... { labels: { ecg } })`; fall back to the
  // Spanish baseline for tests and any non-React consumer.
  const label =
    kind === "ecg-stemi"
      ? (labels?.stemi ?? "STEMI INFERIOR")
      : kind === "ecg-afib"
        ? (labels?.afib ?? "FIBRILACIÓN AURICULAR")
        : (labels?.bav ?? "BAV COMPLETO");
  ctx.fillText(label, 12, 18);
}

function scInfo(
  ctx: Ctx,
  W: number,
  H: number,
  t: number,
  kind: string,
  labels?: SceneLabels["info"],
) {
  ctx.fillStyle = "#0c0d10";
  ctx.fillRect(0, 0, W, H);

  // Diagonal hatch background
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let i = -H; i < W; i += 14) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + H, H);
    ctx.stroke();
  }

  // `title` ("BLUE" / "RUSH" / "E-FAST") is a protocol acronym that
  // doesn't translate — kept inline. The `sub` line is editorial
  // prose that DOES translate; route through the dict when the
  // React caller threaded labels via `drawScene(opts.labels.info)`,
  // fall back to the Spanish baseline otherwise.
  const title = kind === "info-blue" ? "BLUE" : kind === "info-rush" ? "RUSH" : "E-FAST";
  const sub =
    kind === "info-blue"
      ? (labels?.blue ?? "Disnea aguda · algoritmo")
      : kind === "info-rush"
        ? (labels?.rush ?? "Shock indiferenciado · 3 pasos")
        : (labels?.fast ?? "Trauma · 8 puntos");

  // Decorative blocks
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.5);
  const blocks = [
    { x: 0.12, y: 0.55, w: 0.22, h: 0.18 },
    { x: 0.39, y: 0.55, w: 0.22, h: 0.18 },
    { x: 0.66, y: 0.55, w: 0.22, h: 0.18 },
  ];
  blocks.forEach((b, i) => {
    ctx.fillStyle = `rgba(255,255,255,${0.06 + (i === Math.floor(t) % 3 ? pulse * 0.18 : 0.04)})`;
    ctx.fillRect(W * b.x, H * b.y, W * b.w, H * b.h);
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.strokeRect(W * b.x, H * b.y, W * b.w, H * b.h);
  });

  // Connectors
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W * 0.34, H * 0.64);
  ctx.lineTo(W * 0.39, H * 0.64);
  ctx.moveTo(W * 0.61, H * 0.64);
  ctx.lineTo(W * 0.66, H * 0.64);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `${Math.floor(W * 0.13)}px Newsreader, Georgia, serif`;
  ctx.fillText(title, W * 0.08, H * 0.38);

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `${Math.floor(W * 0.034)}px ui-monospace, Menlo, monospace`;
  ctx.fillText(sub.toUpperCase(), W * 0.08, H * 0.46);
}
