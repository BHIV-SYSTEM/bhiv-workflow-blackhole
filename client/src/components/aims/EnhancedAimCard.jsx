import React from 'react';
import { format } from 'date-fns';
import { Clock, MapPin, Target, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';

const EnhancedAimCard = ({ aim }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'Completed':
        return 'bg-green-100 text-green-800';
      case 'MVP Achieved':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getLocationColor = (location) => {
    switch (location) {
      case 'WFH':
        return 'bg-blue-100 text-blue-800';
      case 'Remote':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-green-100 text-green-800';
    }
  };

  const formatTime = (dateString) => {
    if (!dateString) return 'N/A';
    return format(new Date(dateString), 'h:mm a');
  };

  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
      {/* Header with user info and tags */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">
            {aim.user?.name || "Unknown User"}
          </span>
          
          {/* Work Location Tag */}
          <span className={`px-2 py-1 text-xs rounded-full flex items-center gap-1 ${
            getLocationColor(aim.workSessionInfo?.workLocationTag || aim.workLocation)
          }`}>
            <MapPin className="h-3 w-3" />
            {aim.workSessionInfo?.workLocationTag || aim.workLocation || 'Office'}
          </span>
          
          {/* Progress Percentage */}
          {aim.progressPercentage > 0 && (
            <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {aim.progressPercentage}%
            </span>
          )}
          
          {/* Completion Status */}
          <span className={`px-2 py-1 text-xs rounded-full flex items-center gap-1 ${
            getStatusColor(aim.completionStatus)
          }`}>
            {aim.completionStatus === 'Completed' ? (
              <CheckCircle className="h-3 w-3" />
            ) : aim.completionStatus === 'MVP Achieved' ? (
              <Target className="h-3 w-3" />
            ) : (
              <Clock className="h-3 w-3" />
            )}
            {aim.completionStatus}
          </span>
        </div>
        
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Clock className="h-3 w-3" />
          <span>Set at {formatTime(aim.createdAt)}</span>
        </div>
      </div>

      {/* Department info */}
      {aim.department && (
        <div className="text-sm text-gray-600 mb-2">
          <span className="font-medium">Department:</span> {aim.department.name}
        </div>
      )}

      {/* Main aim content */}
      <div className="mb-3">
        <p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">
          {aim.aims}
        </p>
      </div>

      {/* Progress Information */}
      {(aim.progressNotes || aim.achievements || aim.blockers) && (
        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
          <h4 className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Daily Progress
          </h4>
          
          {aim.progressNotes && (
            <div className="mb-2">
              <span className="text-xs font-medium text-gray-600">Notes: </span>
              <span className="text-xs text-gray-700">{aim.progressNotes}</span>
            </div>
          )}
          
          {aim.achievements && (
            <div className="mb-2">
              <span className="text-xs font-medium text-green-600 flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                Achievements: 
              </span>
              <span className="text-xs text-gray-700 ml-1">{aim.achievements}</span>
            </div>
          )}
          
          {aim.blockers && (
            <div>
              <span className="text-xs font-medium text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Blockers: 
              </span>
              <span className="text-xs text-gray-700 ml-1">{aim.blockers}</span>
            </div>
          )}
        </div>
      )}

      {/* Work Session Info */}
      {aim.workSessionInfo && (
        <div className="mt-3 p-3 bg-blue-50 rounded-lg">
          <h4 className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Work Session
          </h4>
          
          <div className="grid grid-cols-2 gap-2 text-xs">
            {aim.workSessionInfo.startDayTime && (
              <div className="flex items-center gap-1">
                <span className="font-medium text-blue-600">Start:</span>
                <span className="text-gray-700">
                  {formatTime(aim.workSessionInfo.startDayTime)}
                </span>
              </div>
            )}
            
            {aim.workSessionInfo.endDayTime && (
              <div className="flex items-center gap-1">
                <span className="font-medium text-blue-600">End:</span>
                <span className="text-gray-700">
                  {formatTime(aim.workSessionInfo.endDayTime)}
                </span>
              </div>
            )}
            
            {aim.workSessionInfo.totalHoursWorked && (
              <div className="col-span-2 flex items-center gap-1">
                <span className="font-medium text-blue-600">Hours Worked:</span>
                <span className="text-gray-700 font-semibold">
                  {aim.workSessionInfo.totalHoursWorked}h
                </span>
                {aim.workSessionInfo.totalHoursWorked >= 8 && (
                  <span className="text-green-600 text-xs">✓ Full Day</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Completion Comment */}
      {aim.completionComment && (
        <div className="mt-3 p-3 bg-green-50 rounded-lg">
          <h4 className="text-xs font-semibold text-green-700 mb-1 flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />
            Completion Comment
          </h4>
          <p className="text-xs text-gray-700 leading-relaxed">
            {aim.completionComment}
          </p>
        </div>
      )}

      {/* Related Data Indicators */}
      <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
        {aim.relatedProgress && (
          <span className="flex items-center gap-1 bg-purple-50 px-2 py-1 rounded">
            <TrendingUp className="h-3 w-3" />
            Progress Linked
          </span>
        )}
        {aim.relatedAttendance && (
          <span className="flex items-center gap-1 bg-blue-50 px-2 py-1 rounded">
            <Clock className="h-3 w-3" />
            Attendance Synced
          </span>
        )}
        {aim.relatedWorkSession && (
          <span className="flex items-center gap-1 bg-green-50 px-2 py-1 rounded">
            <MapPin className="h-3 w-3" />
            Session Active
          </span>
        )}
      </div>
    </div>
  );
};

export default EnhancedAimCard;