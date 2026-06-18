import { useEffect } from "react";
import { createBrowserRouter, Outlet, RouterProvider, useLocation } from "react-router-dom";
import { AuthProvider, RedirectIfAuthed, RequireProfile, useAuth } from "./auth";
import Home from "./pages/Home";
import CreatePage from "./pages/CreatePage";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import ProfilePage from "./pages/ProfilePage";
import Analytics from "./pages/Analytics";
import AdminDashboard from "./pages/AdminDashboard";

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
  if (loading) return <p>Loading…</p>;
  if (session && profile) return <Dashboard />;
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
      { path: "/signin", element: <RedirectIfAuthed><SignIn /></RedirectIfAuthed> },
      { path: "/signup", element: <RedirectIfAuthed><SignUp /></RedirectIfAuthed> },
      { path: "/create", element: <CreatePage /> },
      { path: "/settings", element: <RequireProfile><Settings /></RequireProfile> },
      { path: "/analytics", element: <RequireProfile><Analytics /></RequireProfile> },
      { path: "/admin", element: <AdminDashboard /> },
      { path: "/:username", element: <ProfilePage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
