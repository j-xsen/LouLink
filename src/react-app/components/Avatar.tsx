// ---------------------------------------------------------------------------
// Avatar components
// ---------------------------------------------------------------------------

import { useRef, useState } from "react";

export const ALLOWED_IMAGE_TYPES_CLIENT = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export const MAX_AVATAR_BYTES_CLIENT = 5 * 1024 * 1024;

export function AvatarImage({ src, size = 64, alt = "Profile picture", blobClip = false }: { src: string | null; size?: number; alt?: string; blobClip?: boolean }) {
  if (!src) return null;
  if (blobClip) {
    return (
      <svg width={size} height={size} viewBox="0 0 677.19 598.14" role="img" aria-label={alt} style={{ display: "block" }}>
        <defs>
          <clipPath id="avatar-blob-clip">
            <path d="M39.5,543.53C-48.8,446.41,16,180.46,183.5,63.53c22.79-15.91,113.18-79.01,228-60,158.66,26.26,281.67,195.65,264,320-31.3,220.22-512.01,356.38-636,220Z" />
          </clipPath>
        </defs>
        <image href={src} x="0" y="0" width="677.19" height="598.14" preserveAspectRatio="xMidYMid slice" clipPath="url(#avatar-blob-clip)" />
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
          <AvatarImage src={preview} size={110} alt="Profile picture preview" blobClip />
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
