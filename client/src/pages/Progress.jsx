// import { useState, useEffect } from "react";
// import { useNavigate } from "react-router-dom";
// import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
// import { Button } from "../components/ui/button";
// import { Input } from "../components/ui/input";
// import { Label } from "../components/ui/label";
// import { Textarea } from "../components/ui/textarea";
// import { Slider } from "../components/ui/slider";
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
// import { Loader2, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';
// import { api, API_URL } from "../lib/api";
// import { useToast } from "../hooks/use-toast";
// import { useAuth } from "../context/auth-context";
// import { ProgressChart } from "../components/progress/progress-chart";
// import { ProgressHistory } from "../components/progress/progress-history";
// import { format } from "date-fns";
// import axios from "axios";

// function Progress() {
//   const navigate = useNavigate();
//   const { toast } = useToast();
//   const { user } = useAuth();
//   const [isLoading, setIsLoading] = useState(true);
//   const [tasks, setTasks] = useState([]);
//   const [selectedTask, setSelectedTask] = useState(null);
//   const [progressValue, setProgressValue] = useState(0);
//   const [notes, setNotes] = useState("");
//   const [blockers, setBlockers] = useState("");
//   const [achievements, setAchievements] = useState("");
//   const [progressHistory, setProgressHistory] = useState([]);
//   const [isSubmitting, setIsSubmitting] = useState(false);



//   useEffect(() => {
//     const fetchUserTasks = async () => {
//       try {
//         setIsLoading(true);
//         console.log("user in progress", user.id);
  
//         // Axios request to get tasks by user ID
//         const response = await axios.get(`${API_URL}/users/${user.id}/tasks`);
        
//         const filteredTasks = response.data.filter(task =>
//           ["Pending", "In Progress"].includes(task.status)
//         );
  
//         setTasks(filteredTasks);
  
//         // Select the first task by default if available
//         if (filteredTasks.length > 0) {
//           setSelectedTask(filteredTasks[0]);
//           setProgressValue(filteredTasks[0].progress || 0);
//           fetchProgressHistory(filteredTasks[0]._id);
//         }
//       } catch (error) {
//         console.error("Error fetching tasks:", error);
//         toast({
//           title: "Error",
//           description: "Failed to load your tasks",
//           variant: "destructive",
//         });
//       } finally {
//         setIsLoading(false);
//       }
//     };
  
//     if (user) {
//       fetchUserTasks();
//     }
//   }, [user, toast]);
  

//   const fetchProgressHistory = async (taskId) => {
//     try {
//       const history = await api.progress.getTaskProgress(taskId);
//       setProgressHistory(history);
//     } catch (error) {
//       console.error("Error fetching progress history:", error);
//       toast({
//         title: "Error",
//         description: "Failed to load progress history",
//         variant: "destructive",
//       });
//     }
//   };

//   const handleTaskChange = (taskId) => {
//     const task = tasks.find(t => t._id === taskId);
//     if (task) {
//       setSelectedTask(task);
//       setProgressValue(task.progress || 0);
//       fetchProgressHistory(task._id);
//       // Reset form fields
//       setNotes("");
//       setBlockers("");
//       setAchievements("");
//     }
//   };

//   const handleSubmitProgress = async () => {
//     if (!selectedTask) {
//       toast({
//         title: "Error",
//         description: "Please select a task first",
//         variant: "destructive",
//       });
//       return;
//     }

//     try {
//       setIsSubmitting(true);
      
//       const progressData = {
//         user: user.id,
//         task: selectedTask._id,
//         progressPercentage: progressValue,
//         notes,
//         blockers,
//         achievements,
//         date: new Date(),
//       };

//       await api.progress.createProgress(progressData);
      
//       // Update the task in the local state
//       const updatedTasks = tasks.map(task => 
//         task._id === selectedTask._id 
//           ? { ...task, progress: progressValue } 
//           : task
//       );
//       setTasks(updatedTasks);
      
//       // Update selected task
//       setSelectedTask({ ...selectedTask, progress: progressValue });
      
//       // Refresh progress history
//       fetchProgressHistory(selectedTask._id);
      
