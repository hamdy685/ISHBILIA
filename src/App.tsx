import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AppErrorBoundary from './components/AppErrorBoundary';
import AppRoutes from './routes/AppRoutes';
import ToastContainer from './components/common/ToastContainer';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppErrorBoundary>
          <AppRoutes />
          <ToastContainer />
        </AppErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
