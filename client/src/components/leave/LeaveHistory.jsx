import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Clock, CheckCircle, XCircle, Eye, Trash2, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { formatDate } from '../../lib/dateFormat';

const LeaveHistory = ({ leaves, onCancel, onView }) => {
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date');

  if (!leaves || leaves.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Leave History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Leave History</h3>
            <p className="text-gray-600">Your leave requests will appear here once submitted.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

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
        return <Clock className="w-4 h-4" />;
    }
  };

  // Filter and sort leaves
  const filteredLeaves = leaves
    .filter(leave => filter === 'all' || leave.status === filter)
    .sort((a, b) => {
      if (sortBy === 'date') {
        return new Date(b.startDate) - new Date(a.startDate);
      }
      return a[sortBy]?.localeCompare(b[sortBy]) || 0;
    });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-purple-600" />
            Leave History
          </CardTitle>
          
          <div className="flex items-center gap-3">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-32 bg-white">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Approved">Approved</SelectItem>
                <SelectItem value="Rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-32 bg-white">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="leaveType">Type</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4"
        >
          {filteredLeaves.map((leave, index) => (
            <motion.div
              key={leave._id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className={`p-2 rounded-full ${getStatusColor(leave.status).replace('text-', 'bg-').replace('border-', '').replace('bg-', 'bg-opacity-20 bg-')}`}>
                    {getStatusIcon(leave.status)}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-medium text-gray-900">
                        {leave.leaveType} Leave
                      </h3>
                      <Badge className={getStatusColor(leave.status)}>
                        {leave.status}
                      </Badge>
                      {leave.priority && leave.priority !== 'Medium' && (
                        <Badge variant="outline" className={
                          leave.priority === 'Urgent' ? 'border-red-300 text-red-700' :
                          leave.priority === 'High' ? 'border-orange-300 text-orange-700' :
                          'border-blue-300 text-blue-700'
                        }>
                          {leave.priority}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="space-y-1 text-sm text-gray-600">
                      <div className="flex items-center gap-4">
                        <span>
                          <strong>Duration:</strong> {formatDate(leave.startDate)} - {formatDate(leave.endDate)}
                        </span>
                        <span>
                          <strong>Days:</strong> {leave.totalDays} day{leave.totalDays !== 1 ? 's' : ''}
                        </span>
                      </div>
                      
                      <div>
                        <strong>Reason:</strong> {leave.reason}
                      </div>
                      
                      {leave.rejectionReason && (
                        <div className="text-red-600">
                          <strong>Rejection Reason:</strong> {leave.rejectionReason}
                        </div>
                      )}
                      
                      <div className="text-xs text-gray-500">
                        Submitted on {formatDate(leave.createdAt)}
                        {leave.approvedAt && (
                          <span> • Processed on {formatDate(leave.approvedAt)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => onView(leave)}
                    variant="ghost"
                    size="sm"
                    className="text-gray-600 hover:text-gray-700"
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  
                  {leave.status === 'Pending' && (
                    <Button
                      onClick={() => onCancel(leave._id)}
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {filteredLeaves.length === 0 && (
          <div className="text-center py-8">
            <Filter className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Results</h3>
            <p className="text-gray-600">No leave requests match your current filters.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LeaveHistory;