//       // Reset form fields
//       setNotes("");
//       setBlockers("");
//       setAchievements("");
      
//       toast({
//         title: "Success",
//         description: "Progress updated successfully",
//         variant: "success",
//       });
//     } catch (error) {
//       console.error("Error updating progress:", error);
//       toast({
//         title: "Error",
//         description: "Failed to update progress",
//         variant: "destructive",
//       });
//     } finally {
//       setIsSubmitting(false);
//     }
//   };

//   if (isLoading) {
//     return (
//       <div className="flex items-center justify-center h-[80vh]">
//         <div className="flex flex-col items-center gap-2">
//           <Loader2 className="h-8 w-8 animate-spin text-primary" />
//           <p>Loading your tasks...</p>
//         </div>
//       </div>
//     );
//   }

//   if (tasks.length === 0) {
//     return (
//       <div className="flex flex-col items-center justify-center h-[80vh] px-4">
//         <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
//         <h2 className="text-2xl font-bold mb-2">No Active Tasks</h2>
//         <p className="text-muted-foreground text-center mb-6">
//           You don't have any active tasks assigned to you at the moment.
//         </p>
//         <Button onClick={() => navigate("/dashboard")}>
//           Return to Dashboard
//         </Button>
//       </div>
//     );
//   }

//   return (
//     <div className="container mx-auto py-6 space-y-6">
//       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
//         <div>
//           <h1 className="text-3xl font-bold tracking-tight">Task Progress</h1>
//           <p className="text-muted-foreground">
//             Track and update your daily progress on assigned tasks
//           </p>
//         </div>
        
//         <div className="w-full md:w-64">
//           <Select 
//             value={selectedTask?._id} 
//             onValueChange={handleTaskChange}
//           >
//             <SelectTrigger>
//               <SelectValue placeholder="Select a task" />
//             </SelectTrigger>
//             <SelectContent>
//               {tasks.map(task => (
//                 <SelectItem key={task._id} value={task._id}>
//                   {task.title}
//                 </SelectItem>
//               ))}
//             </SelectContent>
//           </Select>
//         </div>
//       </div>

//       {selectedTask && (
//         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
//           <Card className="lg:col-span-2">
//             <CardHeader>
//               <CardTitle>Update Progress</CardTitle>
//             </CardHeader>
//             <CardContent className="space-y-6">
//               <div className="space-y-2">
//                 <div className="flex justify-between items-center">
//                   <Label>Current Progress: {progressValue}%</Label>
//                   <span className="text-sm text-muted-foreground">
//                     Due: {format(new Date(selectedTask.dueDate), "PPP")}
//                   </span>
//                 </div>
//                 <Slider
//                   value={[progressValue]}
//                   onValueChange={(values) => setProgressValue(values[0])}
//                   max={100}
//                   step={1}
//                   className="py-4"
//                 />
//               </div>

//               <div className="space-y-2">
//                 <Label htmlFor="notes">Today's Progress Notes</Label>
//                 <Textarea
//                   id="notes"
//                   placeholder="What did you accomplish today?"
//                   value={notes}
//                   onChange={(e) => setNotes(e.target.value)}
//                   rows={3}
//                 />
//               </div>

//               <div className="space-y-2">
//                 <Label htmlFor="blockers">Blockers or Challenges</Label>
//                 <Textarea
//                   id="blockers"
//                   placeholder="Any issues preventing progress?"
//                   value={blockers}
//                   onChange={(e) => setBlockers(e.target.value)}
//                   rows={2}
//                 />
//               </div>

//               <div className="space-y-2">
//                 <Label htmlFor="achievements">Key Achievements</Label>
//                 <Textarea
//                   id="achievements"
//                   placeholder="What are you most proud of today?"
//                   value={achievements}
//                   onChange={(e) => setAchievements(e.target.value)}
//                   rows={2}
//                 />
//               </div>

//               <Button 
//                 onClick={handleSubmitProgress} 
//                 disabled={isSubmitting}
//                 className="w-full"
//               >
//                 {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
//                 Submit Progress Update
//               </Button>
//             </CardContent>
//           </Card>

