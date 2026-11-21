import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Calendar, 
  Clock, 
  FileText, 
  User, 
  Phone, 
  AlertTriangle,
  Upload,
  X,
  Check,
  Send
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Badge } from '../ui/badge';
import { useAuth } from '../../context/auth-context';
import { useToast } from '../../hooks/use-toast';
import api from '../../lib/api';

const LeaveRequestForm = ({ onSuccess, onCancel }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    startDate: '',
    endDate: '',
    leaveType: '',
    reason: '',
    isHalfDay: false,
    emergencyContact: {
      name: '',
      phone: '',
      relationship: ''
    },
    handoverNotes: '',
    priority: 'Medium'
  });
  
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const leaveTypes = [
    { value: 'Sick', label: 'Sick Leave', color: 'bg-red-100 text-red-800' },
    { value: 'Vacation', label: 'Vacation', color: 'bg-blue-100 text-blue-800' },
    { value: 'Personal', label: 'Personal Leave', color: 'bg-green-100 text-green-800' },
    { value: 'Emergency', label: 'Emergency', color: 'bg-orange-100 text-orange-800' },
    { value: 'Maternity', label: 'Maternity Leave', color: 'bg-pink-100 text-pink-800' },
    { value: 'Paternity', label: 'Paternity Leave', color: 'bg-purple-100 text-purple-800' },
    { value: 'Other', label: 'Other', color: 'bg-gray-100 text-gray-800' }
  ];

  const priorityLevels = [
    { value: 'Low', color: 'bg-green-100 text-green-800' },
    { value: 'Medium', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'High', color: 'bg-orange-100 text-orange-800' },
    { value: 'Urgent', color: 'bg-red-100 text-red-800' }
  ];

  const calculateTotalDays = () => {
    if (!formData.startDate || !formData.endDate) return 0;
    
    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    
    return formData.isHalfDay ? 0.5 : diffDays;
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const handleEmergencyContactChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      emergencyContact: {
        ...prev.emergencyContact,
        [field]: value
      }
    }));
  };

  const handleFileUpload = (event) => {
    const files = Array.from(event.target.files);
    const maxSize = 5 * 1024 * 1024; // 5MB
    
    const validFiles = files.filter(file => {
      if (file.size > maxSize) {
        toast({
          title: "File Too Large",
          description: `${file.name} is larger than 5MB`,
          variant: "destructive"
        });
        return false;
      }
      return true;
    });
    
    setDocuments(prev => [...prev, ...validFiles]);
  };

  const removeDocument = (index) => {
    setDocuments(prev => prev.filter((_, i) => i !== index));
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.startDate) newErrors.startDate = 'Start date is required';
    if (!formData.endDate) newErrors.endDate = 'End date is required';
    if (!formData.leaveType) newErrors.leaveType = 'Leave type is required';
    if (!formData.reason.trim()) newErrors.reason = 'Reason is required';
    
    if (formData.startDate && formData.endDate) {
      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);
      if (start > end) {
        newErrors.endDate = 'End date must be after start date';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast({
        title: "Validation Error",
        description: "Please fix the errors in the form",
        variant: "destructive"
      });
      return;
    }
    
    setLoading(true);
    
    try {
      const submitData = new FormData();
      
      // Add form data
      submitData.append('startDate', formData.startDate);
      submitData.append('endDate', formData.endDate);
      submitData.append('leaveType', formData.leaveType);
      submitData.append('reason', formData.reason);
      submitData.append('isHalfDay', formData.isHalfDay);
      submitData.append('totalDays', calculateTotalDays());
      submitData.append('priority', formData.priority);
      submitData.append('handoverNotes', formData.handoverNotes);
      
      // Add emergency contact
      submitData.append('emergencyContact', JSON.stringify(formData.emergencyContact));
      
      // Add documents
      documents.forEach((file, index) => {
        submitData.append(`documents`, file);
      });
      
      const response = await api.post('/leave/request', submitData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      if (response.data.success) {
        toast({
          title: "Leave Request Submitted",
          description: "Your leave request has been submitted for approval",
          variant: "default"
        });
        
        onSuccess?.(response.data.leaveRequest);
      } else {
        throw new Error(response.data.error || 'Failed to submit leave request');
      }
      
    } catch (error) {
      console.error('Error submitting leave request:', error);
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit leave request",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto p-6"
    >
      <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl">
        <CardHeader className="bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-t-lg">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Calendar className="w-6 h-6" />
            Request Leave
          </CardTitle>
          <CardDescription className="text-blue-100">
            Submit a new leave request for approval
          </CardDescription>
        </CardHeader>
        
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Leave Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="startDate" className="text-sm font-medium">
                  Start Date *
                </Label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => handleInputChange('startDate', e.target.value)}
                  className={`bg-white/50 ${errors.startDate ? 'border-red-500' : ''}`}
                  min={new Date().toISOString().split('T')[0]}
                />
                {errors.startDate && (
                  <p className="text-sm text-red-600">{errors.startDate}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="endDate" className="text-sm font-medium">
                  End Date *
                </Label>
                <Input
                  id="endDate"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => handleInputChange('endDate', e.target.value)}
                  className={`bg-white/50 ${errors.endDate ? 'border-red-500' : ''}`}
                  min={formData.startDate || new Date().toISOString().split('T')[0]}
                />
                {errors.endDate && (
                  <p className="text-sm text-red-600">{errors.endDate}</p>
                )}
              </div>
            </div>

            {/* Leave Type and Half Day */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="leaveType" className="text-sm font-medium">
                  Leave Type *
                </Label>
                <Select 
                  value={formData.leaveType} 
                  onValueChange={(value) => handleInputChange('leaveType', value)}
                >
                  <SelectTrigger className={`bg-white/50 ${errors.leaveType ? 'border-red-500' : ''}`}>
                    <SelectValue placeholder="Select leave type" />
                  </SelectTrigger>
                  <SelectContent className="bg-white/95 backdrop-blur-sm">
                    {leaveTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          <Badge className={`text-xs ${type.color}`}>
                            {type.label}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.leaveType && (
                  <p className="text-sm text-red-600">{errors.leaveType}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium">Options</Label>
                <div className="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg">
                  <Checkbox
                    id="halfDay"
                    checked={formData.isHalfDay}
                    onCheckedChange={(checked) => handleInputChange('isHalfDay', checked)}
                  />
                  <Label htmlFor="halfDay" className="text-sm">
                    Half Day Leave
                  </Label>
                </div>
              </div>
            </div>

            {/* Total Days Display */}
            {(formData.startDate && formData.endDate) && (
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-blue-500" />
                  <span className="font-medium text-blue-900">
                    Total Leave Days: {calculateTotalDays()} day(s)
                  </span>
                </div>
              </div>
            )}

            {/* Reason */}
            <div className="space-y-2">
              <Label htmlFor="reason" className="text-sm font-medium">
                Reason for Leave *
              </Label>
              <Textarea
                id="reason"
                placeholder="Please provide a detailed reason for your leave request..."
                value={formData.reason}
                onChange={(e) => handleInputChange('reason', e.target.value)}
                className={`bg-white/50 min-h-[100px] ${errors.reason ? 'border-red-500' : ''}`}
                maxLength={500}
              />
              <div className="flex justify-between items-center">
                {errors.reason && (
                  <p className="text-sm text-red-600">{errors.reason}</p>
                )}
                <p className="text-xs text-gray-500 ml-auto">
                  {formData.reason.length}/500 characters
                </p>
              </div>
            </div>

            {/* Emergency Contact */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Phone className="w-5 h-5 text-blue-500" />
                <h3 className="text-lg font-medium">Emergency Contact</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="emergencyName" className="text-sm font-medium">
                    Contact Name
                  </Label>
                  <Input
                    id="emergencyName"
                    placeholder="Full name"
                    value={formData.emergencyContact.name}
                    onChange={(e) => handleEmergencyContactChange('name', e.target.value)}
                    className="bg-white/50"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="emergencyPhone" className="text-sm font-medium">
                    Phone Number
                  </Label>
                  <Input
                    id="emergencyPhone"
                    placeholder="+1 (555) 123-4567"
                    value={formData.emergencyContact.phone}
                    onChange={(e) => handleEmergencyContactChange('phone', e.target.value)}
                    className="bg-white/50"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="emergencyRelationship" className="text-sm font-medium">
                    Relationship
                  </Label>
                  <Input
                    id="emergencyRelationship"
                    placeholder="e.g., Spouse, Parent"
                    value={formData.emergencyContact.relationship}
                    onChange={(e) => handleEmergencyContactChange('relationship', e.target.value)}
                    className="bg-white/50"
                  />
                </div>
              </div>
            </div>

            {/* Priority and Handover Notes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="priority" className="text-sm font-medium">
                  Priority Level
                </Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) => handleInputChange('priority', value)}
                >
                  <SelectTrigger className="bg-white/50">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent className="bg-white/95 backdrop-blur-sm">
                    {priorityLevels.map((priority) => (
                      <SelectItem key={priority.value} value={priority.value}>
                        <Badge className={`text-xs ${priority.color}`}>
                          {priority.value}
                        </Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="handoverNotes" className="text-sm font-medium">
                  Work Handover Notes
                </Label>
                <Textarea
                  id="handoverNotes"
                  placeholder="Brief notes about work handover or coverage..."
                  value={formData.handoverNotes}
                  onChange={(e) => handleInputChange('handoverNotes', e.target.value)}
                  className="bg-white/50"
                  maxLength={1000}
                />
              </div>
            </div>

            {/* Document Upload */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-500" />
                <h3 className="text-lg font-medium">Supporting Documents</h3>
                <span className="text-sm text-gray-500">(Optional)</span>
              </div>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="document-upload"
                />
                <label htmlFor="document-upload" className="cursor-pointer">
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">
                    Click to upload documents or drag and drop
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    PDF, DOC, DOCX, JPG, PNG (Max 5MB each)
                  </p>
                </label>
              </div>

              {documents.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Uploaded Documents:</h4>
                  {documents.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <span className="text-sm truncate">{file.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDocument(index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Form Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t">
              <Button
                type="submit"
                disabled={loading}
                className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Submit Leave Request
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={loading}
                className="flex-1 sm:flex-none"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default LeaveRequestForm;
