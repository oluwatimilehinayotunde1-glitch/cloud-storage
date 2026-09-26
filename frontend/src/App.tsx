import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute, AdminRoute } from './routes/guards';
import AppLayout from './layouts/AppLayout';

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import PublicSharePage from './pages/PublicSharePage';

import DashboardPage from './pages/DashboardPage';
import FilesPage from './pages/FilesPage';
import SharedPage from './pages/SharedPage';
import RecentPage from './pages/RecentPage';
import RecycleBinPage from './pages/RecycleBinPage';
import SecurityPage from './pages/SecurityPage';
import ActivityPage from './pages/ActivityPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';

import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminSecurityPage from './pages/admin/AdminSecurityPage';
import AdminAuditLogsPage from './pages/admin/AdminAuditLogsPage';

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/share/:token" element={<PublicSharePage />} />

      {/* Authenticated */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/files" element={<FilesPage />} />
          <Route path="/files/:id" element={<FilesPage />} />
          <Route path="/folders/:id" element={<FilesPage />} />
          <Route path="/shared" element={<SharedPage />} />
          <Route path="/recent" element={<RecentPage />} />
          <Route path="/recycle-bin" element={<RecycleBinPage />} />
          <Route path="/recovery" element={<RecycleBinPage />} />
          <Route path="/security" element={<SecurityPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />

          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboardPage />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="security" element={<AdminSecurityPage />} />
              <Route path="audit-logs" element={<AdminAuditLogsPage />} />
            </Route>
          </Route>
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
