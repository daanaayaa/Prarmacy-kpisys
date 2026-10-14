import { useAuth } from './AuthContext';
import Login from '../pages/Login';

// ครอบทั้งแอป: ยังไม่ล็อกอิน -> หน้า Login, ล็อกอินแล้ว -> แอปเดิมทั้งหมด
export default function AuthGate({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
      </div>
    );
  }
  return user ? children : <Login />;
}