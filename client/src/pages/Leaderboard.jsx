import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { formatDate } from "../lib/dateFormat";
import { isTaskCompleted } from "../lib/taskStatus";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { useToast } from "../hooks/use-toast";
import { Trophy, Medal, Award } from "lucide-react";

const Leaderboard = () => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetails, setUserDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("active");
  const { toast } = useToast();

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      setIsLoading(true);
      const data = await api.dashboard.getLeaderboard();
      setLeaderboard(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load leaderboard data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserDetails = async (userId) => {
    try {
      const [user, tasks, submissions] = await Promise.all([
        api.users.getUser(userId),
        api.users.getUserTasks(userId),
        api.get(`/users/${userId}/submissions`).catch(() => []),
      ]);

      const completedTasks = tasks.filter((task) => isTaskCompleted(task));
      const pendingTasks = tasks.filter((task) => !isTaskCompleted(task));

      setUserDetails({
        ...user,
        completedTasks,
        pendingTasks,
        submissions: Array.isArray(submissions) ? submissions : [],
        totalTasks: tasks.length,
        completionRate: tasks.length > 0 ? (completedTasks.length / tasks.length) * 100 : 0,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load user details",
        variant: "destructive",
      });
    }
  };

  const handleUserClick = (user) => {
    setSelectedUser(user);
    setUserDetails(null);
    fetchUserDetails(user._id);
  };

  const getRankBadge = (index) => {
    switch (index) {
      case 0:
        return <Trophy className="h-6 w-6 text-yellow-400" />;
      case 1:
        return <Medal className="h-6 w-6 text-gray-400" />;
      case 2:
        return <Award className="h-6 w-6 text-yellow-600" />;
      default:
        return <span className="text-lg font-bold">{index + 1}</span>;
    }
  };

  const activeUsers = leaderboard.filter((u) => u.stillExist === 1);
  const exitedUsers = leaderboard.filter((u) => u.stillExist === 0);

  const filteredLeaderboard = leaderboard.filter((u) => {
    if (activeTab === "active") return u.stillExist === 1;
    if (activeTab === "exited") return u.stillExist === 0;
    return true;
  });

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <CardTitle>Task Completion Leaderboard</CardTitle>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="p-1 border border-border/40">
              <TabsTrigger
                value="active"
                className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white dark:data-[state=active]:bg-emerald-500 dark:data-[state=active]:text-zinc-950 font-semibold transition-colors"
              >
                Active Users ({activeUsers.length})
              </TabsTrigger>
              <TabsTrigger
                value="exited"
                className="data-[state=active]:bg-red-600 data-[state=active]:text-white dark:data-[state=active]:bg-red-500 dark:data-[state=active]:text-zinc-950 font-semibold transition-colors"
              >
                Exited Users ({exitedUsers.length})
              </TabsTrigger>
              <TabsTrigger
                value="all"
                className="data-[state=active]:bg-blue-600 data-[state=active]:text-white dark:data-[state=active]:bg-blue-500 dark:data-[state=active]:text-zinc-950 font-semibold transition-colors"
              >
                All Users ({leaderboard.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div>Loading...</div>
          ) : filteredLeaderboard.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No users found matching this status tab.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Completed Tasks</TableHead>
                  <TableHead>Workload</TableHead>
                  <TableHead>Dependencies</TableHead>
                  <TableHead>Completion Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeaderboard.map((user, index) => (
                  <TableRow
                    key={user._id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleUserClick(user)}
                  >
                    <TableCell>{getRankBadge(index)}</TableCell>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>{user.department?.name || "N/A"}</TableCell>
                    <TableCell>
                      {user.stillExist === 0 ? (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800">
                          Exited
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{user.completedTasks}</TableCell>
                    <TableCell>
                      <Badge variant={user.workload > 5 ? "destructive" : "default"}>
                        {user.workload} tasks
                      </Badge>
                    </TableCell>
                    <TableCell>{user.totalDependencies}</TableCell>
                    <TableCell>{user.completionRate.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}  className="dialog-overlay">
        <DialogContent  className="dialog-content sm:max-w-[525px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>User Details: {selectedUser?.name}</DialogTitle>
          </DialogHeader>
          {userDetails ? (
            <div className="grid gap-6">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Profile Information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p><strong>Email:</strong> {userDetails.email}</p>
                    <p><strong>Role:</strong> {userDetails.role}</p>
                    <p><strong>Department:</strong> {userDetails.department?.name || "N/A"}</p>
                    <p><strong>Total Tasks:</strong> {userDetails.totalTasks}</p>
                    <p><strong>Completion Rate:</strong> {userDetails.completionRate.toFixed(1)}%</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Performance Metrics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p><strong>Completed Tasks:</strong> {userDetails.completedTasks.length}</p>
                    <p><strong>Pending Tasks:</strong> {userDetails.pendingTasks.length}</p>
                    <p><strong>Submissions:</strong> {userDetails.submissions.length}</p>
                    <p>
                      <strong>Average Task Completion Time:</strong>{" "}
                      {userDetails.completedTasks.length > 0
                        ? `${(
                            userDetails.completedTasks.reduce(
                              (sum, task) =>
                                sum +
                                (new Date(task.updatedAt) - new Date(task.createdAt)) /
                                  (1000 * 60 * 60 * 24),
                              0
                            ) / userDetails.completedTasks.length
                          ).toFixed(1)} days`
                        : "N/A"}
                    </p>
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Completed Tasks</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Dependencies</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {userDetails.completedTasks.map((task) => (
                        <TableRow key={task._id}>
                          <TableCell>{task.title}</TableCell>
                          <TableCell>{task.department?.name || "N/A"}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                task.priority === "High"
                                  ? "destructive"
                                  : task.priority === "Medium"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {task.priority}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {formatDate(task.dueDate)}
                          </TableCell>
                          <TableCell>{task.dependencies.length}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div>Loading user details...</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Leaderboard;
