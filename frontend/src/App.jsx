/**
 * App.jsx
 * Main application component with routing
 * Updated with Glass Wall system
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { GuestSessionProvider } from './context/GuestSessionContext';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { VerifyPage } from './pages/VerifyPage';
import { SuccessPage } from './pages/SuccessPage';
import { PaymentSuccessPage } from './pages/PaymentSuccessPage';

function App() {
  return (
    <AuthProvider>
      <GuestSessionProvider>
        <Router>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/verify" element={<VerifyPage />} />
            <Route path="/success" element={<SuccessPage />} />
            <Route path="/payment-success" element={<PaymentSuccessPage />} />
          </Routes>
        </Router>
      </GuestSessionProvider>
    </AuthProvider>
  );
}

export default App;
