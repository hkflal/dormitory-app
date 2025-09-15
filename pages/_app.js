import { useRouter } from 'next/router';
import Head from 'next/head';
import { AuthProvider } from '../contexts/AuthContext';
import { DarkModeProvider } from '../contexts/DarkModeContext';
import Layout from '../components/Layout';
import ProtectedRoute from '../components/ProtectedRoute';
import '../styles/globals.css';

function MyApp({ Component, pageProps }) {
  const router = useRouter();
  
  // Pages that don't require authentication
  const publicPages = ['/login'];
  const requiresAuth = !publicPages.includes(router.pathname);

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <AuthProvider>
        <DarkModeProvider>
          {requiresAuth ? (
            <ProtectedRoute>
              <Layout>
                <Component {...pageProps} />
              </Layout>
            </ProtectedRoute>
          ) : (
            <Component {...pageProps} />
          )}
        </DarkModeProvider>
      </AuthProvider>
    </>
  );
}

export default MyApp; 