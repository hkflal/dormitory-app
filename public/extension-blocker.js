// Extension conflict prevention script
// This runs before React to prevent crypto wallet extension conflicts

(function() {
  'use strict';
  
  // Store original Object.defineProperty
  const originalDefineProperty = Object.defineProperty;
  
  // Override Object.defineProperty to block ethereum redefinition
  Object.defineProperty = function(obj, prop, descriptor) {
    // Block ethereum property redefinition attempts
    if (prop === 'ethereum' && obj === window && window.hasOwnProperty('ethereum')) {
      console.warn('🚫 Blocked ethereum property redefinition by browser extension');
      return obj;
    }
    
    // Allow all other property definitions
    return originalDefineProperty.call(this, obj, prop, descriptor);
  };
  
  // Global error handler for extension conflicts
  window.addEventListener('error', function(event) {
    if (event.message && (
      event.message.includes('ethereum') ||
      event.message.includes('Cannot redefine property') ||
      event.filename?.includes('chrome-extension://')
    )) {
      console.warn('🛡️ Extension error suppressed:', event.message);
      event.preventDefault();
      event.stopImmediatePropagation();
      return false;
    }
  }, true);
  
  // Handle unhandled promise rejections from extensions
  window.addEventListener('unhandledrejection', function(event) {
    if (event.reason?.message?.includes('ethereum') ||
        event.reason?.stack?.includes('chrome-extension://')) {
      console.warn('🛡️ Extension promise rejection suppressed:', event.reason);
      event.preventDefault();
    }
  });
  
  // Restore original defineProperty when page loads
  window.addEventListener('load', function() {
    setTimeout(() => {
      Object.defineProperty = originalDefineProperty;
      console.log('✅ Extension blocker: Original Object.defineProperty restored');
    }, 1000);
  });
  
  console.log('✅ Extension conflict blocker loaded');
})();