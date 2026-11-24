import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './auth-context';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

// Alias for backward compatibility
export const useSocketContext = useSocket;

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [attendanceUpdates, setAttendanceUpdates] = useState([]);
  const [aimUpdates, setAimUpdates] = useState([]);
  const [progressUpdates, setProgressUpdates] = useState([]);
  const [monitoringAlerts, setMonitoringAlerts] = useState([]);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      // Initialize socket connection
      const apiBase = import.meta.env.VITE_API_URL?.replace('/api', '') || (typeof window !== 'undefined' ? window.location.origin : '');
      const socketUrl = apiBase || undefined; // undefined lets socket.io connect to current origin at runtime
      const socketInstance = io(socketUrl, {
        transports: ['websocket', 'polling'],
        timeout: 20000,
        forceNew: true,
      });

      // Connection event handlers
      socketInstance.on('connect', () => {
        console.log('✅ Socket connected:', socketInstance.id);
        setConnected(true);
        
        // Join user-specific rooms
        socketInstance.emit('join', [`user_${user.id}`, `department_${user.department}`]);
      });

      socketInstance.on('disconnect', (reason) => {
        console.log('❌ Socket disconnected:', reason);
        setConnected(false);
      });

      socketInstance.on('connect_error', (error) => {
        console.error('🔌 Socket connection error:', error);
        setConnected(false);
      });

      // Attendance event handlers
      socketInstance.on('attendance:day-started', (data) => {
        console.log('📅 Day started event:', data);
        setAttendanceUpdates(prev => [...prev, { type: 'day-started', data, timestamp: Date.now() }]);
        
        // Trigger page refresh for attendance components
        window.dispatchEvent(new CustomEvent('attendance-updated', { detail: data }));
      });

      socketInstance.on('attendance:day-ended', (data) => {
        console.log('🏁 Day ended event:', data);
        setAttendanceUpdates(prev => [...prev, { type: 'day-ended', data, timestamp: Date.now() }]);
        
        // Trigger page refresh for attendance components
        window.dispatchEvent(new CustomEvent('attendance-updated', { detail: data }));
      });

      socketInstance.on('attendance:auto-day-ended', (data) => {
        console.log('⏰ Auto day ended event:', data);
        setAttendanceUpdates(prev => [...prev, { type: 'auto-day-ended', data, timestamp: Date.now() }]);
        
        // Trigger page refresh for attendance components
        window.dispatchEvent(new CustomEvent('attendance-updated', { detail: data }));
      });

      // Monitoring V2 event handlers (Milestone 3 - F10, F12, F13)
      socketInstance.on('monitoring:session-state', (data) => {
        console.log('🔄 Monitoring session state received:', data);
        window.dispatchEvent(new CustomEvent('monitoring-session-state', { detail: data }));
      });

      socketInstance.on('monitoring:session-ended', (data) => {
        console.log('🛑 Monitoring session ended received:', data);
        window.dispatchEvent(new CustomEvent('monitoring-session-ended', { detail: data }));
        window.dispatchEvent(new CustomEvent('attendance-updated', { detail: data }));
      });

      // Aim event handlers
      socketInstance.on('aim-updated', (data) => {
        console.log('🎯 Aim updated event:', data);
        setAimUpdates(prev => [...prev, { type: 'updated', data, timestamp: Date.now() }]);
        
        // Trigger page refresh for aim components
        window.dispatchEvent(new CustomEvent('aim-updated', { detail: data }));
      });

      socketInstance.on('aim-deleted', (data) => {
        console.log('🗑️ Aim deleted event:', data);
        setAimUpdates(prev => [...prev, { type: 'deleted', data, timestamp: Date.now() }]);
        
        // Trigger page refresh for aim components
        window.dispatchEvent(new CustomEvent('aim-deleted', { detail: data }));
      });

      // Progress event handlers
      socketInstance.on('progress-updated', (data) => {
        console.log('📈 Progress updated event:', data);
        setProgressUpdates(prev => [...prev, { type: 'updated', data, timestamp: Date.now() }]);
        
        // Trigger page refresh for progress components
        window.dispatchEvent(new CustomEvent('progress-updated', { detail: data }));
      });

      // Task event handlers
      socketInstance.on('task-updated', (data) => {
        console.log('📋 Task updated event:', data);
        
        // Trigger page refresh for task components
        window.dispatchEvent(new CustomEvent('task-updated', { detail: data }));
      });

      socketInstance.on('monitoring-alert', (data) => {
        console.log('🚨 Monitoring alert event:', data);
        setMonitoringAlerts(prev => [...prev, { type: 'new-alert', data, timestamp: Date.now() }]);
      });

      socketInstance.on('trinetra:screenshot:new', (data) => {
        console.log('📸 TRINETRA screenshot:', data);
        window.dispatchEvent(new CustomEvent('trinetra-screenshot-new', { detail: data }));
      });

      // Parikshak review-complete handler
      socketInstance.on('parikshak:review-complete', (data) => {
        console.log('🤖 Parikshak review complete:', data);
        window.dispatchEvent(new CustomEvent('parikshak:review-complete', { detail: data }));
      });

      setSocket(socketInstance);

      // Cleanup on unmount
      return () => {
        console.log('🧹 Cleaning up socket connection');
        socketInstance.disconnect();
        setSocket(null);
        setConnected(false);
      };
    }
  }, [user]);

  // Helper functions
  const emitEvent = (eventName, data) => {
    if (socket && connected) {
      socket.emit(eventName, data);
    } else {
      console.warn('Socket not connected, cannot emit event:', eventName);
    }
  };

  const joinRoom = (room) => {
    if (socket && connected) {
      socket.emit('join', [room]);
    }
  };

  const leaveRoom = (room) => {
    if (socket && connected) {
      socket.emit('leave', room);
    }
  };

  // Clear old updates (keep only last 50)
  useEffect(() => {
    const cleanup = () => {
      setAttendanceUpdates(prev => prev.slice(-50));
      setAimUpdates(prev => prev.slice(-50));
      setProgressUpdates(prev => prev.slice(-50));
    };

    const interval = setInterval(cleanup, 60000); // Clean every minute
    return () => clearInterval(interval);
  }, []);

  const value = {
    socket,
    connected,
    attendanceUpdates,
    aimUpdates,
    progressUpdates,
    monitoringAlerts,
    emitEvent,
    joinRoom,
    leaveRoom,
    // For backward compatibility with existing components
    events: [...attendanceUpdates, ...aimUpdates, ...progressUpdates].sort((a, b) => b.timestamp - a.timestamp),
    // Helper to get latest update of a specific type
    getLatestUpdate: (type, category) => {
      const updates = category === 'attendance' ? attendanceUpdates :
                     category === 'aim' ? aimUpdates :
                     category === 'progress' ? progressUpdates : [];
      
      return updates.filter(update => update.type === type).pop();
    },
    // Clear updates
    clearUpdates: (category) => {
      if (category === 'attendance') setAttendanceUpdates([]);
      else if (category === 'aim') setAimUpdates([]);
      else if (category === 'progress') setProgressUpdates([]);
    }
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};