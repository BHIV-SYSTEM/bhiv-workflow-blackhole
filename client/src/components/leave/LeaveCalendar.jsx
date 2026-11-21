import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { formatDate } from '../../lib/dateFormat';

const LeaveCalendar = ({ leaves = [] }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const getLeaveForDate = (date) => {
    return leaves.filter(leave => {
      const leaveStart = new Date(leave.startDate);
      const leaveEnd = new Date(leave.endDate);
      const checkDate = new Date(date);
      
      return checkDate >= leaveStart && checkDate <= leaveEnd;
    });
  };

  const navigateMonth = (direction) => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + direction);
      return newDate;
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Approved':
        return 'bg-green-500';
      case 'Rejected':
        return 'bg-red-500';
      case 'Pending':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);
  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Generate calendar days
  const calendarDays = [];
  
  // Empty cells for days before the first day of the month
  for (let i = 0; i < firstDay; i++) {
    calendarDays.push(null);
  }
  
  // Days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-purple-600" />
            Leave Calendar
          </CardTitle>
          
          <div className="flex items-center gap-2">
            <Button
              onClick={() => navigateMonth(-1)}
              variant="outline"
              size="sm"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            
            <span className="text-lg font-medium min-w-[200px] text-center">
              {monthName}
            </span>
            
            <Button
              onClick={() => navigateMonth(1)}
              variant="outline"
              size="sm"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Week day headers */}
            {weekDays.map(day => (
              <div
                key={day}
                className="p-2 text-center text-sm font-medium text-gray-600 border-b"
              >
                {day}
              </div>
            ))}
            
            {/* Calendar days */}
            {calendarDays.map((day, index) => {
              if (!day) {
                return <div key={index} className="p-2 h-20" />;
              }
              
              const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
              const dayLeaves = getLeaveForDate(date);
              const isToday = new Date().toDateString() === date.toDateString();
              
              return (
                <motion.div
                  key={day}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.01 }}
                  className={`p-2 h-20 border border-gray-200 rounded-lg relative ${
                    isToday ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className={`text-sm font-medium ${
                    isToday ? 'text-blue-600' : 'text-gray-900'
                  }`}>
                    {day}
                  </div>
                  
                  {/* Leave indicators */}
                  <div className="mt-1 space-y-1">
                    {dayLeaves.slice(0, 2).map((leave, leaveIndex) => (
                      <motion.div
                        key={leave._id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 + leaveIndex * 0.05 }}
                        className={`w-full h-1.5 rounded-full ${getStatusColor(leave.status)}`}
                        title={`${leave.leaveType} - ${leave.status}`}
                      />
                    ))}
                    
                    {dayLeaves.length > 2 && (
                      <div className="text-xs text-gray-500">
                        +{dayLeaves.length - 2} more
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 pt-4 border-t">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-sm text-gray-600">Approved</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <span className="text-sm text-gray-600">Pending</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <span className="text-sm text-gray-600">Rejected</span>
            </div>
          </div>

          {/* Upcoming Leaves */}
          {leaves.length > 0 && (
            <div className="pt-4 border-t">
              <h4 className="font-medium text-gray-900 mb-3">Upcoming Leaves</h4>
              <div className="space-y-2">
                {leaves
                  .filter(leave => new Date(leave.startDate) >= new Date())
                  .slice(0, 3)
                  .map((leave, index) => (
                    <motion.div
                      key={leave._id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <span className="font-medium text-sm">{leave.leaveType}</span>
                        <span className="text-xs text-gray-600 ml-2">
                          {formatDate(leave.startDate)} - {formatDate(leave.endDate)}
                        </span>
                      </div>
                      <Badge className={
                        leave.status === 'Approved' ? 'bg-green-100 text-green-800' :
                        leave.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }>
                        {leave.status}
                      </Badge>
                    </motion.div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default LeaveCalendar;
