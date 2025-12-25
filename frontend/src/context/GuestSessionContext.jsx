/**
 * GuestSessionContext
 * Manages guest session state for the Glass Wall system.
 * Allows users to process drawings without logging in,
 * then captures their data when they try to export.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_BASE_URL } from '../constants/config';

const GuestSessionContext = createContext(null);

const SESSION_ID_KEY = 'autoballoon_guest_session_id';
const SESSION_DATA_KEY = 'autoballoon_guest_session_data';
const SESSION_EXPIRY_KEY = 'autoballoon_guest_session_expiry';

// Generate a unique session ID
function generateSessionId() {
  return 'gs_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
}

// Get or create session ID
function getOrCreateSessionId() {
  let sessionId = localStorage.getItem(SESSION_ID_KEY);
  const expiry = localStorage.getItem(SESSION_EXPIRY_KEY);
  
  // Check if session expired
  if (sessionId && expiry) {
    if (new Date(expiry) < new Date()) {
      // Session expired, clear it
      localStorage.removeItem(SESSION_ID_KEY);
      localStorage.removeItem(SESSION_DATA_KEY);
      localStorage.removeItem(SESSION_EXPIRY_KEY);
      sessionId = null;
    }
  }
  
  if (!sessionId) {
    sessionId = generateSessionId();
    localStorage.setItem(SESSION_ID_KEY, sessionId);
    // Set expiry to 24 hours from now
    const expiryDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    localStorage.setItem(SESSION_EXPIRY_KEY, expiryDate.toISOString());
  }
  
  return sessionId;
}

export function GuestSessionProvider({ children }) {
  const [sessionId] = useState(getOrCreateSessionId);
  const [sessionData, setSessionData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [expiresAt, setExpiresAt] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(null);

  // Load session data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem(SESSION_DATA_KEY);
    const expiry = localStorage.getItem(SESSION_EXPIRY_KEY);
    
    if (savedData) {
      try {
        setSessionData(JSON.parse(savedData));
      } catch (e) {
        console.error('Failed to parse session data:', e);
      }
    }
    
    if (expiry) {
      setExpiresAt(new Date(expiry));
    }
  }, []);

  // Update countdown timer
  useEffect(() => {
    if (!expiresAt) return;

    const updateTimer = () => {
      const now = new Date();
      const diff = expiresAt - now;
      
      if (diff <= 0) {
        setTimeRemaining('Expired');
        return;
      }
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      setTimeRemaining(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    
    return () => clearInterval(interval);
  }, [expiresAt]);

  // Save processing result to guest session
  const saveProcessingResult = useCallback((data) => {
    const sessionResult = {
      filename: data.filename || 'drawing.pdf',
      image: data.image,
      dimensions: data.dimensions || [],
      dimensionCount: data.dimensions?.length || 0,
      grid: data.grid,
      totalPages: data.total_pages || 1,
      pages: data.pages,
      processingTimeMs: data.processing_time_ms || 0,
      estimatedManualHours: calculateManualHours(data.dimensions?.length || 0),
      processedAt: new Date().toISOString(),
    };
    
    setSessionData(sessionResult);
    localStorage.setItem(SESSION_DATA_KEY, JSON.stringify(sessionResult));
    
    // Also save to backend for persistence
    saveToBackend(sessionResult);
    
    return sessionResult;
  }, [sessionId]);

  // Calculate estimated manual hours based on dimension count
  const calculateManualHours = (dimensionCount) => {
    // Rough estimate: 1 minute per dimension manually
    // Plus 10 minutes for setup/export
    const minutes = dimensionCount * 1 + 10;
    return Math.round(minutes / 60 * 10) / 10; // Round to 1 decimal
  };

  // Save session to backend
  const saveToBackend = async (data) => {
    try {
      await fetch(`${API_BASE_URL}/guest-session/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          ...data,
        }),
      });
    } catch (err) {
      console.error('Failed to save session to backend:', err);
      // Continue anyway - we have localStorage backup
    }
  };

  // Capture email at paywall
  const captureEmail = useCallback(async (email) => {
    try {
      await fetch(`${API_BASE_URL}/guest-session/capture-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          email: email,
        }),
      });
      return true;
    } catch (err) {
      console.error('Failed to capture email:', err);
      return false;
    }
  }, [sessionId]);

  // Clear session (after successful payment or manual clear)
  const clearSession = useCallback(() => {
    setSessionData(null);
    localStorage.removeItem(SESSION_DATA_KEY);
    // Keep session ID for tracking
  }, []);

  // Check if session has valid data
  const hasProcessedData = useCallback(() => {
    return sessionData !== null && sessionData.dimensions?.length > 0;
  }, [sessionData]);

  // Processing step simulation (for the "working" animation)
  const simulateProcessing = useCallback(async (actualProcessingPromise) => {
    setIsProcessing(true);
    
    const steps = [
      { text: 'Scanning document...', delay: 800 },
      { text: 'Identifying GD&T frames...', delay: 1200 },
      { text: 'Extracting dimensions...', delay: 1500 },
      { text: 'Mapping grid zones...', delay: 1000 },
      { text: 'Generating AS9102 data...', delay: 1000 },
      { text: 'Finalizing...', delay: 500 },
    ];
    
    // Start showing steps
    let stepIndex = 0;
    const stepInterval = setInterval(() => {
      if (stepIndex < steps.length) {
        setProcessingStep(steps[stepIndex].text);
        stepIndex++;
      }
    }, 1000);
    
    try {
      // Wait for actual processing AND minimum display time
      const [result] = await Promise.all([
        actualProcessingPromise,
        new Promise(resolve => setTimeout(resolve, 6000)), // Minimum 6 seconds
      ]);
      
      clearInterval(stepInterval);
      setProcessingStep('Complete!');
      
      // Brief pause to show "Complete!"
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setIsProcessing(false);
      setProcessingStep('');
      
      return result;
    } catch (err) {
      clearInterval(stepInterval);
      setIsProcessing(false);
      setProcessingStep('');
      throw err;
    }
  }, []);

  const value = {
    sessionId,
    sessionData,
    isProcessing,
    processingStep,
    expiresAt,
    timeRemaining,
    saveProcessingResult,
    captureEmail,
    clearSession,
    hasProcessedData,
    simulateProcessing,
  };

  return (
    <GuestSessionContext.Provider value={value}>
      {children}
    </GuestSessionContext.Provider>
  );
}

export function useGuestSession() {
  const context = useContext(GuestSessionContext);
  if (!context) {
    throw new Error('useGuestSession must be used within a GuestSessionProvider');
  }
  return context;
}