//           <div className="space-y-6">
//             <Card>
//               <CardHeader>
//                 <CardTitle>Task Details</CardTitle>
//               </CardHeader>
//               <CardContent className="space-y-4">
//                 <div>
//                   <h3 className="font-semibold text-lg">{selectedTask.title}</h3>
//                   <p className="text-sm text-muted-foreground mt-1">{selectedTask.description}</p>
//                 </div>
                
//                 <div className="grid grid-cols-2 gap-4">
//                   <div>
//                     <p className="text-sm font-medium">Status</p>
//                     <p className="text-sm">{selectedTask.status}</p>
//                   </div>
//                   <div>
//                     <p className="text-sm font-medium">Priority</p>
//                     <p className="text-sm">{selectedTask.priority}</p>
//                   </div>
//                   <div>
//                     <p className="text-sm font-medium">Due Date</p>
//                     <p className="text-sm">{format(new Date(selectedTask.dueDate), "PPP")}</p>
//                   </div>
//                   <div>
//                     <p className="text-sm font-medium">Days Left</p>
//                     <p className="text-sm">
//                       {Math.max(0, Math.ceil((new Date(selectedTask.dueDate) - new Date()) / (1000 * 60 * 60 * 24)))} days
//                     </p>
//                   </div>
//                 </div>
//               </CardContent>
//             </Card>

//             <Card>
//               <CardHeader>
//                 <CardTitle>Progress Visualization</CardTitle>
//               </CardHeader>
//               <CardContent>
//                 <ProgressChart 
//                   history={progressHistory} 
//                   dueDate={selectedTask.dueDate}
//                 />
//               </CardContent>
//             </Card>
//           </div>
//         </div>
//       )}

//       {selectedTask && progressHistory.length > 0 && (
//         <Card>
//           <CardHeader>
//             <CardTitle>Progress History</CardTitle>
//           </CardHeader>
//           <CardContent>
//             <ProgressHistory history={progressHistory} />
//           </CardContent>
//         </Card>
//       )}
//     </div>
//   );
// }

// export default Progress;


import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Slider } from "../components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Loader2, Calendar, CheckCircle2, AlertCircle, Upload, X, Image as ImageIcon, MessageSquare, PlusCircle } from 'lucide-react';
import { api, API_URL } from "../lib/api";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useAuth } from "../context/auth-context";
import { ProgressChart } from "../components/progress/progress-chart";
import { ProgressHistory } from "../components/progress/progress-history";
import { format } from "date-fns";
import axios from "axios";

