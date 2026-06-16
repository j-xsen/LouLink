// ---------------------------------------------------------------------------
// Shared UI components
// ---------------------------------------------------------------------------

import { useId } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import logoFullColor from "../assets/logo-full-color.svg";
const shape2 = "/shapes/shape-2.svg";
const shape4 = "/shapes/shape-4.svg";

// ---------------------------------------------------------------------------
// ShapeButton — organic SVG blob background CTA
// ---------------------------------------------------------------------------

export function ShapeButton({
  to,
  href,
  onClick,
  shape,
  style,
  type = "button",
  children,
}: {
  to?: string;
  href?: string;
  onClick?: () => void;
  shape: string;
  style?: React.CSSProperties;
  type?: "button" | "submit" | "reset";
  children: React.ReactNode;
}) {
  const containerStyle: React.CSSProperties = {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "flex-start",
    minWidth: 0,
    height: 52,
    padding: "0 0.5rem 0 0.75rem",
    color: "#12080b",
    fontWeight: 700,
    textDecoration: "none",
    cursor: "pointer",
    border: "none",
    background: "none",
  };
  const imgStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    objectPosition: "left center",
    zIndex: 0,
    pointerEvents: "none",
    transform: "translateX(-5px)",
  };
  const labelStyle: React.CSSProperties = {
    position: "relative",
    zIndex: 1,
    fontSize: "1.5rem",
    fontFamily: "'Aladin', Georgia, serif",
    paddingTop: "4px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    whiteSpace: "nowrap",
  };
  const inner = (
    <>
      <img src={shape} alt="" style={imgStyle} />
      <span style={labelStyle}>{children}</span>
    </>
  );
  const merged = { ...containerStyle, ...style };
  if (to) return <Link to={to} style={merged}>{inner}</Link>;
  if (href) return <a href={href} style={merged}>{inner}</a>;
  return <button type={type} onClick={onClick} style={merged}>{inner}</button>;
}

// ---------------------------------------------------------------------------
// PageHeader — back arrow + centered logo (shared across inner pages)
// ---------------------------------------------------------------------------

