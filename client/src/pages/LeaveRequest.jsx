import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, 
  Plus, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  User,
  FileText,
  Send,
  Filter,
  Download,
  Trash2,
  Edit,
  Eye
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useAuth } from '../context/auth-context';
import { useLeave } from '../hooks/use-leave';
import LeaveForm from '../components/leave/LeaveForm';
import LeaveHistory from '../components/leave/LeaveHistory';
import LeaveCalendar from '../components/leave/LeaveCalendar';
import LeaveStats from '../components/leave/LeaveStats';
import { formatDate } from '../lib/dateFormat';

const LeaveRequest = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('request');
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState(null);

  const {
    leaves,
    leaveStats,
    loading,
    error,
    submitLeaveRequest,
    fetchLeaveHistory,
    cancelLeaveRequest
  } = useLeave();

  useEffect(() => {
    if (user?.id) {
      fetchLeaveHistory();
    }
  }, [user?.id, fetchLeaveHistory]);

  const handleLeaveSubmit = async (leaveData) => {
    const success = await submitLeaveRequest(leaveData);
    if (success) {
      setShowLeaveForm(false);
      fetchLeaveHistory(); // Refresh the list
    }
  };

  const handleCancelLeave = async (leaveId) => {
    const success = await cancelLeaveRequest(leaveId);
    if (success) {
      fetchLeaveHistory(); // Refresh the list
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Approved':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'Rejected':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'Pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Approved':
        return <CheckCircle className="w-4 h-4" />;
      case 'Rejected':
        return <XCircle className="w-4 h-4" />;
      case 'Pending':
        return <Clock className="w-4 h-4" />;
      default:
        return <AlertCircle className="w-4 h-4" />;
    }
  };

  if (loading && !leaves) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-7xl mx-auto space-y-6"
      >
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <motion.h1 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="text-3xl font-bold bg-gradient-to-r from-purple-600 via-pink-600 to-red-600 bg-clip-text text-transparent"
            >
              Leave Management
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="text-gray-600 mt-1"
            >
              Request and manage your leave applications
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            <Button
              onClick={() => setShowLeaveForm(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              <Plus className="w-4 h-4" />
              Request Leave
            </Button>
          </motion.div>
        </div>

        {/* Leave Stats */}
        {leaveStats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <LeaveStats data={leaveStats} />
          </motion.div>
        )}

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:grid-cols-3">
            <TabsTrigger value="request" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              My Requests
            </TabsTrigger>
            <TabsTrigger value="calendar" className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Calendar
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="request" className="space-y-6">
            {/* Recent Leave Requests */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-purple-600" />
                  Recent Leave Requests
                </CardTitle>
                <CardDescription>
                  Your latest leave applications and their status
                </CardDescription>
              </CardHeader>
              <CardContent>
                {leaves && leaves.length > 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-4"
                  >
                    {leaves.slice(0, 5).map((leave, index) => (
                      <motion.div
                        key={leave._id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-full ${getStatusColor(leave.status).replace('text-', 'bg-').replace('border-', '').replace('bg-', 'bg-opacity-20 bg-')}`}>
                            {getStatusIcon(leave.status)}
                          </div>
                          
                          <div>
                            <h3 className="font-medium text-gray-900">
                              {leave.leaveType} Leave
                            </h3>
                            <p className="text-sm text-gray-600">
                              {formatDate(leave.startDate)} - {formatDate(leave.endDate)}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {leave.totalDays} day{leave.totalDays !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <Badge className={getStatusColor(leave.status)}>
                            {leave.status}
                          </Badge>
                          
                          {leave.status === 'Pending' && (
                            <Button
                              onClick={() => handleCancelLeave(leave._id)}
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                          
                          <Button
                            onClick={() => setSelectedLeave(leave)}
                            variant="ghost"
                            size="sm"
                            className="text-gray-600 hover:text-gray-700"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                ) : (
                  <div className="text-center py-8">
                    <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Leave Requests</h3>
                    <p className="text-gray-600 mb-4">You haven't submitted any leave requests yet.</p>
                    <Button
                      onClick={() => setShowLeaveForm(true)}
                      className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Request Your First Leave
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="calendar" className="space-y-6">
            <LeaveCalendar leaves={leaves} />
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <LeaveHistory 
              leaves={leaves} 
              onCancel={handleCancelLeave}
              onView={setSelectedLeave}
            />
          </TabsContent>
        </Tabs>

        {/* Leave Form Modal */}
        <LeaveForm
          isOpen={showLeaveForm}
          onClose={() => setShowLeaveForm(false)}
          onSubmit={handleLeaveSubmit}
        />

        {/* Leave Details Modal */}
        {selectedLeave && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setSelectedLeave(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-lg p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Leave Details</h3>
                <Button
                  onClick={() => setSelectedLeave(null)}
                  variant="ghost"
                  size="sm"
                >
                  <XCircle className="w-4 h-4" />
                </Button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">Leave Type</label>
                  <p className="text-gray-900">{selectedLeave.leaveType}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-600">Duration</label>
                  <p className="text-gray-900">
                    {formatDate(selectedLeave.startDate)} - {formatDate(selectedLeave.endDate)}
                  </p>
                  <p className="text-sm text-gray-600">{selectedLeave.totalDays} day{selectedLeave.totalDays !== 1 ? 's' : ''}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-600">Reason</label>
                  <p className="text-gray-900">{selectedLeave.reason}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-600">Status</label>
                  <Badge className={getStatusColor(selectedLeave.status)}>
                    {selectedLeave.status}
                  </Badge>
                </div>
                
                {selectedLeave.rejectionReason && (
                  <div>
                    <label className="text-sm font-medium text-gray-600">Rejection Reason</label>
                    <p className="text-red-700">{selectedLeave.rejectionReason}</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

export default LeaveRequest;
