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

  // Role-based email lists
  const adminEmails = [
    'info@hkflal.com',
    'kazaffong@hkflal.com'
  ];

  const editorEmails = [
    'arrivals@hkflal.com',
    'cashlui@hkflal.com'
  ];

  const login = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  const logout = () => {
    return signOut(auth);
  };

  // Get user role based on email
  const getUserRole = (user) => {
    if (!user) return null;
    
    if (adminEmails.includes(user.email)) {
      return 'admin';
    } else if (editorEmails.includes(user.email)) {
      return 'editor';
    }
    
    return null; // Unauthorized user
  };

  // Check if user is admin
  const isAdmin = (user) => {
    return getUserRole(user) === 'admin';
  };

  // Check if user is editor
  const isEditor = (user) => {
    return getUserRole(user) === 'editor';
  };

  // Check if user is authorized (admin or editor)
  const isAuthorized = (user) => {
    const role = getUserRole(user);
    return role === 'admin' || role === 'editor';
  };

  // Check if user can access a specific page
  const canAccessPage = (user, page) => {
    const role = getUserRole(user);
    
    if (role === 'admin') {
      return true; // Admins can access all pages
    }
    
    if (role === 'editor') {
      // Editors can only access invoices and employees pages
      const allowedPages = ['/invoices', '/employees'];
      return allowedPages.includes(page);
    }
    
    return false; // Unauthorized users can't access any pages
  };

  // Get default landing page based on role
  const getDefaultPage = (user) => {
    const role = getUserRole(user);
    
    if (role === 'admin') {
      return '/'; // Admin goes to homepage
    } else if (role === 'editor') {
      return '/invoices'; // Editor goes to invoices page
    }
    
    return '/login'; // Unauthorized users go to login
  };

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
    userRole: getUserRole(currentUser),
    isAdmin: isAdmin(currentUser),
    isEditor: isEditor(currentUser),
    isAuthorized: isAuthorized(currentUser),
    canAccessPage: (page) => canAccessPage(currentUser, page),
    getDefaultPage: () => getDefaultPage(currentUser),
    loading,
    adminEmails,
    editorEmails
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}; 