// ---------------------------------------------------------------------------
// Footer — shared across every page
// ---------------------------------------------------------------------------

import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer style={{ textAlign: "center", padding: "2rem 0 1rem", fontSize: "0.85rem", color: "#888" }}>
      <span>© {new Date().getFullYear()} LouLink</span>
      <span style={{ margin: "0 0.5rem" }}>·</span>
      <Link to="/privacy" style={{ color: "inherit" }}>Privacy Policy</Link>
    </footer>
  );
}
