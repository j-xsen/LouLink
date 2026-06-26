import { lazy, Suspense, useEffect, useState } from "react";
import { createBrowserRouter, Outlet, RouterProvider, useLocation, useSearchParams } from "react-router-dom";
import { AuthProvider, RedirectIfAuthed, RequireProfile, useAuth } from "./auth";
import Home from "./pages/Home";
const Dashboard = lazy(() => import("./pages/Dashboard"));

const CreatePage = lazy(() => import("./pages/CreatePage"));
const SignIn = lazy(() => import("./pages/SignIn"));
const SignUp = lazy(() => import("./pages/SignUp"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Settings = lazy(() => import("./pages/Settings"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const Analytics = lazy(() => import("./pages/Analytics"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));

// ---------------------------------------------------------------------------
// ScrollToTop
// ---------------------------------------------------------------------------

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

// ---------------------------------------------------------------------------
// Index route — renders Dashboard if logged in, Home otherwise
// ---------------------------------------------------------------------------

function IndexRoute() {
  const { loading, session, profile } = useAuth();
  // Show Dashboard only once we've confirmed a logged-in session with a profile.
  // Showing Home during the auth check lets the directory fetch fire immediately
  // rather than waiting for auth to resolve (~500ms on cold load).
  if (!loading && session && profile) return <Dashboard />;
  return <Home />;
}

// ---------------------------------------------------------------------------
// URL error banner — shows ?error= param as a dismissible banner
// ---------------------------------------------------------------------------

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_TOKEN: "This sign-in link is invalid or has already been used.",
  TOKEN_EXPIRED: "This sign-in link has expired. Please request a new one.",
};

function ErrorBanner() {
  const [searchParams, setSearchParams] = useSearchParams();
  const errorCode = searchParams.get("error");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => { setDismissed(false); }, [errorCode]);

  if (!errorCode || dismissed) return null;

  const message = ERROR_MESSAGES[errorCode] ?? "Something went wrong. Please try again.";

  function dismiss() {
    setDismissed(true);
    setSearchParams(p => { p.delete("error"); return p; }, { replace: true });
  }

  return (
    <div style={{ background: "#fee2e2", color: "#991b1b", padding: "0.65rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", fontSize: "0.9rem" }}>
      <span>{message}</span>
      <button onClick={dismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 700, fontSize: "1rem", padding: 0, lineHeight: 1 }}>✕</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root layout — provides auth context and shared chrome
// ---------------------------------------------------------------------------

function Root() {
  return (
    <AuthProvider>
      <ScrollToTop />
      <ErrorBanner />
      <main>
        <Outlet />
      </main>
    </AuthProvider>
  );
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: "/", element: <Suspense><IndexRoute /></Suspense> },
      { path: "/signin", element: <RedirectIfAuthed><Suspense><SignIn /></Suspense></RedirectIfAuthed> },
      { path: "/signup", element: <RedirectIfAuthed><Suspense><SignUp /></Suspense></RedirectIfAuthed> },
      { path: "/forgot-password", element: <RedirectIfAuthed><Suspense><ForgotPassword /></Suspense></RedirectIfAuthed> },
      { path: "/reset-password", element: <Suspense><ResetPassword /></Suspense> },
      { path: "/create", element: <Suspense><CreatePage /></Suspense> },
      { path: "/settings", element: <RequireProfile><Suspense><Settings /></Suspense></RequireProfile> },
      { path: "/analytics", element: <RequireProfile><Suspense><Analytics /></Suspense></RequireProfile> },
      { path: "/admin", element: <Suspense><AdminDashboard /></Suspense> },
      { path: "/:username", element: <Suspense><ProfilePage /></Suspense> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
