import { useEffect, useState } from 'react';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

export default function FirebaseTest() {
  const [firebaseStatus, setFirebaseStatus] = useState({
    authInitialized: false,
    dbInitialized: false,
    authStateListener: false,
    error: null
  });

  useEffect(() => {
    try {
      // Test if auth is initialized
      if (auth) {
        setFirebaseStatus(prev => ({ ...prev, authInitialized: true }));
      }

      // Test if firestore is initialized
      if (db) {
        setFirebaseStatus(prev => ({ ...prev, dbInitialized: true }));
      }

      // Test auth state listener
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        setFirebaseStatus(prev => ({ 
          ...prev, 
          authStateListener: true,
          currentUser: user ? { email: user.email, uid: user.uid } : null
        }));
      });

      return unsubscribe;
    } catch (error) {
      setFirebaseStatus(prev => ({ ...prev, error: error.message }));
    }
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>Firebase Connection Test</h1>
      
      <div style={{ backgroundColor: '#f5f5f5', padding: '20px', marginBottom: '20px' }}>
        <h2>Firebase Configuration</h2>
        <p><strong>Project ID:</strong> dormitory-management-6c1a5</p>
        <p><strong>Auth Domain:</strong> dormitory-management-6c1a5.firebaseapp.com</p>
      </div>

      <div style={{ backgroundColor: '#e8f5e8', padding: '20px', marginBottom: '20px' }}>
        <h2>Connection Status</h2>
        <p>✅ Auth Initialized: {firebaseStatus.authInitialized ? 'YES' : 'NO'}</p>
        <p>✅ Firestore Initialized: {firebaseStatus.dbInitialized ? 'YES' : 'NO'}</p>
        <p>✅ Auth State Listener: {firebaseStatus.authStateListener ? 'YES' : 'NO'}</p>
        {firebaseStatus.currentUser && (
          <p>✅ Current User: {firebaseStatus.currentUser.email}</p>
        )}
        {firebaseStatus.error && (
          <p style={{ color: 'red' }}>❌ Error: {firebaseStatus.error}</p>
        )}
      </div>

      <div style={{ backgroundColor: '#fff3cd', padding: '20px' }}>
        <h2>Next Steps</h2>
        <p>If you see errors, please check:</p>
        <ol>
          <li>Firebase Console → Authentication → Sign-in method → Enable Email/Password</li>
          <li>Firebase Console → Firestore Database → Create database</li>
          <li>Google Cloud Console → APIs & Services → Credentials → Check API key restrictions</li>
        </ol>
      </div>

      <div style={{ marginTop: '20px' }}>
        <a href="/login" style={{ padding: '10px 20px', backgroundColor: '#007bff', color: 'white', textDecoration: 'none', borderRadius: '5px' }}>
          Go to Login
        </a>
      </div>
    </div>
  );
} 