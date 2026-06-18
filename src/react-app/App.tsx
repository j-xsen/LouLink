import { lazy, Suspense, useEffect } from "react";
import { createBrowserRouter, Outlet, RouterProvider, useLocation } from "react-router-dom";
import { AuthProvider, RedirectIfAuthed, RequireProfile, useAuth } from "./auth";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";

const CreatePage = lazy(() => import("./pages/CreatePage"));
const SignIn = lazy(() => import("./pages/SignIn"));
const SignUp = lazy(() => import("./pages/SignUp"));
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
// Root layout — provides auth context and shared chrome
// ---------------------------------------------------------------------------

function Root() {
  return (
    <AuthProvider>
      <ScrollToTop />
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
      { path: "/", element: <IndexRoute /> },
      { path: "/signin", element: <RedirectIfAuthed><Suspense><SignIn /></Suspense></RedirectIfAuthed> },
      { path: "/signup", element: <RedirectIfAuthed><Suspense><SignUp /></Suspense></RedirectIfAuthed> },
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
