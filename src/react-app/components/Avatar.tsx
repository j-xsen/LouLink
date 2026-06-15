// ---------------------------------------------------------------------------
// Avatar components
// ---------------------------------------------------------------------------

import { useId, useRef, useState } from "react";
import { BLOB_SHAPES } from "./ui";
import type { AvatarShape } from "../types";

export const ALLOWED_IMAGE_TYPES_CLIENT = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export const MAX_AVATAR_BYTES_CLIENT = 5 * 1024 * 1024;

export function AvatarImage({ src, size = 64, alt = "Profile picture", shape = "circle" }: { src: string | null; size?: number; alt?: string; shape?: AvatarShape }) {
  const uid = useId().replace(/:/g, "");
  if (!src) return null;
  if (shape !== "circle") {
    const { viewBox, d } = BLOB_SHAPES[shape as keyof typeof BLOB_SHAPES];
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
    <img src={src} alt={alt} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", display: "block" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
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
      const res = await fetch("/api/me/avatar", {
        method: "POST",
        headers: { "Content-Type": file.type, Authorization: `Bearer ${token}` },
        body: file,
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
