"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../hooks/use-toast";
import axios from "axios";
import { initPranaCore, getPacketBuilder } from "../lib/prana-core/prana_packet_builder";
import { getSignalCapture } from "../lib/prana-core/signals";
import { getStateEngine } from "../lib/prana-core/prana_state_engine";
import monitoringService from "../services/monitoring-service";

// Determine API URL with fallback logic
const getApiUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    console.log('🔧 Using VITE_API_URL from env:', import.meta.env.VITE_API_URL);
    return import.meta.env.VITE_API_URL;
  }
  
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    
    if (host === 'blackhole-workflow.vercel.app' || host.endsWith('.vercel.app')) {
      console.log('🎯 Using Render backend for production');
      return 'https://blackholeworkflow.onrender.com/api';
    } else if (host === 'localhost' || host === '127.0.0.1') {
      console.log('🏠 Using localhost backend API');
      return 'http://localhost:5000/api';
    } else {
      console.log('🏠 Using same-origin API');
      return `${window.location.origin}/api`;
    }
  }
  
  console.warn('⚠️ No API URL configured, using default localhost');
  return 'http://localhost:5000/api';
};

const API_URL = getApiUrl();
console.log('✅ Auth Context API_URL:', API_URL);

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const axiosInstance = axios.create({
    baseURL: API_URL,
    headers: {
      "Content-Type": "application/json",
    },
  });

  // Add token to axiosInstance headers if available
  axiosInstance.interceptors.request.use((config) => {
    const token = localStorage.getItem("WorkflowToken");
    if (token) {
      config.headers["x-auth-token"] = token;
    }
    return config;
  });

  // ── Monitoring lifecycle ──────────────────────────────────────────────────
  const startMonitoring = (currentUser) => {
    if (!currentUser) return;
    try {
      window.PRANA_DISABLED = false;
      window.__EMS_API_BASE = API_URL; // used by ems-signal-collector.js
      const pranaResult = initPranaCore({
        system_type: 'ems',
        role: 'employee',
        user_id: currentUser.id || currentUser.email,
        session_id: localStorage.getItem("WorkflowToken") || 'no-session',
        bucket_endpoint: import.meta.env.VITE_PRANA_URL || import.meta.env.VITE_PRANA_BUCKET_URL || 'http://localhost:8103/prana/ingest'
      });

      // Expose PRANA internals on window so monitoring-service can read them
      window.__pranaSignalCapture = getSignalCapture();
      window.__pranaStateEngine = getStateEngine();
      window.__pranaPacketBuilder = pranaResult?.packetBuilder || getPacketBuilder();

      const token = localStorage.getItem("WorkflowToken");
      monitoringService.start(currentUser, token, API_URL);
      console.log('✅ Monitoring started for:', currentUser.email);
    } catch (err) {
      console.error('❌ Failed to start monitoring:', err);
    }
  };

  const stopMonitoring = () => {
    try {
      monitoringService.stop();
      const builder = getPacketBuilder();
      if (builder) builder.destroy();
      window.PRANA_DISABLED = true;
      window.__pranaSignalCapture = null;
      window.__pranaStateEngine = null;
      window.__pranaPacketBuilder = null;
      console.log('🛑 Monitoring stopped');
    } catch (err) {
      console.error('❌ Failed to stop monitoring:', err);
    }
  };

    // On mount: check active Pravesh (blackhole_auth) SSO session first so the
  // currently signed-in user opens (not a stale localStorage session from a prior user).
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1. Try Pravesh SSO cookie exchange
      try {
        const response = await fetch(`${API_URL}/pravesh/exchange`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });

        if (response.ok) {
          const data = await response.json().catch(() => null);
          if (!cancelled && data?.success && data.access_token && data.user) {
            localStorage.setItem("WorkflowToken", data.access_token);
            localStorage.setItem("WorkflowUser", JSON.stringify(data.user));
            setUser(data.user);
            startMonitoring(data.user);
            setLoading(false);
            console.log(
              "✅ AuthContext: Pravesh SSO auto-login as",
              data.user.email,
              data.user.role
            );
            return;
          }
        }
      } catch (error) {
        // Pravesh bridge offline or no Blackhole session
      }

      // 2. Fallback to existing localStorage session when Pravesh is not active
      const storedUser = localStorage.getItem("WorkflowUser");
      const storedToken = localStorage.getItem("WorkflowToken");
      if (storedUser && storedToken) {
        try {
          const parsedUser = JSON.parse(storedUser);
          if (!cancelled) {
            setUser(parsedUser);
            startMonitoring(parsedUser);
          }
        } catch (error) {
          console.error("Error parsing stored user:", error);
          localStorage.removeItem("WorkflowUser");
        }
      }

      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const register = async (userData) => {
    setActionLoading(true);
  
    const filteredUserData = { ...userData };
    if (filteredUserData.role === "Admin" || filteredUserData.role === "Manager") {
      delete filteredUserData.department;
    }
  
    try {
      console.log("userData while register", filteredUserData);
      const response = await axiosInstance.post("/auth/register", filteredUserData);
      const { token, user } = response.data;
  
      localStorage.setItem("WorkflowToken", token);
      localStorage.setItem("WorkflowUser", JSON.stringify(user));
      setUser(user);
      startMonitoring(user);
  
      toast({
        title: "Registration successful",
        description: "Your account has been created successfully.",
        variant: "success",
      });
  
      navigate(
        user.role === "User" ? "/userdashboard" :
        user.role === "Tester" ? "/tester-dashboard" :
        "/dashboard"
      );
    } catch (error) {
      toast({
        title: "Registration failed",
        description: error.response?.data?.message || error.response?.data?.error || error.message,
        variant: "destructive",
      });
      console.error("Registration error:", error);
      throw error;
    } finally {
      setActionLoading(false);
    }
  };

  const login = async (credentials) => {
    setActionLoading(true);
    try {
      const response = await axiosInstance.post("/auth/login", credentials);
      const { token, user } = response.data;

      console.log("user after login", user);
      localStorage.setItem("WorkflowToken", token);
      localStorage.setItem("WorkflowUser", JSON.stringify(user));

      setUser(user);
      startMonitoring(user);

      toast({
        title: "Login successful",
        description: "Welcome back!",
        variant: "success",
      });

      navigate(
        user.role === "User" ? "/userdashboard" :
        user.role === "Tester" ? "/tester-dashboard" :
        "/dashboard"
      );
    } catch (error) {
      toast({
        title: "Login failed",
        description: error.response?.data?.message || error.response?.data?.error || error.message,
        variant: "destructive",
      });
      console.error("Login error:", error);
      throw error;
    } finally {
      setActionLoading(false);
    }
  };

  const logout = async () => {
    stopMonitoring();
    // Send logout signal BEFORE clearing token so authMiddleware can read it
    try {
      await axiosInstance.post("/auth/logout");
    } catch (_) {}
    // End the Pravesh SSO session too: the httpOnly blackhole_token cookie
    // outlives localStorage and the boot exchange would sign the user right
    // back in on the next page load.
    try {
      await fetch(`${API_URL}/pravesh/logout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch (_) {
      // Bridge offline — local sign-out still proceeds
    }
    setUser(null);
    localStorage.removeItem("WorkflowToken");
    localStorage.removeItem("WorkflowUser");
    navigate("/login");
    toast({
      title: "Logged out",
      description: "You have been logged out successfully.",
    });
  };

  const getToken = () => localStorage.getItem("WorkflowToken");

  return (
    <AuthContext.Provider value={{ user, loading, actionLoading, login, register, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
