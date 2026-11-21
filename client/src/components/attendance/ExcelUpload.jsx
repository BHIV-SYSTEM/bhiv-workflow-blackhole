import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, 
  File, 
  X, 
  CheckCircle, 
  AlertCircle, 
  Download,
  FileSpreadsheet,
  Loader2,
  Eye,
  Trash2
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { useAttendance } from '../../hooks/use-attendance';
import { toast } from '../../hooks/use-toast';
import { formatDate } from '../../lib/dateFormat';

const ExcelUpload = ({ isOpen, onClose, onUpload }) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const fileInputRef = useRef(null);
  
  const { uploadExcelFile } = useAttendance();

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileSelect = (file) => {
    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];
    
    if (!validTypes.includes(file.type)) {
      toast({
        title: "Invalid File Type",
        description: "Please select an Excel file (.xlsx or .xls)",
        variant: "destructive"
      });
      return;
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "File size must be less than 10MB",
        variant: "destructive"
      });
      return;
    }

    setSelectedFile(file);
    setUploadResult(null);
    
    // Preview file data
    previewExcelFile(file);
  };

  const previewExcelFile = async (file) => {
    try {
      // This is a simplified preview - in a real app you'd parse the Excel file
      const preview = {
        name: file.name,
        size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
        lastModified: formatDate(file.lastModified),
        type: file.type.includes('sheet') ? 'Excel Workbook (.xlsx)' : 'Excel 97-2003 (.xls)',
        estimatedRows: Math.floor(Math.random() * 1000) + 100 // Mock data
      };
      setPreviewData(preview);
    } catch (error) {
      console.error('Preview error:', error);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      const result = await uploadExcelFile(selectedFile, (progress) => {
        setUploadProgress(progress);
      });

      if (result) {
        setUploadResult(result);
        onUpload?.(result);
        
        // Auto-close after successful upload
        setTimeout(() => {
          handleClose();
        }, 3000);
      }
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setUploadProgress(0);
    setUploading(false);
    setUploadResult(null);
    setPreviewData(null);
    setDragActive(false);
    onClose();
  };

  const downloadTemplate = () => {
    // Create a sample CSV template
    const template = [
      ['Employee ID', 'Date', 'Time In', 'Time Out', 'Device ID', 'Location'],
      ['EMP001', '2025-08-07', '09:00', '17:30', 'DEVICE_01', 'Main Office'],
      ['EMP002', '2025-08-07', '09:15', '17:45', 'DEVICE_01', 'Main Office'],
      ['EMP003', '2025-08-07', '08:45', '17:15', 'DEVICE_02', 'Branch Office']
    ];

    const csv = template.map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'attendance-template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-green-600" />
            Upload Attendance Data
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Template Download */}
          <Card className="border-dashed border-2 border-blue-200 bg-blue-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-blue-900">Need a template?</h3>
                  <p className="text-sm text-blue-700">Download our Excel template to get started</p>
                </div>
                <Button
                  onClick={downloadTemplate}
                  variant="outline"
                  size="sm"
                  className="border-blue-300 text-blue-700 hover:bg-blue-100"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Template
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* File Upload Area */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300 ${
              dragActive 
                ? 'border-blue-500 bg-blue-50' 
                : selectedFile 
                  ? 'border-green-500 bg-green-50' 
                  : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => e.target.files[0] && handleFileSelect(e.target.files[0])}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />

            <AnimatePresence mode="wait">
              {selectedFile ? (
                <motion.div
                  key="selected"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="space-y-4"
                >
                  <div className="flex items-center justify-center">
                    <motion.div
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 0.5 }}
                      className="p-3 bg-green-100 rounded-full"
                    >
                      <FileSpreadsheet className="w-8 h-8 text-green-600" />
                    </motion.div>
                  </div>
                  
                  <div>
                    <h3 className="font-medium text-green-900">{selectedFile.name}</h3>
                    <p className="text-sm text-green-700">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>

                  <Button
                    onClick={() => setSelectedFile(null)}
                    variant="outline"
                    size="sm"
                    className="border-red-300 text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Remove
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="space-y-4"
                >
                  <motion.div
                    animate={{ 
                      y: dragActive ? -5 : 0,
                      scale: dragActive ? 1.1 : 1
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="flex items-center justify-center"
                  >
                    <div className={`p-4 rounded-full ${dragActive ? 'bg-blue-100' : 'bg-gray-100'}`}>
                      <Upload className={`w-8 h-8 ${dragActive ? 'text-blue-600' : 'text-gray-600'}`} />
                    </div>
                  </motion.div>
                  
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {dragActive ? 'Drop your file here' : 'Drag & drop your Excel file'}
                    </h3>
                    <p className="text-sm text-gray-600">
                      or click to browse (.xlsx, .xls files only)
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* File Preview */}
          <AnimatePresence>
            {previewData && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Eye className="w-4 h-4" />
                      File Preview
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium">File Type:</span>
                        <p className="text-gray-600">{previewData.type}</p>
                      </div>
                      <div>
                        <span className="font-medium">File Size:</span>
                        <p className="text-gray-600">{previewData.size}</p>
                      </div>
                      <div>
                        <span className="font-medium">Last Modified:</span>
                        <p className="text-gray-600">{previewData.lastModified}</p>
                      </div>
                      <div>
                        <span className="font-medium">Estimated Rows:</span>
                        <p className="text-gray-600">{previewData.estimatedRows}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Upload Progress */}
          <AnimatePresence>
            {uploading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-3"
              >
                <div className="flex items-center justify-between text-sm">
                  <span>Uploading...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Upload Result */}
          <AnimatePresence>
            {uploadResult && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Card className={`border-2 ${uploadResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {uploadResult.success ? (
                        <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                      )}
                      
                      <div className="flex-1">
                        <h3 className={`font-medium ${uploadResult.success ? 'text-green-900' : 'text-red-900'}`}>
                          {uploadResult.success ? 'Upload Successful!' : 'Upload Failed'}
                        </h3>
                        
                        {uploadResult.summary && (
                          <div className="mt-2 space-y-1 text-sm">
                            <div className="flex gap-4">
                              <Badge variant="outline" className="bg-white">
                                Processed: {uploadResult.summary.processed}
                              </Badge>
                              <Badge variant="outline" className="bg-white">
                                Skipped: {uploadResult.summary.skipped}
                              </Badge>
                              {uploadResult.summary.errors > 0 && (
                                <Badge variant="destructive">
                                  Errors: {uploadResult.summary.errors}
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <Button
              onClick={handleClose}
              variant="outline"
              disabled={uploading}
            >
              {uploadResult?.success ? 'Close' : 'Cancel'}
            </Button>
            
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload File
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExcelUpload;
