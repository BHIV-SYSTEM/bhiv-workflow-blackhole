import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target,
  CheckCircle,
  Clock,
  Trophy,
  MessageCircle,
  AlertCircle,
  Loader2,
  X,
  Home,
  Building,
  Star
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import { Alert, AlertDescription } from '../ui/alert';
import { toast } from 'react-hot-toast';
import api from '../../lib/api';

const EnhancedAimCompletionDialog = ({ 
  isOpen, 
  onClose, 
  onAimCompleted, 
  user, 
  todayAim,
  workLocation = 'Office' 
}) => {
  const [loading, setLoading] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [completionComment, setCompletionComment] = useState('');
  const [achievements, setAchievements] = useState('');
  const [blockers, setBlockers] = useState('');
  const [progressPercentage, setProgressPercentage] = useState(50);
  const [errors, setErrors] = useState({});

  // Initialize form with existing aim data
  useEffect(() => {
    if (isOpen && todayAim) {
      setSelectedStatus(todayAim.completionStatus || 'Pending');
      setCompletionComment(todayAim.completionComment || '');
      setAchievements(todayAim.achievements || '');
      setBlockers(todayAim.blockers || '');
      setProgressPercentage(todayAim.progressPercentage || 50);
    }
  }, [isOpen, todayAim]);

  const validateForm = () => {
    const newErrors = {};

    if (!selectedStatus || selectedStatus === 'Pending') {
      newErrors.status = 'Please select a completion status';
    }

    if (selectedStatus !== 'Pending' && (!completionComment || completionComment.trim() === '')) {
      newErrors.comment = 'Completion comment is required for completed aims';
    }

    if (completionComment && completionComment.length > 500) {
      newErrors.comment = 'Comment cannot exceed 500 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);

      const aimData = {
        aims: todayAim?.aims || 'Daily work objectives',
        completionStatus: selectedStatus,
        completionComment: completionComment.trim(),
        workLocation: workLocation,
        achievements: achievements.trim(),
        blockers: blockers.trim(),
        progressPercentage: progressPercentage
      };

      let response;
      if (todayAim?._id) {
        // Update existing aim
        response = await api.put(`/aims/${todayAim._id}`, aimData);
      } else {
        // Create new aim
        response = await api.post(`/aims/postaim/${user.id}`, aimData);
      }

      if (response) {
        toast.success(
          selectedStatus === 'Completed' ? '🎉 Aim marked as completed!' :
          selectedStatus === 'MVP Achieved' ? '🏆 MVP achieved successfully!' :
          '📝 Aim status updated!'
        );
        
        onAimCompleted(response);
        handleClose();
      }
    } catch (error) {
      console.error('Error updating aim:', error);
      toast.error(error.response?.data?.error || 'Failed to update aim');
      
      if (error.response?.data?.error) {
        setErrors({ 
          submit: error.response.data.error 
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedStatus('');
    setCompletionComment('');
    setAchievements('');
    setBlockers('');
    setProgressPercentage(50);
    setErrors({});
    onClose();
  };

  const statusOptions = [
    {
      value: 'Pending',
      label: 'Pending',
      description: 'Still working on the objectives',
      icon: Clock,
      color: 'bg-amber-100 text-amber-700 border-amber-200',
      disabled: false
    },
    {
      value: 'Completed',
      label: 'Completed',
      description: 'All objectives achieved successfully',
      icon: CheckCircle,
      color: 'bg-green-100 text-green-700 border-green-200',
      disabled: false
    },
    {
      value: 'MVP Achieved',
      label: 'MVP Achieved',
      description: 'Minimum viable product/goals completed',
      icon: Trophy,
      color: 'bg-purple-100 text-purple-700 border-purple-200',
      disabled: false
    }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] bg-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-600" />
            Complete Daily Aim
          </DialogTitle>
          <DialogDescription>
            Update your daily aim completion status. This is required before ending your work day.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Work Location Info */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {workLocation === 'Home' ? (
                    <Home className="w-4 h-4 text-green-600" />
                  ) : (
                    <Building className="w-4 h-4 text-blue-600" />
                  )}
                  <span className="text-sm font-medium">Working from {workLocation}</span>
                </div>
                <Badge variant="outline">{workLocation}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Today's Aim Display */}
          {todayAim?.aims && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Today's Objectives</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm bg-gray-50 p-3 rounded-md whitespace-pre-line">
                  {todayAim.aims}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Status Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Completion Status *</label>
            <div className="grid gap-3">
              {statusOptions.map((option) => {
                const IconComponent = option.icon;
                const isSelected = selectedStatus === option.value;
                
                return (
                  <motion.div
                    key={option.value}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Card
                      className={`cursor-pointer transition-all border-2 ${
                        isSelected 
                          ? option.color + ' shadow-md' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedStatus(option.value)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <IconComponent className={`w-5 h-5 ${
                              isSelected ? '' : 'text-gray-500'
                            }`} />
                            <div>
                              <div className="font-semibold text-sm">{option.label}</div>
                              <div className="text-xs text-gray-600">{option.description}</div>
                            </div>
                          </div>
                          {isSelected && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: "spring", stiffness: 500, damping: 30 }}
                            >
                              <CheckCircle className="w-5 h-5 text-green-600" />
                            </motion.div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
            {errors.status && (
              <p className="text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.status}
              </p>
            )}
          </div>

          {/* Progress Percentage */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Overall Progress</label>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Progress Percentage</span>
                <Badge variant="outline">{progressPercentage}%</Badge>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={progressPercentage}
                onChange={(e) => setProgressPercentage(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>

          {/* Mandatory Comment for Completed Status */}
          {selectedStatus !== 'Pending' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3"
            >
              <label className="text-sm font-medium flex items-center gap-2">
                <MessageCircle className="w-4 h-4" />
                Completion Comment *
              </label>
              <Textarea
                value={completionComment}
                onChange={(e) => setCompletionComment(e.target.value)}
                placeholder="Describe what you accomplished today, challenges faced, and key achievements..."
                rows={4}
                maxLength={500}
                className={`resize-none ${errors.comment ? 'border-red-300' : ''}`}
              />
              <div className="flex justify-between items-center text-xs">
                <span className={`${errors.comment ? 'text-red-600' : 'text-gray-500'}`}>
                  {errors.comment || `${completionComment.length}/500 characters`}
                </span>
              </div>
            </motion.div>
          )}

          {/* Achievements (Optional) */}
          <div className="space-y-3">
            <label className="text-sm font-medium flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-500" />
              Key Achievements (Optional)
            </label>
            <Textarea
              value={achievements}
              onChange={(e) => setAchievements(e.target.value)}
              placeholder="Highlight your key accomplishments for today..."
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Blockers (Optional) */}
          <div className="space-y-3">
            <label className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              Blockers/Challenges (Optional)
            </label>
            <Textarea
              value={blockers}
              onChange={(e) => setBlockers(e.target.value)}
              placeholder="Mention any blockers or challenges you faced..."
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Submit Error */}
          {errors.submit && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errors.submit}</AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={loading || !selectedStatus || selectedStatus === 'Pending'}
              className="flex items-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              {loading ? 'Saving...' : 'Complete Aim'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EnhancedAimCompletionDialog;