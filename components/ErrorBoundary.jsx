import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Check if error is from browser extension
    if (error?.message?.includes('ethereum') || 
        error?.message?.includes('Cannot redefine property')) {
      console.warn('Browser extension error caught by boundary:', error.message);
      // Don't show error UI for extension conflicts
      return { hasError: false };
    }
    
    // Show error UI for other errors
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Ignore extension errors
    if (error?.message?.includes('ethereum') || 
        error?.message?.includes('Cannot redefine property')) {
      return;
    }
    
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
            <div className="text-red-600 text-6xl mb-4">⚠️</div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">出現錯誤</h1>
            <p className="text-gray-600 mb-4">
              頁面載入時遇到問題，請重新整理頁面或聯繫管理員。
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              重新載入
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;