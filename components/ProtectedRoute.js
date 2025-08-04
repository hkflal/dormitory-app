import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children }) {
  const { currentUser, isAuthorized, canAccessPage, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!currentUser) {
        // Not logged in, redirect to login
        router.push('/login');
      } else if (!isAuthorized) {
        // Logged in but not authorized (not admin or editor), redirect to login
        router.push('/login');
      } else if (!canAccessPage(router.pathname)) {
        // Authorized user trying to access a page they don't have permission for
        // Redirect editors to their default page (invoices)
        router.push('/invoices');
      }
    }
  }, [currentUser, isAuthorized, loading, router, canAccessPage]);

  // Show loading spinner while checking auth state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  // Show nothing while redirecting
  if (!currentUser || !isAuthorized || !canAccessPage(router.pathname)) {
    return null;
  }

  return children;
} 