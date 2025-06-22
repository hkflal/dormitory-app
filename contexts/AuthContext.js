import { createContext, useContext, useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { auth } from '../lib/firebase';

const AuthContext = createContext({});

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // FIXED: Allow any authenticated user to access the system
  // You can add specific admin emails here if you need role-based access
  const adminEmails = [
    'kazaffong@hkflal.com',
    // Add more admin emails here as needed
    // 'admin2@company.com',
    // 'manager@company.com'
  ];

  const login = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const logout = () => {
    return signOut(auth);
  };

  // OPTION 1: Allow any authenticated user (recommended for internal systems)
  const isAdmin = (user) => {
    return !!user; // Any authenticated user is considered authorized
  };

  // OPTION 2: Use the hardcoded admin list (uncomment if you want strict control)
  // const isAdmin = (user) => {
  //   return user && adminEmails.includes(user.email);
  // };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    login,
    logout,
    isAdmin: isAdmin(currentUser),
    loading,
    adminEmails // Expose admin emails for reference
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}; 