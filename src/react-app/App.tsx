import { useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, RedirectIfAuthed, RequireProfile, useAuth } from "./auth";
import Home from "./pages/Home";
import CreatePage from "./pages/CreatePage";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import ProfilePage from "./pages/ProfilePage";

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
// App root
// ---------------------------------------------------------------------------

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<IndexRoute />} />
          <Route path="/signin" element={<RedirectIfAuthed><SignIn /></RedirectIfAuthed>} />
          <Route path="/signup" element={<RedirectIfAuthed><SignUp /></RedirectIfAuthed>} />
          <Route path="/create" element={<CreatePage />} />
          <Route path="/settings" element={<RequireProfile><Settings /></RequireProfile>} />
          <Route path="/:username" element={<ProfilePage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