export function PageHeader() {
  const navigate = useNavigate();
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "0.5rem 0 0" }}>
      <div style={{ position: "relative", display: "inline-flex", alignItems: "center", height: 44, flexShrink: 0 }}>
        <img src={shape4} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", objectPosition: "left center", pointerEvents: "none", transform: "translateX(-5px)" }} />
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Go back"
          style={{ position: "relative", zIndex: 1, background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", color: "#12080b", padding: "0 1.5rem 0 0.55rem" }}
        >
          <ArrowLeft size={26} />
        </button>
      </div>
      <div style={{ flex: 1, textAlign: "center" }}>
        <Link to="/"><img src={logoFullColor} alt="LouLink" style={{ width: "min(55%, 220px)", height: "auto" }} /></Link>
      </div>
      <div style={{ flexShrink: 0, width: 56 }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ShapeTitle — shape2 blob heading (shared across inner pages)
// ---------------------------------------------------------------------------

export function ShapeTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ textAlign: "center", marginTop: "1.75rem" }}>
      <div style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", height: 52, minWidth: 160 }}>
        <img src={shape2} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", pointerEvents: "none", zIndex: 0 }} />
        <span style={{ position: "relative", zIndex: 1, fontSize: "1.5rem", fontFamily: "'Aladin', Georgia, serif", paddingTop: "4px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#12080b", padding: "0 1.75rem" }}>
          {children}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BlobButton — organic SVG blob CTA (shared across forms)
// ---------------------------------------------------------------------------

export const AVATAR_BLOB_SHAPES: Record<string, { viewBox: string; d: string }> = {
  "1": { viewBox: "0 0 677.19 598.14",  d: "M39.5,543.53C-48.8,446.41,16,180.46,183.5,63.53c22.79-15.91,113.18-79.01,228-60,158.66,26.26,281.67,195.65,264,320-31.3,220.22-512.01,356.38-636,220Z" },
  "5": { viewBox: "0 0 737.8 671.97",   d: "M154.86,464.66C-214.22,160,187.17-75.09,226.36,22.31s475.47-109.25,506.35,71.16c30.89,180.42-86.84,349.22-137.33,468.11-50.5,118.89-71.45,207.75-440.52-96.92Z" },
  "6": { viewBox: "0 0 481.31 506.34",  d: "M41.21,476.17C-25.46,409.15,7.44,161.83,13.1,43.07,14.39,15.86,39.27-4.03,66.09.7c75.59,13.34,217.89,35.47,313.78,32.19,136-4.64,104,363.68,80,407.31s-352,102.99-418.67,35.97Z" },
  "7": { viewBox: "0 0 885.91 715.03",  d: "M13.57,477.76c-56.53-240,80.74-76.83,97.44-328.26s188.83-121.98,421.33-66.4c115.47,27.6,267.76,64.01,328,197.33,50.38,111.49,24.44,264.35-61.33,344C618.39,792.14,70.11,717.76,13.57,477.76Z" },
};

export const BLOB_SHAPES = {
  A: {
    viewBox: "0 0 653.88 594.62",
    d: "M574.06,83.25C417.47-66.78,62.91,5.17,8.72,147.25c-14.01,36.72-12.83,90.94,16,122.67,55.51,61.1,187.2,9.87,197.33,37.33,11.86,32.17-173.22,90.43-170.67,165.33,2.33,68.44,160.99,141.44,298.67,117.33,83.79-14.67,179.89-68.84,176-117.33-5.11-63.73-180.6-89.08-176-117.33,5.37-32.98,241.46,19.87,293.33-69.33,32.05-55.12-14.54-150.17-69.33-202.67Z",
  },
  B: {
    viewBox: "0 0 677.19 598.14",
    d: "M39.5,543.53C-48.8,446.41,16,180.46,183.5,63.53c22.79-15.91,113.18-79.01,228-60,158.66,26.26,281.67,195.65,264,320-31.3,220.22-512.01,356.38-636,220Z",
  },
  C: {
    viewBox: "0 0 666.15 600.25",
    d: "M506.75,17.88C489.21-58.25-24.48,123.82.91,279.98c24.33,149.6,982.68,474.6,555.86,234.62s-32.49-420.6-50.03-496.73Z",
  },
  D: {
    viewBox: "0 0 737.8 671.97",
    d: "M154.86,464.66C-214.22,160,187.17-75.09,226.36,22.31s475.47-109.25,506.35,71.16c30.89,180.42-86.84,349.22-137.33,468.11-50.5,118.89-71.45,207.75-440.52-96.92Z",
  },
  E: {
    viewBox: "0 0 481.31 506.34",
    d: "M41.21,476.17C-25.46,409.15,7.44,161.83,13.1,43.07,14.39,15.86,39.27-4.03,66.09.7c75.59,13.34,217.89,35.47,313.78,32.19,136-4.64,104,363.68,80,407.31s-352,102.99-418.67,35.97Z",
  },
  F: {
    viewBox: "0 0 885.91 715.03",
    d: "M13.57,477.76c-56.53-240,80.74-76.83,97.44-328.26s188.83-121.98,421.33-66.4c115.47,27.6,267.76,64.01,328,197.33,50.38,111.49,24.44,264.35-61.33,344C618.39,792.14,70.11,717.76,13.57,477.76Z",
  },
  G: {
    viewBox: "0 0 1013.79 568",
    d: "M476.64,61.82C423.88,81.12-19.09,243.23.64,373.82c26.03,172.28,859.35,302.51,992,64,66.78-120.07-32.37-354.52-188-420-94.72-39.85-187.4-7.45-328,44Z",
  },
} as const;

// ---------------------------------------------------------------------------
// DragHandle — custom wavy-lines drag icon (replaces generic grid dots)
// ---------------------------------------------------------------------------

export function DragHandle({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 0.7)} viewBox="0 0 20 14" fill="none">
      <path d="M2,3 Q6,1 10,3 Q14,5 18,3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M2,7 Q6,5 10,7 Q14,9 18,7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M2,11 Q6,9 10,11 Q14,13 18,11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function BlobButton({
  blob = "A",
  from = "#f78f1e",
  to = "#ee3666",
  reversed = false,
  disabled = false,
  type = "submit",
  onClick,
  children,
}: {
  blob?: keyof typeof BLOB_SHAPES;
  from?: string;
  to?: string;
  reversed?: boolean;
  disabled?: boolean;
  type?: "submit" | "button";
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const uid = useId().replace(/:/g, "");
  const gradientId = `blob-grad-${uid}`;
  const { viewBox, d } = BLOB_SHAPES[blob];
  const [x1, y1, x2, y2] = reversed
    ? ["0%", "100%", "100%", "0%"]
    : ["0%", "0%", "100%", "100%"];
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", height: 80, padding: "0 2.5rem", background: "none", border: "none", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1 }}
    >
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", zIndex: 0, pointerEvents: "none" }} viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={gradientId} x1={x1} y1={y1} x2={x2} y2={y2}>
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        <path d={d} fill={`url(#${gradientId})`} stroke="#12080b" strokeWidth="14" strokeOpacity="0.2" />
      </svg>
      <span style={{ position: "relative", zIndex: 1, fontFamily: "'Aladin', Georgia, serif", fontSize: "1.45rem", color: "#12080b", textTransform: "uppercase", letterSpacing: "0.05em", paddingTop: "4px" }}>
        {children}
      </span>
    </button>
  );
}
