import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Target,
  Clock,
  Send,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Loader2,
  Calendar,
  FileText,
  Zap,
  Radio,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Progress } from '../ui/progress';
import { useAuth } from '../../context/auth-context';
import { useToast } from '../../hooks/use-toast';
import api from '../../lib/api';

const SetAimsPanel = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  // State Management
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  
  // Aim form state
  const [aimContent, setAimContent] = useState('');
  const [targetDate, setTargetDate] = useState(new Date().toISOString().split('T')[0]);
  const [priority, setPriority] = useState('medium');
  const [description, setDescription] = useState('');

  // Live attendance stats
  const [liveAttendanceStats, setLiveAttendanceStats] = useState({
    totalUsers: 0,
    activeTracking: 0,
    insideGeofence: 0,
    outsideGeofence: 0,
    violations: 0,
  });

  // Dialog state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showResultsDialog, setShowResultsDialog] = useState(false);
  const [setAimsResults, setSetAimsResults] = useState(null);

  // Fetch users and departments on mount
  useEffect(() => {
    fetchData();
  }, []);

  // Auto-refresh live attendance stats
  useEffect(() => {
    const timer = setInterval(() => {
      fetchLiveAttendanceStats();
    }, 30000); // Refresh every 30 seconds

    return () => clearInterval(timer);
  }, []);

  const fetchData = async () => {
    try {
      setIsFetching(true);
      
      // Fetch users
      const usersResponse = await api.get('/users');
      const usersList = Array.isArray(usersResponse.data) ? usersResponse.data : usersResponse.data?.data || [];
      setUsers(usersList.filter(u => u.role === 'User'));

      // Fetch departments
      const deptResponse = await api.get('/departments');
      const deptList = Array.isArray(deptResponse.data) ? deptResponse.data : deptResponse.data?.data || [];
      setDepartments(deptList);

      // Fetch initial live attendance stats
      await fetchLiveAttendanceStats();
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load users and departments',
        variant: 'destructive',
      });
    } finally {
      setIsFetching(false);
    }
  };

  const fetchLiveAttendanceStats = async () => {
    try {
      const response = await api.get('/attendance/live');
      
      let attendanceRecords = [];
      
      // Handle different response formats
      if (response.data?.success && Array.isArray(response.data.data)) {
        attendanceRecords = response.data.data;
      } else if (Array.isArray(response.data)) {
        attendanceRecords = response.data;
      } else if (response.data?.attendance && Array.isArray(response.data.attendance)) {
        attendanceRecords = response.data.attendance;
      }

      // Filter for today's records
      const todayRecords = attendanceRecords.filter(record => {
        if (!record.date) return true;
        const recordDate = new Date(record.date);
        const today = new Date();
        return recordDate.toDateString() === today.toDateString();
      });

      const stats = {
        totalUsers: todayRecords.length,
        activeTracking: todayRecords.filter(r => r.liveTracking?.enabled).length,
        insideGeofence: todayRecords.filter(r => {
          const lastLoc = r.locationHistory?.[r.locationHistory.length - 1];
          return lastLoc?.insideGeofence;
        }).length,
        outsideGeofence: todayRecords.filter(r => {
          const lastLoc = r.locationHistory?.[r.locationHistory.length - 1];
          return lastLoc && !lastLoc.insideGeofence;
        }).length,
        violations: todayRecords.reduce((sum, r) => sum + (r.geofenceViolations?.length || 0), 0),
      };

      setLiveAttendanceStats(stats);
    } catch (error) {
      console.error('Error fetching live attendance stats:', error);
    }
  };

  const getSelectedUsersList = () => {
    if (selectedUsers.length > 0) {
      return selectedUsers;
    } else if (selectedDepartment !== 'all') {
      return users.filter(u => u.department === selectedDepartment).map(u => u._id);
    } else {
      return users.map(u => u._id);
    }
  };

  const handleSetAims = async () => {
    if (!aimContent.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter aim content',
        variant: 'destructive',
      });
      return;
    }

    const selectedUserIds = getSelectedUsersList();
    if (selectedUserIds.length === 0) {
      toast({
        title: 'Error',
        description: 'Please select at least one user',
        variant: 'destructive',
      });
      return;
    }

    setShowConfirmDialog(true);
  };

  const confirmSetAims = async () => {
    try {
      setIsLoading(true);
      setShowConfirmDialog(false);

      const selectedUserIds = getSelectedUsersList();

      // Step 1: Set aims for all selected users
      console.log('Setting aims for users:', selectedUserIds);
      const aimsResponses = await Promise.allSettled(
        selectedUserIds.map(userId =>
          api.post('/aims', {
            userId,
            aims: aimContent,
            completionStatus: 'Pending',
            completionComment: description || '',
            workLocation: 'Office',
            date: new Date(targetDate).toISOString(),
          })
        )
      );

      const aimsSucceeded = aimsResponses.filter(r => r.status === 'fulfilled').length;
      const aimsFailed = aimsResponses.filter(r => r.status === 'rejected').length;

      console.log(`Aims set - Success: ${aimsSucceeded}, Failed: ${aimsFailed}`);

      // Step 2: Start live attendance tracking for all selected users
      console.log('Starting live attendance for users:', selectedUserIds);
        const trackingResponses = await Promise.allSettled(
          selectedUserIds.map(userId =>
            // No fabricated coordinates: the server enables live tracking and
            // records a real position only when the employee's device reports one.
            api.post(`/attendance/live/start/${userId}`, {})
          )
        );

      const trackingSucceeded = trackingResponses.filter(r => r.status === 'fulfilled').length;
      const trackingFailed = trackingResponses.filter(r => r.status === 'rejected').length;

      console.log(
        `Live attendance started - Success: ${trackingSucceeded}, Failed: ${trackingFailed}`
      );

      // Step 3: Refresh live attendance stats
      await fetchLiveAttendanceStats();

      // Show results
      setSetAimsResults({
        aims: {
          succeeded: aimsSucceeded,
          failed: aimsFailed,
          total: selectedUserIds.length,
        },
        liveTracking: {
          succeeded: trackingSucceeded,
          failed: trackingFailed,
          total: selectedUserIds.length,
        },
      });

      setShowResultsDialog(true);

      // Reset form
      setAimContent('');
      setDescription('');
      setSelectedUsers([]);
      setPriority('medium');

      toast({
        title: 'Success',
        description: `Set aims and started live attendance for ${aimsSucceeded} users`,
        variant: 'default',
      });
    } catch (error) {
      console.error('Error setting aims and tracking:', error);
      toast({
        title: 'Error',
        description: 'Failed to set aims and start live attendance',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleUserSelection = (userId) => {
    setSelectedUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const filteredUsers = selectedDepartment === 'all' 
    ? users 
    : users.filter(u => u.department === selectedDepartment);

  const attentancePercentage = liveAttendanceStats.totalUsers > 0
    ? (liveAttendanceStats.activeTracking / liveAttendanceStats.totalUsers) * 100
    : 0;

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
        >
          <Card className="border-l-4 border-blue-500 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-semibold">Total Users</p>
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                    {liveAttendanceStats.totalUsers}
                  </p>
                </div>
                <Users className="h-8 w-8 text-blue-500 opacity-60" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="border-l-4 border-green-500 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-semibold">Active Tracking</p>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                    {liveAttendanceStats.activeTracking}
                  </p>
                </div>
                <Radio className="h-8 w-8 text-green-500 opacity-60" />
              </div>
              <Progress value={attentancePercentage} className="mt-2 h-1" />
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-l-4 border-emerald-500 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-semibold">Inside Geofence</p>
                  <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                    {liveAttendanceStats.insideGeofence}
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-emerald-500 opacity-60" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-l-4 border-orange-500 bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-semibold">Outside Geofence</p>
                  <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                    {liveAttendanceStats.outsideGeofence}
                  </p>
                </div>
                <AlertCircle className="h-8 w-8 text-orange-500 opacity-60" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="border-l-4 border-red-500 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950 dark:to-red-900">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-semibold">Geofence Violations</p>
                  <p className="text-3xl font-bold text-red-600 dark:text-red-400">
                    {liveAttendanceStats.violations}
                  </p>
                </div>
                <Zap className="h-8 w-8 text-red-500 opacity-60" />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Set Aims Form */}
        <div className="lg:col-span-2">
          <Card className="border-l-4 border-primary shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                Set Daily Aims
              </CardTitle>
              <CardDescription>
                Set aims for employees and automatically start live attendance tracking
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Aim Content */}
              <div className="space-y-2">
                <Label htmlFor="aim-content" className="text-sm font-semibold">
                  Aim/Goal for Today
                </Label>
                <Textarea
                  id="aim-content"
                  placeholder="Enter the daily aim/goal for employees (e.g., 'Complete Q4 project tasks')"
                  value={aimContent}
                  onChange={(e) => setAimContent(e.target.value)}
                  className="min-h-24 resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  {aimContent.length} characters
                </p>
              </div>

              {/* Priority and Target Date */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="priority" className="text-sm font-semibold">
                    Priority
                  </Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger id="priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="target-date" className="text-sm font-semibold">
                    Target Date
                  </Label>
                  <Input
                    id="target-date"
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-semibold">
                  Additional Notes (Optional)
                </Label>
                <Textarea
                  id="description"
                  placeholder="Add any additional notes or instructions..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-16 resize-none"
                />
              </div>

              {/* Set Aim Button */}
              <Button
                onClick={handleSetAims}
                disabled={isLoading || isFetching || !aimContent.trim()}
                className="w-full bg-primary hover:bg-primary/90 text-white"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Setting Aims & Starting Tracking...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Set Aims & Start Live Attendance
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* User Selection */}
        <div>
          <Card className="border-l-4 border-secondary shadow-lg">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-secondary" />
                Select Users
              </CardTitle>
              <CardDescription>
                Choose who receives the aims
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Department Filter */}
              <div className="space-y-2">
                <Label htmlFor="dept-filter" className="text-sm font-semibold">
                  Filter by Department
                </Label>
                <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                  <SelectTrigger id="dept-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map(dept => (
                      <SelectItem key={dept._id} value={dept._id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Select All Users */}
              <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                <input
                  type="checkbox"
                  checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedUsers(filteredUsers.map(u => u._id));
                    } else {
                      setSelectedUsers([]);
                    }
                  }}
                  className="rounded"
                />
                <label className="text-sm font-semibold flex-1 cursor-pointer">
                  Select All ({filteredUsers.length})
                </label>
              </div>

              {/* Users List */}
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {isFetching ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredUsers.length > 0 ? (
                  filteredUsers.map(user => (
                    <motion.div
                      key={user._id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-2 p-2 hover:bg-secondary/10 rounded-lg cursor-pointer transition-colors"
                      onClick={() => toggleUserSelection(user._id)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(user._id)}
                        onChange={() => {}}
                        className="rounded"
                      />
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{user.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {selectedUsers.includes(user._id) ? 'Selected' : 'Not Selected'}
                      </Badge>
                    </motion.div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">No users found</p>
                  </div>
                )}
              </div>

              {/* Selection Summary */}
              <div className="pt-4 border-t">
                <p className="text-sm font-semibold text-foreground">
                  Selected: <span className="text-primary">{selectedUsers.length}</span> of{' '}
                  <span className="text-primary">{filteredUsers.length}</span>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              Confirm Set Aims & Start Tracking
            </DialogTitle>
            <DialogDescription>
              This action will:
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>Set the aim for {getSelectedUsersList().length} users</li>
                <li>Start live attendance tracking for all selected users</li>
                <li>Enable real-time location monitoring</li>
              </ul>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmSetAims}
              disabled={isLoading}
              className="bg-primary hover:bg-primary/90"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Confirm & Start'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Results Dialog */}
      <Dialog open={showResultsDialog} onOpenChange={setShowResultsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Operation Complete
            </DialogTitle>
          </DialogHeader>
          {setAimsResults && (
            <div className="space-y-4">
              {/* Aims Results */}
              <div className="space-y-2">
                <p className="font-semibold flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Aims Set
                </p>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="bg-green-50 dark:bg-green-950 p-2 rounded">
                    <p className="text-xs text-muted-foreground">Success</p>
                    <p className="text-xl font-bold text-green-600">{setAimsResults.aims.succeeded}</p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-950 p-2 rounded">
                    <p className="text-xs text-muted-foreground">Failed</p>
                    <p className="text-xl font-bold text-red-600">{setAimsResults.aims.failed}</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-950 p-2 rounded">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-xl font-bold text-blue-600">{setAimsResults.aims.total}</p>
                  </div>
                </div>
              </div>

              {/* Live Tracking Results */}
              <div className="space-y-2">
                <p className="font-semibold flex items-center gap-2">
                  <Radio className="h-4 w-4" />
                  Live Attendance Tracking
                </p>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="bg-green-50 dark:bg-green-950 p-2 rounded">
                    <p className="text-xs text-muted-foreground">Active</p>
                    <p className="text-xl font-bold text-green-600">
                      {setAimsResults.liveTracking.succeeded}
                    </p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-950 p-2 rounded">
                    <p className="text-xs text-muted-foreground">Failed</p>
                    <p className="text-xl font-bold text-red-600">
                      {setAimsResults.liveTracking.failed}
                    </p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-950 p-2 rounded">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-xl font-bold text-blue-600">
                      {setAimsResults.liveTracking.total}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowResultsDialog(false)} className="w-full">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SetAimsPanel;
