// ---------------------------------------------------------------------------
// Icon system
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import {
  Globe, Mail, Phone, MapPin,
  Music, Mic, Headphones, Camera,
  ShoppingBag, Coffee, Heart, Star, Rss, PiggyBank, Landmark, Handshake,
  House, HouseHeart,
  Link as LinkIcon,
} from "lucide-react";
import {
  SiYoutube, SiInstagram, SiFacebook, SiX, SiTwitch,
  SiSpotify, SiBandcamp, SiSoundcloud,
} from "react-icons/si";
import NoiseEmporiumIcon from "../assets/NoiseEmporiumIcon";

export const ICON_MAP: Record<string, React.ComponentType<any>> = {
  // Brand
  YouTube: SiYoutube,
  Instagram: SiInstagram,
  Facebook: SiFacebook,
  Twitter: SiX,
  Twitch: SiTwitch,
  Spotify: SiSpotify,
  Bandcamp: SiBandcamp,
  SoundCloud: SiSoundcloud,
  // General
  Globe, Mail, Phone, MapPin,
  Music, Mic, Headphones, Camera,
  ShoppingBag, Coffee, Heart, Star, Rss, PiggyBank, Landmark, Handshake,
  House, HouseHeart,
  Link: LinkIcon,
  // Custom
  Emporium: NoiseEmporiumIcon,
};

export const ICON_OPTIONS = Object.keys(ICON_MAP);

export const BRAND_COLORS: Record<string, string> = {
  YouTube:    "#ff0000",
  Instagram:  "#c13584",
  Facebook:   "#1877f2",
  Twitter:    "#1d9bf0",
  Twitch:     "#9146ff",
  Spotify:    "#1db954",
  Bandcamp:   "#1da0c3",
  SoundCloud: "#ff5500",
};

export function Icon({ name, size = 16, color }: { name: string; size?: number; color?: string }) {
  const Component = ICON_MAP[name];
  if (!Component) return null;
  return <Component size={size} style={color ? { color } : undefined} />;
}

const DROP_WIDTH = 320;
const SCREEN_GAP = 8;

export function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLSpanElement>(null);
  const pointerDownOutside = useRef<{ x: number; y: number } | null>(null);

  function openDropdown() {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const vw = window.innerWidth;
      // Right-align with trigger, clamped to viewport
      let left = rect.right - DROP_WIDTH;
      left = Math.max(SCREEN_GAP, left);
      left = Math.min(vw - DROP_WIDTH - SCREEN_GAP, left);
      setDropPos({ top: rect.bottom + 4, left });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        pointerDownOutside.current = { x: e.clientX, y: e.clientY };
      } else {
        pointerDownOutside.current = null;
      }
    }
    function handlePointerUp(e: PointerEvent) {
      const start = pointerDownOutside.current;
      pointerDownOutside.current = null;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      // Only close if the pointer barely moved (tap, not a scroll/drag)
      if (Math.sqrt(dx * dx + dy * dy) < 10) setOpen(false);
    }

    let rafId: number | null = null;
    function handleScroll() {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) {
          setOpen(false);
          return;
        }
        const vw = window.innerWidth;
        let left = rect.right - DROP_WIDTH;
        left = Math.max(SCREEN_GAP, left);
        left = Math.min(vw - DROP_WIDTH - SCREEN_GAP, left);
        setDropPos({ top: rect.bottom + 4, left });
      });
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("scroll", handleScroll, true);
      if (rafId !== null) cancelAnimationFrame(rafId);

    };
  }, [open]);

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openDropdown())}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          borderRadius: 20,
          border: open ? "1.5px solid #f78f1e" : "1px solid #d1d5db",
          background: "#fff",
          padding: "0.35rem 0.75rem",
          cursor: "pointer",
          fontSize: "0.9rem",
          color: "#12080b",
          fontFamily: "inherit",
          transition: "border-color 120ms ease",
        }}
      >
        {value ? (
          <>
            <Icon name={value} size={15} />
            <span>{value}</span>
          </>
        ) : (
          <span style={{ color: "#9ca3af" }}>None</span>
        )}
        <span style={{ color: "#9ca3af", fontSize: "0.7rem", marginLeft: 2 }}>▾</span>
      </button>

      {open && (
        // position:fixed escapes overflow:hidden on body/html so it's never clipped
        <div
          style={{
            position: "fixed",
            top: dropPos.top,
            left: dropPos.left,
            zIndex: 200,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            boxShadow: "0 4px 20px rgba(0,0,0,0.10)",
            padding: "0.75rem",
            width: DROP_WIDTH,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}>
            {ICON_OPTIONS.map((name) => {
              const selected = value === name;
              const isHovered = hovered === name;
              return (
                <button
                  key={name}
                  type="button"
                  title={name}
                  onClick={() => { onChange(name); setOpen(false); }}
                  onMouseEnter={() => setHovered(name)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 3,
                    padding: "7px 4px",
                    borderRadius: 8,
                    border: selected ? "1.5px solid #f78f1e" : "1.5px solid transparent",
                    background: selected || isHovered ? "#fef3e2" : "transparent",
                    cursor: "pointer",
                    color: selected ? "#f78f1e" : "#12080b",
                    transition: "background 100ms ease, border-color 100ms ease",
                  }}
                >
                  <Icon name={name} size={20} color={selected ? "#f78f1e" : undefined} />
                  <span style={{ fontSize: "0.6rem", color: selected ? "#f78f1e" : "#9ca3af", lineHeight: 1.2, textAlign: "center" }}>{name}</span>
                </button>
              );
            })}
          </div>
          <div style={{ borderTop: "1px solid #f3f4f6", marginTop: "0.5rem", paddingTop: "0.5rem" }}>
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              style={{
                width: "100%",
                textAlign: "center",
                padding: "0.35rem",
                borderRadius: 8,
                border: "1.5px solid transparent",
                background: value === "" ? "#fef3e2" : "transparent",
                cursor: "pointer",
                color: "#9ca3af",
                fontSize: "0.85rem",
                fontFamily: "inherit",
              }}
            >
              — None —
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
