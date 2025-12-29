import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

// Ensure this matches your actual backend URL (or import from constants/config if preferred)
const API_BASE_URL = "https://autoballoon-production.up.railway.app/api";
const TOKEN_KEY = 'autoballoon_token';
const USER_KEY = 'autoballoon_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    const savedUser = localStorage.getItem(USER_KEY);
    
    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const login = useCallback((accessToken, userData) => {
    setToken(accessToken);
    setUser(userData);
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(userData));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    
    // Clear Authentication Data
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    
    // FIX: Clear the "Free/Guest Access" identity keys
    // This prevents the Landing Page from thinking the user is still active
    localStorage.removeItem('autoballoon_user_email'); 
    localStorage.removeItem('autoballoon_download_preference');
  }, []);

  // Implement real user refresh to keep state in sync
  const refreshUser = useCallback(async () => {
    if (!token) return null;
    
    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        const updatedUser = { ...user, ...data };
        setUser(updatedUser);
        localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
        return updatedUser;
      }
    } catch (e) {
      console.error('Failed to refresh user:', e);
    }
    return null;
  }, [token, user]);

  const value = {
    user,
    token,
    isLoading,
    isAuthenticated: !!user,
    isPro: user?.is_pro || false,
    login,
    logout,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
