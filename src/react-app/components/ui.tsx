// ---------------------------------------------------------------------------
// Shared UI components
// ---------------------------------------------------------------------------

import { useId } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Move } from "lucide-react";
import { BLOB_SHAPES } from "./blob-shapes";
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

export function PageHeader({ right }: { right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "0.5rem 0 0" }}>
      <div style={{ position: "relative", display: "inline-flex", alignItems: "center", height: 44, flexShrink: 0 }}>
        <img src={shape4} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", objectPosition: "left center", pointerEvents: "none", transform: "translateX(-5px)" }} />
        <Link
          to="/"
          aria-label="Go home"
          style={{ position: "relative", zIndex: 1, background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", color: "#12080b", padding: "0 1.5rem 0 0.55rem", textDecoration: "none" }}
        >
          <ArrowLeft size={26} />
        </Link>
      </div>
      <div style={{ flex: 1, textAlign: "center" }}>
        <Link to="/"><img src={logoFullColor} alt="LouLink" style={{ width: "min(55%, 220px)", height: "auto" }} /></Link>
      </div>
      <div style={{ flexShrink: 0, minWidth: 56, display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
        {right}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ShapeTitle — shape2 blob heading (shared across inner pages)
// ---------------------------------------------------------------------------

export function ShapeTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ textAlign: "center", marginTop: "1.75rem" }}>
      <div style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", height: 68, minWidth: 190 }}>
        <img src={shape2} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", pointerEvents: "none", zIndex: 0 }} />
        <span style={{ position: "relative", zIndex: 1, fontSize: "1.9rem", fontFamily: "'Aladin', Georgia, serif", textTransform: "uppercase", letterSpacing: "0.05em", color: "#12080b", padding: "0 2rem", paddingTop: "5px" }}>
          {children}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BlobButton — organic SVG blob CTA (shared across forms)
// ---------------------------------------------------------------------------

export function DragHandle({ size = 20 }: { size?: number }) {
  return <Move size={size} />;
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
