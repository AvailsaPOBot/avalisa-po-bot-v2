import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './hooks/useAuth';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';

import Landing from './pages/Landing';
import FloatingChat from './components/FloatingChat';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AuthCallback from './pages/AuthCallback';
import Dashboard from './pages/Dashboard';
import Pricing from './pages/Pricing';
import Support from './pages/Support';
import Privacy from './pages/Privacy';
import NotFound from './pages/NotFound';
import Webapp from './pages/Webapp';

function AppShell() {
  const location = useLocation();
  const isLanding = location.pathname === '/';

  // Cross-page hash links (e.g. "Webapp Bot" -> /#webapp from /register) load the
  // landing route but React Router does not scroll to the anchor, so the visitor lands
  // at the top of the home page and thinks the link is broken. Scroll to it ourselves;
  // retry briefly because the target section mounts after the route renders.
  // React Router keeps the previous scroll position across route changes, so opening a
  // page from a scrolled one lands the visitor partway down it. Reset to the top unless
  // the URL points at a specific section.
  useEffect(() => {
    if (location.hash) return;
    window.scrollTo(0, 0);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!location.hash) return undefined;
    const id = decodeURIComponent(location.hash.slice(1));
    let frame = 0;
    let timer = null;
    const tryScroll = () => {
      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      frame += 1;
      if (frame < 20) timer = window.setTimeout(tryScroll, 100);
    };
    timer = window.setTimeout(tryScroll, 60);
    return () => { if (timer) window.clearTimeout(timer); };
  }, [location.pathname, location.hash]);

  return (
    <>
      {!isLanding && <Navbar />}
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/support" element={<Support />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/dashboard" element={
          <ProtectedRoute><Dashboard /></ProtectedRoute>
        } />
        <Route path="/webapp" element={<Webapp />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {isLanding && <FloatingChat deferUntilScroll />}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'rgba(10, 10, 15, 0.96)',
              color: '#f5efe4',
              border: '1px solid rgba(216, 162, 74, 0.36)',
              boxShadow: '0 18px 48px rgba(0, 0, 0, 0.42)',
            },
          }}
        />
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}