function Progress() {
  const navigate = useNavigate();

  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [progressValue, setProgressValue] = useState(0);
  const [notes, setNotes] = useState("");
  const [blockers, setBlockers] = useState("");
  const [achievements, setAchievements] = useState("");
  const [progressHistory, setProgressHistory] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedImages, setSelectedImages] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [whatsappTitle, setWhatsappTitle] = useState("");
  const [whatsappSender, setWhatsappSender] = useState("Project Lead (WhatsApp)");
  const [whatsappInstruction, setWhatsappInstruction] = useState("");
  const selectedTaskIdRef = useRef(null);

  useEffect(() => {
    const fetchUserTasks = async () => {
      try {
        setIsLoading(true);
        const storedUser = JSON.parse(localStorage.getItem("WorkflowUser") || "null");
        const userId = user?.id || user?._id || storedUser?.id || storedUser?._id;
        if (!userId) {
          setIsLoading(false);
          return;
        }

        const token = localStorage.getItem("WorkflowToken");
        const headers = token ? { "x-auth-token": token } : {};
  
        // Axios request to get tasks by user ID
        const response = await axios.get(`${API_URL}/users/${userId}/tasks`, { headers });
        const userTasks = Array.isArray(response.data) ? response.data : [];
        
        const filteredTasks = userTasks.filter(task =>
          ["Pending", "In Progress", "Approved", "Submitted for Review", "Returned", "Pending Validation"].includes(task.status)
        );
  
        setTasks(filteredTasks);
  
        if (filteredTasks.length > 0) {
          const prevId = selectedTaskIdRef.current;
          const taskToSelect = (prevId && filteredTasks.find(t => t._id === prevId)) || filteredTasks[0];
          selectedTaskIdRef.current = taskToSelect._id;
          setSelectedTask(taskToSelect);
          setProgressValue(taskToSelect.progress || 0);
          fetchProgressHistory(taskToSelect._id);
        } else {
          // If user has no active tasks, default to WhatsApp / Direct Task intake so they aren't blocked!
          setSelectedTask({
            _id: "whatsapp_task",
            title: "WhatsApp / Direct Assigned Task",
            description: "Task received via WhatsApp, direct instruction, or meeting.",
            status: "In Progress",
            priority: "Medium",
            dueDate: new Date()
          });
          setProgressValue(0);
        }
      } catch (error) {
        console.error("Error fetching tasks:", error);
        toast.error("Failed to load your tasks");
      } finally {
        setIsLoading(false);
      }
    };
  
    if (user || localStorage.getItem("WorkflowUser")) {
      fetchUserTasks();
    }
  }, [user]);

  const fetchProgressHistory = async (taskId) => {
    if (!taskId || taskId === "whatsapp_task") {
      setProgressHistory([]);
      return;
    }
    try {
      const history = await api.progress.getTaskProgress(taskId);
      setProgressHistory(history);
    } catch (error) {
      console.error("Error fetching progress history:", error);
      toast.error("Failed to load progress history");
    }
  };

  const handleTaskChange = (taskId) => {
    if (taskId === "whatsapp_task") {
      selectedTaskIdRef.current = "whatsapp_task";
      setSelectedTask({
        _id: "whatsapp_task",
        title: "WhatsApp / Direct Assigned Task",
        description: "Task received via WhatsApp, direct instruction, or meeting.",
        status: "In Progress",
        priority: "Medium",
        dueDate: new Date()
      });
      setProgressValue(0);
      setProgressHistory([]);
      setNotes("");
      setBlockers("");
      setAchievements("");
      setSelectedImages([]);
      setImagePreviews([]);
      return;
    }

    const task = tasks.find(t => t._id === taskId);
    if (task) {
      selectedTaskIdRef.current = task._id;
      setSelectedTask(task);
      setProgressValue(task.progress || 0);
      fetchProgressHistory(task._id);
      // Reset form fields
      setNotes("");
      setBlockers("");
      setAchievements("");
      setSelectedImages([]);
      setImagePreviews([]);
    }
  };

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files);
    
    // Limit to 10 images
    if (files.length + selectedImages.length > 10) {
      toast.error("You can upload a maximum of 10 images");
      return;
    }

    // Validate file sizes (max 10MB per file)
    const validFiles = files.filter(file => {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} is too large. Maximum size is 10MB`);
        return false;
      }
      return true;
    });

    // Create previews
    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews(prev => [...prev, { file, preview: reader.result }]);
      };
      reader.readAsDataURL(file);
    });

    setSelectedImages(prev => [...prev, ...validFiles]);
  };

  const removeImage = (index) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitProgress = async () => {
    if (!selectedTask) {
      toast.error("Please select a task first");
      return;
    }

    try {
      setIsSubmitting(true);
      const token = localStorage.getItem('WorkflowToken');
      const storedUser = JSON.parse(localStorage.getItem("WorkflowUser") || "null");
      const userId = user?.id || user?._id || storedUser?.id || storedUser?._id;

      let targetTaskId = selectedTask._id;

      // If logging for a WhatsApp task, register intake first!
      if (selectedTask._id === "whatsapp_task") {
        if (!whatsappTitle || !whatsappTitle.trim()) {
          toast.error("Please enter the WhatsApp task title");
          setIsSubmitting(false);
          return;
        }

        const intakeRes = await axios.post(`${API_URL}/tasks/register-intake`, {
          title: whatsappTitle.trim(),
          originalInstruction: (whatsappInstruction || whatsappTitle).trim(),
          originatingPerson: whatsappSender.trim() || "Project Lead (WhatsApp)",
          sourceType: "WHATSAPP",
          status: "In Progress",
          priority: "Medium"
        }, {
          headers: { 'x-auth-token': token }
        });

        const createdTask = intakeRes.data?.task || intakeRes.data;
        if (!createdTask || !createdTask._id) {
          throw new Error(intakeRes.data?.error || "Failed to register WhatsApp task");
        }

        targetTaskId = createdTask._id;
        // Add to local tasks list
        setTasks(prev => [createdTask, ...prev]);
        setSelectedTask(createdTask);
        selectedTaskIdRef.current = targetTaskId;
      }

      // Create FormData for multipart/form-data submission
      const formData = new FormData();
      formData.append('user', userId);
      formData.append('task', targetTaskId);
      formData.append('progressPercentage', progressValue);
      formData.append('notes', notes || (selectedTask._id === "whatsapp_task" ? whatsappTitle : ""));
      formData.append('blockers', blockers);
      formData.append('achievements', achievements);
      formData.append('date', new Date().toISOString());

      // Append images
      selectedImages.forEach((image) => {
        formData.append('progressImages', image);
      });

      // Send with axios to handle FormData properly
      await axios.post(`${API_URL}/progress`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'x-auth-token': token
        }
      });
      
      // Update the task in the local state
      setTasks(prevTasks => prevTasks.map(task => 
        task._id === targetTaskId 
          ? { ...task, progress: progressValue, status: 'In Progress' } 
          : task
      ));
      
      // Update selected task
      setSelectedTask(prev => ({ ...(prev || {}), _id: targetTaskId, progress: progressValue, status: 'In Progress' }));
      
      // Refresh progress history
      fetchProgressHistory(targetTaskId);
      
      // Reset form fields
      setNotes("");
      setBlockers("");
      setAchievements("");
      setSelectedImages([]);
      setImagePreviews([]);
      if (selectedTask._id === "whatsapp_task") {
        setWhatsappTitle("");
        setWhatsappInstruction("");
      }
      
      toast.success(`Progress updated successfully${selectedImages.length > 0 ? ` with ${selectedImages.length} image(s)` : ''}`);
    } catch (error) {
      console.error("Error updating progress:", error);
      const msg = error.response?.data?.error || error.response?.data?.message || "Failed to update progress";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p>Loading your tasks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <ToastContainer />

      {/* Non-blocking Notice when user has no pre-assigned tasks in DB */}
      {tasks.length === 0 && (
        <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-emerald-400">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-foreground">WhatsApp / Direct Task Logging Active</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                You have no pre-assigned tasks in the system. You can directly register and log daily progress for tasks received via WhatsApp or from your Lead below.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/my-tasks")} className="text-xs h-8 rounded-lg">
              View My Tasks
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="text-xs h-8 rounded-lg">
              Return to Dashboard
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Task Progress</h1>
          <p className="text-muted-foreground">
            Track and update your daily progress on assigned or WhatsApp tasks
          </p>
        </div>
        
        <div className="w-full md:w-72">
          <Select 
            value={selectedTask?._id || "whatsapp_task"} 
            onValueChange={handleTaskChange}
          >
            <SelectTrigger className="h-10 rounded-xl">
              <SelectValue placeholder="Select a task" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="whatsapp_task" className="font-semibold text-emerald-600 dark:text-emerald-400">
                💬 + Log WhatsApp / Direct Task
              </SelectItem>
              {tasks.map(task => (
                <SelectItem key={task._id} value={task._id}>
                  {task.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedTask && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{selectedTask._id === "whatsapp_task" ? "Log WhatsApp / Direct Task Progress" : "Update Progress"}</span>
                {selectedTask._id === "whatsapp_task" && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                    WhatsApp Task
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Extra intake fields if WhatsApp / Direct task is selected */}
              {selectedTask._id === "whatsapp_task" && (
                <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-4">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                    <MessageSquare className="h-4 w-4" />
                    <span>WhatsApp Task Information</span>
                  </div>
                  
                  <div className="space-y-1.5">
                    <Label htmlFor="whatsappTitle" className="text-xs font-semibold">
                      Task Title / Summary <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      id="whatsappTitle"
                      placeholder="e.g. Implement authentication middleware / Fix UI layout"
                      value={whatsappTitle}
                      onChange={(e) => setWhatsappTitle(e.target.value)}
                      className="h-9"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="whatsappSender" className="text-xs font-semibold">
                        Originating Person / Sender
                      </Label>
                      <Input
                        id="whatsappSender"
                        placeholder="e.g. Lead Name / WhatsApp Group"
                        value={whatsappSender}
                        onChange={(e) => setWhatsappSender(e.target.value)}
                        className="h-9"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="whatsappInstruction" className="text-xs font-semibold">
                        WhatsApp Message / Link (Optional)
                      </Label>
                      <Input
                        id="whatsappInstruction"
                        placeholder="Paste message instruction or ref"
                        value={whatsappInstruction}
                        onChange={(e) => setWhatsappInstruction(e.target.value)}
                        className="h-9"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Current Progress: {progressValue}%</Label>
                  <span className="text-sm text-muted-foreground">
                    Due: {selectedTask.dueDate ? (isNaN(new Date(selectedTask.dueDate).getTime()) ? "Today" : format(new Date(selectedTask.dueDate), "PPP")) : "Today"}
                  </span>
                </div>
               <Slider
                  value={[progressValue]}
                  onValueChange={(values) => setProgressValue(values[0])}
                  max={100}
                  step={1}
                  className="py-4 [&>span:first-child]:bg-black [&>span:last-child]:bg-white [&>span:first-child]:border-black [&>span:last-child]:border-white-400"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Today's Progress Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="What did you accomplish today?"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="blockers">Blockers or Challenges</Label>
                <Textarea
                  id="blockers"
                  placeholder="Any issues preventing progress?"
                  value={blockers}
                  onChange={(e) => setBlockers(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="achievements">Key Achievements</Label>
                <Textarea
                  id="achievements"
                  placeholder="What are you most proud of today?"
                  value={achievements}
                  onChange={(e) => setAchievements(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="progressImages">Progress Images (Optional)</Label>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Input
                      id="progressImages"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('progressImages').click()}
                      className="w-full"
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Upload Images
                    </Button>
                  </div>
                  
                  {imagePreviews.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {imagePreviews.map((item, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={item.preview}
                            alt={`Preview ${index + 1}`}
                            className="w-full h-24 object-cover rounded-md border"
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(index)}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <p className="text-xs text-muted-foreground">
                    <ImageIcon className="inline h-3 w-3 mr-1" />
                    Upload up to 10 images (max 10MB each) to show your progress
                  </p>
                </div>
              </div>

              <Button 
                onClick={handleSubmitProgress} 
                disabled={isSubmitting}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-11 rounded-xl shadow-sm"
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {selectedTask._id === "whatsapp_task" ? "Submit WhatsApp Task Progress" : "Submit Progress Update"}
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Task Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold text-lg">
                    {selectedTask._id === "whatsapp_task" ? (whatsappTitle || "WhatsApp / Direct Task") : selectedTask.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedTask._id === "whatsapp_task" ? (whatsappInstruction || "Task assigned via WhatsApp or direct lead instruction.") : selectedTask.description}
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium">Status</p>
                    <p className="text-sm font-semibold text-emerald-400">{selectedTask.status || "In Progress"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Priority</p>
                    <p className="text-sm">{selectedTask.priority || "Medium"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Due Date</p>
                    <p className="text-sm">
                      {selectedTask.dueDate && !isNaN(new Date(selectedTask.dueDate).getTime()) ? format(new Date(selectedTask.dueDate), "PPP") : "Today"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Source</p>
                    <p className="text-sm font-medium text-foreground">
                      {selectedTask._id === "whatsapp_task" ? "WhatsApp" : (selectedTask.sourceType || "System Assigned")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Progress Visualization</CardTitle>
              </CardHeader>
              <CardContent>
                <ProgressChart 
                  history={progressHistory} 
                  dueDate={selectedTask.dueDate || new Date()}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {selectedTask && progressHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Progress History</CardTitle>
          </CardHeader>
          <CardContent>
            <ProgressHistory history={progressHistory} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default Progress;

