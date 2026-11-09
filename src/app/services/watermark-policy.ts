import { Injectable, computed, inject } from '@angular/core';
import { UserStoreService } from './user-store.service';

/**
 * Visible brand credit for free-tier works.
 *
 * Paid services are a future task; the only exemption available today is an
 * explicit paid/admin role. Unknown roles are deliberately treated as free.
 */
export const FREE_TIER_WATERMARK_LABEL = '©️ Smuve Jeff Presents';

export type WatermarkTier = 'free' | 'paid' | 'admin';

export interface WatermarkPolicy {
  tier: WatermarkTier;
  watermarkRequired: boolean;
  label: string;
  /** 0..1 global opacity for the drawn badge. */
  opacity: number;
}

export const FREE_TIER_WATERMARK_POLICY: WatermarkPolicy = {
  tier: 'free',
  watermarkRequired: true,
  label: FREE_TIER_WATERMARK_LABEL,
  opacity: 0.86,
};

const PAID_ROLES = new Set([
  'paid',
  'paying',
  'premium',
  'pro',
  'professional',
  'enterprise',
  'studio',
]);

const ADMIN_ROLE = 'admin';

function normalizeRole(role: string | null | undefined): string {
  return role?.trim().toLowerCase() ?? '';
}

/** The same role → policy rule as the backend commercial-policy resolver. */
export function watermarkPolicyForRole(
  role: string | null | undefined
): WatermarkPolicy {
  const normalizedRole = normalizeRole(role);
  const isAdmin = normalizedRole === ADMIN_ROLE;
  const isPaid = isAdmin || PAID_ROLES.has(normalizedRole);

  if (isPaid) {
    return {
      tier: isAdmin ? 'admin' : 'paid',
      watermarkRequired: false,
      label: FREE_TIER_WATERMARK_LABEL,
      opacity: 0,
    };
  }

  return { ...FREE_TIER_WATERMARK_POLICY };
}

/** App-wide watermark state for the signed-in account. */
@Injectable({ providedIn: 'root' })
export class WatermarkPolicyService {
  private readonly userStore = inject(UserStoreService);

  readonly policy = computed(() =>
    watermarkPolicyForRole(this.userStore.user()?.role)
  );
  readonly shouldWatermark = computed(
    () => this.policy().watermarkRequired
  );
  readonly label = computed(() => this.policy().label);
}

/**
 * Draw the free-tier badge into an already-painted canvas.
 *
 * The badge sits bottom-right, above the caption-safe area is avoided by
 * keeping it anchored to the lower-right corner and nudging it upward when
 * the raster is short. It is intentionally a visible brand credit, not a
 * claim of tamper-proof DRM.
 */
export function drawWatermarkOnCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  policy: WatermarkPolicy = FREE_TIER_WATERMARK_POLICY
): void {
  if (!policy.watermarkRequired || width <= 0 || height <= 0) return;

  const label = policy.label || FREE_TIER_WATERMARK_LABEL;
  let fontSize = Math.max(9, Math.min(24, width * 0.016));
  const paddingX = Math.max(6, fontSize * 0.85);
  const paddingY = Math.max(4, fontSize * 0.55);
  const rightMargin = Math.max(8, width * 0.018);
  const bottomMargin = Math.min(
    Math.max(8, height * 0.018),
    Math.max(6, height * 0.08)
  );

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, policy.opacity));

  // Shrink to fit before painting: one pass is enough for the fixed label.
  while (fontSize > 8) {
    ctx.font = `800 ${fontSize}px "Public Sans", Arial, sans-serif`;
    const textWidth = ctx.measureText(label).width;
    if (textWidth + paddingX * 2 <= width - rightMargin * 2) break;
    fontSize *= 0.92;
  }

  ctx.font = `800 ${fontSize}px "Public Sans", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const textWidth = ctx.measureText(label).width;
  const boxWidth = Math.ceil(textWidth + paddingX * 2);
  const boxHeight = Math.ceil(fontSize + paddingY * 2);
  const boxX = Math.max(0, width - boxWidth - rightMargin);
  const boxY = Math.max(0, height - boxHeight - bottomMargin);
  const centerX = boxX + boxWidth / 2;
  const centerY = boxY + boxHeight / 2;

  ctx.fillStyle = 'rgba(2, 6, 23, 0.62)';
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
  ctx.fillStyle = 'rgba(248, 250, 252, 0.96)';
  ctx.fillText(label, centerX, centerY + 0.5);
  ctx.restore();
}

/**
 * Bake the watermark into an image blob for download.
 *
 * The original blob is returned unchanged when watermarking is not required,
 * when the bitmap cannot be decoded (for example a cross-origin image), or
 * when canvas export is unavailable. That fallback keeps the download path
 * honest rather than silently producing a broken file.
 */
export async function watermarkImageBlob(
  blob: Blob,
  policy: WatermarkPolicy = FREE_TIER_WATERMARK_POLICY
): Promise<Blob> {
  if (!policy.watermarkRequired) return blob;
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') {
    return blob;
  }
  if (!blob.type.startsWith('image/')) return blob;

  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return blob;
    }

    ctx.drawImage(bitmap, 0, 0);
    drawWatermarkOnCanvas(ctx, canvas.width, canvas.height, policy);
    bitmap.close?.();

    const outputType = blob.type || 'image/png';
    const watermarked = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((next) => resolve(next), outputType, 0.92)
    );
    return watermarked ?? blob;
  } catch {
    return blob;
  }
}
