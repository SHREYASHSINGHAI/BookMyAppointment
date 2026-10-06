import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';

// Layout
import Layout from './components/Layout';
import AuthGuard from './components/AuthGuard';

// Pages
import HomePage from './pages/HomePage';
import FeaturesPage from './pages/FeaturesPage';
import PricingPage from './pages/PricingPage';
import SignupPage from './pages/SignupPage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import QueriesPage from './pages/QueriesPage';
import StatusPage from './pages/StatusPage';
import OnboardingPage from './pages/OnboardingPage';
import AdminLoginPage from './pages/AdminLoginPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AdminReportsPage from './pages/AdminReportsPage';
import ChatPage from './pages/ChatPage';

function App() {
  return (
    <Router>
      <Routes>
        {/* Marketing Pages with Layout */}
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/pricing" element={<PricingPage />} />
        </Route>

        {/* Auth Pages (No shared marketing layout) */}
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/login" element={<LoginPage />} />

        {/* Protected Dashboard Routes — redirect to /login if not authenticated */}
        <Route element={<AuthGuard />}>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/queries" element={<QueriesPage />} />
          <Route path="/status" element={<StatusPage />} />
        </Route>

        {/* Developer Admin Routes */}
        <Route path="/admin" element={<AdminLoginPage />} />
        <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
        <Route path="/admin/reports" element={<AdminReportsPage />} />
      </Routes>
    </Router>
  );
}

export default App;