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

export function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        {value ? <><Icon name={value} /> {value}</> : "— None —"}
        {" ▾"}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            zIndex: 10,
            background: "white",
            border: "1px solid #ccc",
            padding: 8,
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 4,
            width: 280,
          }}
        >
          {ICON_OPTIONS.map((name) => (
            <button
              key={name}
              type="button"
              title={name}
              onClick={() => { onChange(name); setOpen(false); }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                padding: "6px 4px",
                fontSize: 10,
                background: value === name ? "#eee" : "transparent",
                border: value === name ? "1px solid #999" : "1px solid transparent",
                cursor: "pointer",
              }}
            >
              <Icon name={name} size={18} />
              {name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { onChange(""); setOpen(false); }}
            style={{
              gridColumn: "1 / -1",
              textAlign: "center",
              padding: "4px 6px",
              background: value === "" ? "#eee" : "transparent",
              border: value === "" ? "1px solid #999" : "1px solid transparent",
            }}
          >
            — None —
          </button>
        </div>
      )}
    </span>
  );
}
