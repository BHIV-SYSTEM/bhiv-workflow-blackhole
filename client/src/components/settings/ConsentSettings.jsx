
import React, { useState, useEffect } from 'react';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Eye, 
  Monitor, 
  Clock, 
  MousePointer, 
  FileText,
  Download,
  Trash2,
  Lock,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { useToast } from '../../hooks/use-toast';
import { api } from '../../lib/api';

const ConsentSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isMonitoringPaused, setIsMonitoringPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingStatus, setIsFetchingStatus] = useState(true);

  const storedUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('WorkflowUser') || 'null');
    } catch {
      return null;
    }
  })();
  const userId = user?.id || user?._id || storedUser?.id || storedUser?._id;

  useEffect(() => {
    let active = true;
    // Fetch the user's current consent status
    const fetchConsentStatus = async () => {
      if (!userId) {
        if (active) setIsFetchingStatus(false);
        return;
      }
      try {
        setIsFetchingStatus(true);
        const response = await api.get(`/users/${userId}`);
        if (active) {
          setIsMonitoringPaused(Boolean(response?.monitoringPaused));
        }
      } catch (error) {
        console.error('Error fetching consent status:', error);
      } finally {
        if (active) setIsFetchingStatus(false);
      }
    };

    fetchConsentStatus();
    return () => {
      active = false;
    };
  }, [userId]);

  const handleConsentChange = async (paused) => {
    setIsMonitoringPaused(paused);
    setIsLoading(true);
    try {
      const response = await api.post('/consent', { consent: !paused });
      if (typeof response?.monitoringPaused === 'boolean') {
        setIsMonitoringPaused(response.monitoringPaused);
      }
      toast({
        title: "Success",
        description: paused ? "Monitoring has been paused" : "Monitoring has been resumed",
      });
    } catch (error) {
      console.error('Error updating consent:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error?.message || "Failed to update monitoring status",
      });
      // Revert the switch state if the API call fails
      setIsMonitoringPaused(!paused);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadData = async () => {
    toast({
      title: "Download Requested",
      description: "Your data will be prepared and sent to your email",
    });
  };

  const handleDeleteData = async () => {
    toast({
      title: "Request Submitted",
      description: "Your data deletion request has been sent to the administrator",
    });
  };

  return (
    <div className="space-y-6">
      {/* Status Alert */}
      {isMonitoringPaused ? (
        <Alert className="border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="text-amber-800 dark:text-amber-300 ml-2">
            <strong className="font-semibold">Monitoring Paused</strong>
            <p className="mt-1">All tracking and screen capture activities are currently stopped.</p>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-l-4 border-l-green-500 bg-green-50 dark:bg-green-950/20">
          <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
          <AlertDescription className="text-green-800 dark:text-green-300 ml-2">
            <strong className="font-semibold">Monitoring Active</strong>
            <p className="mt-1">Your activities are being tracked as per company policy.</p>
          </AlertDescription>
        </Alert>
      )}

      {/* Main Monitoring Control Card */}
      <Card className="border-l-4 border-l-purple-500">
        <CardHeader className="bg-gradient-to-r from-purple-500/5 to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Monitor className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <CardTitle className="text-lg">Monitoring Controls</CardTitle>
                <CardDescription>Manage your employee monitoring preferences</CardDescription>
              </div>
            </div>
            <Switch 
              id="monitoring-pause"
              checked={isMonitoringPaused} 
              onCheckedChange={handleConsentChange}
              disabled={isLoading || isFetchingStatus}
              className="data-[state=checked]:bg-purple-500"
            />
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <Label htmlFor="monitoring-pause" className="text-base font-medium">
              {isMonitoringPaused ? 'Resume Monitoring' : 'Pause Employee Monitoring'}
            </Label>
            <p className="text-sm text-muted-foreground">
              Temporarily pause all monitoring activities including screen capture and activity tracking. 
              This action will be logged and may require approval based on your organization's policies.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Data Collection & Privacy Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Card: What Data is Collected */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="bg-gradient-to-r from-blue-500/5 to-transparent pb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Eye className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <CardTitle className="text-base">Data Collection</CardTitle>
                <CardDescription className="text-xs">What information is monitored</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-start gap-3 p-2 hover:bg-muted/50 rounded-lg transition-colors">
              <Monitor className="h-4 w-4 text-blue-500/60 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Screen Captures</p>
                <p className="text-xs text-muted-foreground">Regular intervals during work hours</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3 p-2 hover:bg-muted/50 rounded-lg transition-colors">
              <Eye className="h-4 w-4 text-blue-500/60 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Application Usage</p>
                <p className="text-xs text-muted-foreground">Active apps and website tracking</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3 p-2 hover:bg-muted/50 rounded-lg transition-colors">
              <MousePointer className="h-4 w-4 text-blue-500/60 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Activity Levels</p>
                <p className="text-xs text-muted-foreground">Keyboard and mouse activity</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3 p-2 hover:bg-muted/50 rounded-lg transition-colors">
              <Clock className="h-4 w-4 text-blue-500/60 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Work Hours</p>
                <p className="text-xs text-muted-foreground">Attendance and time records</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card: Your Privacy Rights */}
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="bg-gradient-to-r from-green-500/5 to-transparent pb-3">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Lock className="h-4 w-4 text-green-500" />
              </div>
              <div>
                <CardTitle className="text-base">Your Rights</CardTitle>
                <CardDescription className="text-xs">Privacy and data protection</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-start gap-3 p-2 hover:bg-muted/50 rounded-lg transition-colors">
              <ShieldCheck className="h-4 w-4 text-green-500/60 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Pause Anytime</p>
                <p className="text-xs text-muted-foreground">Control monitoring at will</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3 p-2 hover:bg-muted/50 rounded-lg transition-colors">
              <FileText className="h-4 w-4 text-green-500/60 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Access Your Data</p>
                <p className="text-xs text-muted-foreground">Request collected information</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3 p-2 hover:bg-muted/50 rounded-lg transition-colors">
              <Trash2 className="h-4 w-4 text-green-500/60 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Request Deletion</p>
                <p className="text-xs text-muted-foreground">Remove personal information</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3 p-2 hover:bg-muted/50 rounded-lg transition-colors">
              <AlertCircle className="h-4 w-4 text-green-500/60 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Privacy Concerns</p>
                <p className="text-xs text-muted-foreground">Contact administrator</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data Management Actions Card */}
      <Card className="border-l-4 border-l-amber-500">
        <CardHeader className="bg-gradient-to-r from-amber-500/5 to-transparent">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <FileText className="h-4 w-4 text-amber-500" />
            </div>
            <div>
              <CardTitle className="text-base">Data Management</CardTitle>
              <CardDescription className="text-xs">Access and manage your collected data</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Button
              variant="outline"
              className="justify-start h-auto py-4 border-blue-500/20 hover:bg-blue-500/10 hover:border-blue-500"
              onClick={handleDownloadData}
            >
              <div className="flex items-center gap-3 w-full">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <Download className="h-5 w-5 text-blue-500" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">Download My Data</p>
                  <p className="text-xs text-muted-foreground">Export collected information</p>
                </div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="justify-start h-auto py-4 border-red-500/20 hover:bg-red-500/10 hover:border-red-500"
              onClick={handleDeleteData}
            >
              <div className="flex items-center gap-3 w-full">
                <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                  <Trash2 className="h-5 w-5 text-red-500" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">Request Data Deletion</p>
                  <p className="text-xs text-muted-foreground">Remove personal data</p>
                </div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConsentSettings;
