// ---------------------------------------------------------------------------
// Avatar components
// ---------------------------------------------------------------------------

import React, { useId, useRef, useState } from "react";
import { AVATAR_BLOB_SHAPES } from "./ui";
import type { AvatarShape } from "../types";

export const ALLOWED_IMAGE_TYPES_CLIENT = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export const MAX_AVATAR_BYTES_CLIENT = 5 * 1024 * 1024;

const AVATAR_MAX_PX = 200;

export async function resizeAndEncode(file: File): Promise<{ blob: Blob; mimeType: string; dataUrl: string }> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const scale = Math.min(AVATAR_MAX_PX / side, 1);
  const dim = Math.round(side * scale);
  const canvas = document.createElement("canvas");
  canvas.width = dim;
  canvas.height = dim;
  const ctx = canvas.getContext("2d")!;
  const ox = (bitmap.width - side) / 2;
  const oy = (bitmap.height - side) / 2;
  ctx.drawImage(bitmap, ox, oy, side, side, 0, 0, dim, dim);
  bitmap.close();
  // Try AVIF first, fall back to WebP
  for (const [type, quality] of [["image/avif", 0.75], ["image/webp", 0.75]] as const) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, quality));
    if (blob && blob.type === type) {
      const dataUrl = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob); });
      return { blob, mimeType: type, dataUrl };
    }
  }
  // Last resort: upload the original file unchanged
  const dataUrl = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(file); });
  return { blob: file, mimeType: file.type, dataUrl };
}

export function AvatarImage({ src, size = 64, alt = "Profile picture", shape = "circle" }: { src: string | null; size?: number; alt?: string; shape?: AvatarShape }) {
  const uid = useId().replace(/:/g, "");
  if (!src) return null;
  if (shape !== "circle") {
    const { viewBox, d } = AVATAR_BLOB_SHAPES[shape];
    const [, , w, h] = viewBox.split(" ").map(Number);
    const clipId = `avatar-clip-${uid}`;
    return (
      <svg width={size} height={size} viewBox={viewBox} role="img" aria-label={alt} style={{ display: "block" }}>
        <defs>
          <clipPath id={clipId}>
            <path d={d} />
          </clipPath>
        </defs>
        <image href={src} x="0" y="0" width={w} height={h} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} />
      </svg>
    );
  }
  return (
    <img key={src} src={src} alt={alt} width={size} height={size} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", display: "block" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
  );
}

export function AvatarOverlay({ shape, size, visible, children }: {
  shape: AvatarShape; size: number; visible: boolean; children?: React.ReactNode;
}) {
  const uid = useId().replace(/:/g, "");
  const baseStyle: React.CSSProperties = {
    position: "absolute", inset: 0,
    opacity: visible ? 1 : 0,
    transition: "opacity 150ms",
    pointerEvents: "none",
    display: "flex", alignItems: "center", justifyContent: "center",
  };

  if (shape !== "circle") {
    const { viewBox, d } = AVATAR_BLOB_SHAPES[shape];
    const [, , w, h] = viewBox.split(" ").map(Number);
    const clipId = `overlay-clip-${uid}`;
    return (
      <svg style={{ ...baseStyle, overflow: "hidden" }} width={size} height={size} viewBox={viewBox}>
        <defs><clipPath id={clipId}><path d={d} /></clipPath></defs>
        <rect width={w} height={h} fill="#00000055" clipPath={`url(#${clipId})`} />
        {children && (
          <foreignObject x="0" y="0" width={w} height={h}>
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {children}
            </div>
          </foreignObject>
        )}
      </svg>
    );
  }

  return (
    <div style={{ ...baseStyle, borderRadius: "50%", background: "#00000055" }}>
      {children}
    </div>
  );
}

export function AvatarUpload({
  currentAvatarUrl,
  token,
  onSuccess,
}: {
  currentAvatarUrl: string | null;
  token: string;
  onSuccess: (newAvatarUrl: string) => void;
}) {
  const [preview, setPreview] = useState<string | null>(currentAvatarUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError("");
    if (!ALLOWED_IMAGE_TYPES_CLIENT.has(file.type)) {
      setError("Only JPEG, PNG, WebP, or GIF images are allowed.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES_CLIENT) {
      setError("Image must be under 5 MB.");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setUploading(true);
    try {
      const { blob, mimeType } = await resizeAndEncode(file);
      const res = await fetch("/api/me/avatar", {
        method: "POST",
        headers: { "Content-Type": mimeType, Authorization: `Bearer ${token}` },
        body: blob,
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Upload failed.");
        setPreview(currentAvatarUrl);
        return;
      }
      onSuccess(d.avatarUrl);
    } catch {
      setError("Upload failed. Please try again.");
      setPreview(currentAvatarUrl);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(objectUrl);
    }
  }

  return (
    <div style={{ textAlign: "center" }}>
      {preview && (
        <div style={{ marginBottom: 8, display: "flex", justifyContent: "center" }}>
          <AvatarImage src={preview} size={110} alt="Profile picture preview" />
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
      <p>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? "Uploading…" : preview ? "Change photo" : "Upload photo"}
        </button>
      </p>
      {error && <p><strong>{error}</strong></p>}
    </div>
  );
}
