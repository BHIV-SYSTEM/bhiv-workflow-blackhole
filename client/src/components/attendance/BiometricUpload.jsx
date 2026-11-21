import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, 
  File, 
  CheckCircle, 
  AlertTriangle, 
  X, 
  Download,
  FileSpreadsheet,
  Users,
  Clock,
  Calendar,
  Eye,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import api from '../../lib/api';

const BiometricUpload = ({ isOpen, onClose, onSuccess }) => {
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [step, setStep] = useState('upload'); // upload, preview, analysis, complete

  // Simple toast function
  const showToast = (message, type = 'success') => {
    console.log(`${type.toUpperCase()}: ${message}`);
    // You can replace this with your actual toast implementation
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      setUploadedFile(file);
      setStep('preview');
      processFile(file);
    }
  };

  const processFile = async (file) => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      const response = await api.post('/attendance/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (response.data.success) {
        setPreviewData(response.data.preview);
        setAnalysisResult(response.data.analysis);
        setStep('analysis');
        
        showToast(`File Processed Successfully - Processed ${response.data.analysis?.totalRecords || 0} attendance records`);
      } else {
        throw new Error(response.data.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      showToast(error.message || 'Failed to process the file', 'error');
      setStep('upload');
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirmUpload = async () => {
    try {
      setIsUploading(true);
      
      const response = await api.post('/attendance/confirm-upload', {
        fileId: analysisResult?.fileId,
        applyChanges: true
      });

      if (response.data.success) {
        setStep('complete');
        showToast(`Upload Complete - Successfully imported ${response.data.imported} attendance records`);
        
        setTimeout(() => {
          onSuccess?.(response.data);
          handleClose();
        }, 2000);
      } else {
        throw new Error(response.data.error || 'Failed to confirm upload');
      }
    } catch (error) {
      showToast(error.message || 'Failed to confirm upload', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    setUploadedFile(null);
    setPreviewData(null);
    setAnalysisResult(null);
    setUploadProgress(0);
    setStep('upload');
    setIsUploading(false);
    onClose();
  };

  const downloadTemplate = () => {
    // Create a sample CSV template
    const csvContent = `Employee ID,Date,Time In,Time Out,Device ID,Location
EMP001,2024-01-15,09:00:00,17:30:00,DEVICE_01,Main Gate
EMP002,2024-01-15,09:15:00,17:45:00,DEVICE_01,Main Gate
EMP003,2024-01-15,08:45:00,17:15:00,DEVICE_01,Main Gate`;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'biometric_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-green-600" />
            Biometric Data Upload
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Progress Steps */}
          <div className="flex items-center justify-between">
            {['Upload', 'Preview', 'Analysis', 'Complete'].map((stepName, index) => {
              const stepNumber = index + 1;
              const isActive = 
                (step === 'upload' && stepNumber === 1) ||
                (step === 'preview' && stepNumber === 2) ||
                (step === 'analysis' && stepNumber === 3) ||
                (step === 'complete' && stepNumber === 4);
              const isCompleted = 
                (step === 'preview' && stepNumber === 1) ||
                (step === 'analysis' && stepNumber <= 2) ||
                (step === 'complete' && stepNumber <= 3);

              return (
                <div key={stepName} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    isCompleted ? 'bg-green-500 text-white' :
                    isActive ? 'bg-blue-500 text-white' :
                    'bg-gray-200 text-gray-600'
                  }`}>
                    {isCompleted ? <CheckCircle className="w-4 h-4" /> : stepNumber}
                  </div>
                  <span className={`ml-2 text-sm ${isActive ? 'text-blue-600 font-medium' : 'text-gray-600'}`}>
                    {stepName}
                  </span>
                  {index < 3 && (
                    <div className={`w-12 h-0.5 mx-4 ${
                      isCompleted ? 'bg-green-500' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Upload Step */}
          {step === 'upload' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Upload Biometric Data</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="border-2 border-dashed rounded-lg p-8 text-center border-gray-300 hover:border-gray-400 transition-colors">
                    <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Upload Excel or CSV file
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Select your biometric data file to upload
                    </p>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="file-upload"
                    />
                    <label
                      htmlFor="file-upload"
                      className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Choose File
                    </label>
                    <p className="text-sm text-gray-500 mt-2">
                      Supports .xlsx, .xls, and .csv files (max 10MB)
                    </p>
                  </div>

                  <div className="mt-6 flex justify-center">
                    <Button
                      onClick={downloadTemplate}
                      variant="outline"
                      className="flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Download Template
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Preview Step */}
          {step === 'preview' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <File className="w-5 h-5" />
                    File Processing
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 mb-4">
                    <FileSpreadsheet className="w-8 h-8 text-green-600" />
                    <div className="flex-1">
                      <h3 className="font-medium">{uploadedFile?.name}</h3>
                      <p className="text-sm text-gray-600">
                        {(uploadedFile?.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Processing...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} className="h-2" />
                  </div>

                  {isUploading && (
                    <div className="mt-4 flex items-center gap-2 text-sm text-blue-600">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Analyzing attendance data...
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Analysis Step */}
          {step === 'analysis' && analysisResult && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-6 text-center">
                    <Users className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                    <div className="text-2xl font-bold text-blue-900">
                      {analysisResult.totalEmployees || 0}
                    </div>
                    <div className="text-sm text-gray-600">Employees</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6 text-center">
                    <Calendar className="w-8 h-8 text-green-600 mx-auto mb-2" />
                    <div className="text-2xl font-bold text-green-900">
                      {analysisResult.totalRecords || 0}
                    </div>
                    <div className="text-sm text-gray-600">Records</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6 text-center">
                    <Clock className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                    <div className="text-2xl font-bold text-purple-900">
                      {analysisResult.dateRange || 'N/A'}
                    </div>
                    <div className="text-sm text-gray-600">Date Range</div>
                  </CardContent>
                </Card>
              </div>

              {/* Data Preview */}
              {previewData && previewData.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Data Preview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2">Employee ID</th>
                            <th className="text-left p-2">Date</th>
                            <th className="text-left p-2">Time In</th>
                            <th className="text-left p-2">Time Out</th>
                            <th className="text-left p-2">Hours</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.slice(0, 5).map((record, index) => (
                            <tr key={index} className="border-b">
                              <td className="p-2">{record.employeeId}</td>
                              <td className="p-2">{record.date}</td>
                              <td className="p-2">{record.timeIn}</td>
                              <td className="p-2">{record.timeOut}</td>
                              <td className="p-2">{record.hours}h</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {previewData.length > 5 && (
                      <p className="text-sm text-gray-600 mt-2">
                        Showing 5 of {previewData.length} records
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Validation Results */}
              {analysisResult.validation && (
                <Card>
                  <CardHeader>
                    <CardTitle>Validation Results</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {analysisResult.validation.errors?.length > 0 && (
                        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                          <div>
                            <h4 className="font-medium text-red-900">Errors Found</h4>
                            <ul className="text-sm text-red-700 mt-1">
                              {analysisResult.validation.errors.map((error, index) => (
                                <li key={index}>• {error}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}

                      {analysisResult.validation.warnings?.length > 0 && (
                        <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                          <div>
                            <h4 className="font-medium text-yellow-900">Warnings</h4>
                            <ul className="text-sm text-yellow-700 mt-1">
                              {analysisResult.validation.warnings.map((warning, index) => (
                                <li key={index}>• {warning}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}

                      {(!analysisResult.validation.errors || analysisResult.validation.errors.length === 0) && (
                        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                          <CheckCircle className="w-5 h-5 text-green-600" />
                          <span className="text-green-900 font-medium">All validations passed</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end gap-3">
                <Button onClick={handleClose} variant="outline">
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmUpload}
                  disabled={isUploading || (analysisResult.validation?.errors?.length > 0)}
                  className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Confirm Import
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}

          {/* Complete Step */}
          {step === 'complete' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-8"
            >
              <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Upload Complete!</h3>
              <p className="text-gray-600 mb-6">
                Biometric data has been successfully imported and processed.
              </p>
              <Button onClick={handleClose} className="bg-gradient-to-r from-green-500 to-green-600">
                Close
              </Button>
            </motion.div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BiometricUpload;
