// ---------------------------------------------------------------------------
// Icon registry — name → component map plus brand colors. Kept out of
// icons.tsx so that file exports only components (Vite fast refresh).
// ---------------------------------------------------------------------------

import type { ComponentType, CSSProperties } from "react";
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

// Only the props Icon() actually passes — lucide, react-icons, and custom
// icons all accept this subset.
export type IconProps = { size?: number; style?: CSSProperties };

export const ICON_MAP: Record<string, ComponentType<IconProps>> = {
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
