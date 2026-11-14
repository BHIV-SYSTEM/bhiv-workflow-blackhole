import { toast } from "react-toastify";
import { useState, useEffect } from "react";
import api, { API_URL } from "@/lib/api";
import { cn } from "../../lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { isValid, parse, format } from "date-fns";
import { CalendarIcon, X, Search } from "lucide-react";
import "react-toastify/dist/ReactToastify.css";
import { useAuth } from "@/context/auth-context";
import { formatDate } from "@/lib/dateFormat";
import { getUserTasks } from "@/lib/user-api";
import { isValidOrgEmail } from "@/lib/orgEmail";

export function CreateTaskDialog({ open, onOpenChange, defaultAssignee = null, onTaskCreated }) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [departments, setDepartments] = useState([]); // ✅ Initialize as empty array
  const [allUsers, setAllUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [documentFile, setDocumentFile] = useState(null);
  const [dueDate, setDueDate] = useState(null);
  const [dateError, setDateError] = useState("");
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [selectedUserTasks, setSelectedUserTasks] = useState([]);
  const [loadingUserTasks, setLoadingUserTasks] = useState(false);
  const [dependencySearch, setDependencySearch] = useState("");
  const [dropdownSearchQuery, setDropdownSearchQuery] = useState("");
  const [filteredDependencies, setFilteredDependencies] = useState([]);
  const [showDependencyDropdown, setShowDependencyDropdown] = useState(false);

  const [creationMode, setCreationMode] = useState("manual"); // "manual" | "ai_ingest"
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    department: "",
    assignee: "",
    priority: "Medium",
    status: "Pending",
    dependencies: [],
  });

  useEffect(() => {
    if (open) {
      setFormData({
        title: "",
        description: "",
        department: "",
        assignee: defaultAssignee || "",
        priority: "Medium",
        status: "Pending",
        dependencies: [],
      });
      setDueDate("");
      setDocumentFile(null);
      setDateError("");
      setFilteredUsers([]);
      setAssigneeSearch("");
      setSelectedUserTasks([]);
      setLoadingUserTasks(false);
      setDependencySearch("");
      setDropdownSearchQuery("");
      setFilteredDependencies([]);
      setShowDependencyDropdown(false);

      const fetchData = async () => {
  try {
    const [departmentsResponse, usersResponse, tasksResponse] = await Promise.all([
      api.departments.getDepartments(),
      api.users.getUsers(),
      api.tasks.getTasks({ limit: 100, page: 1 }),
    ]);

    let departmentsData = [];
    if (Array.isArray(departmentsResponse)) {
      departmentsData = departmentsResponse;
    } else if (departmentsResponse?.data && Array.isArray(departmentsResponse.data)) {
      departmentsData = departmentsResponse.data;
    }

    const usersData = Array.isArray(usersResponse) ? usersResponse : [];
    const tasksData = Array.isArray(tasksResponse?.tasks) ? tasksResponse.tasks
      : Array.isArray(tasksResponse) ? tasksResponse : [];

    setDepartments(departmentsData);
    setAllUsers(usersData);
    setTasks(tasksData);
  } catch (error) {
    console.error("Error fetching data:", error);
    toast.error("Failed to load required data");
    setDepartments([]);
    setAllUsers([]);
    setTasks([]);
  }
};

      fetchData();
    }
  }, [open, defaultAssignee]);

  // Set default assignee after users are loaded
  useEffect(() => {
    if (open && defaultAssignee && allUsers.length > 0) {
      const user = allUsers.find(u => u._id === defaultAssignee);
      if (user) {
        setFormData((prev) => ({ ...prev, assignee: defaultAssignee }));
        setAssigneeSearch(user.name || user.email || "");
      }
    }
  }, [open, defaultAssignee, allUsers]);

  // Initialize filtered dependencies when tasks are loaded
  useEffect(() => {
    if (Array.isArray(tasks) && tasks.length > 0) {
      setFilteredDependencies(tasks);
    }
  }, [tasks]);

  // Close dependency dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      const dependencyButton = document.getElementById("dependencies");
      const dependencyDropdown = event.target.closest(".dependency-dropdown-container");
      if (dependencyButton && !dependencyButton.contains(event.target) && !dependencyDropdown) {
        setShowDependencyDropdown(false);
        setDropdownSearchQuery("");
      }
    };

    if (showDependencyDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showDependencyDropdown]);

  const handleDepartmentChange = (departmentId) => {
    setFormData((prev) => ({ ...prev, department: departmentId, assignee: "" }));
    setAssigneeSearch("");
    
    const usersInDepartment = allUsers.filter(
      (user) =>
        user.department?._id === departmentId &&
        user.stillExist === 1 &&
        isValidOrgEmail(user.email)
    );
    setFilteredUsers(usersInDepartment);
    
    console.log('Users in department:', usersInDepartment);
  };

  const handleAssigneeSearch = (e) => {
    const searchValue = e.target.value;
    setAssigneeSearch(searchValue);
    
    const usersInDepartment = allUsers.filter(
      (user) =>
        user.department?._id === formData.department &&
        user.stillExist === 1 &&
        isValidOrgEmail(user.email)
    );

    if (searchValue.trim() === "") {
      setFilteredUsers(usersInDepartment);
    } else {
      const q = searchValue.toLowerCase();
      const filtered = usersInDepartment.filter((user) =>
        (user.name?.toLowerCase() || "").includes(q) ||
        (user.email?.toLowerCase() || "").includes(q)
      );
      setFilteredUsers(filtered);
    }
  };

  const handleDependencySearch = (e) => {
    const searchValue = e.target.value;
    setDropdownSearchQuery(searchValue);
    
    if (searchValue.trim() === "") {
      setFilteredDependencies(Array.isArray(tasks) ? tasks : []);
    } else {
      const filtered = (Array.isArray(tasks) ? tasks : []).filter((task) =>
        task.title.toLowerCase().includes(searchValue.toLowerCase()) ||
        (task.description && task.description.toLowerCase().includes(searchValue.toLowerCase()))
      );
      setFilteredDependencies(filtered);
    }
  };

  const handleDependencySelect = (taskId) => {
    const selectedTask = tasks.find(t => t._id === taskId);
    if (selectedTask) {
      const isAlreadySelected = formData.dependencies.includes(taskId);
      setFormData((prev) => ({ 
        ...prev, 
        dependencies: isAlreadySelected
          ? prev.dependencies.filter(id => id !== taskId)
          : [...prev.dependencies, taskId]
      }));
      // Keep dropdown open for multiple selections
      // Don't clear search so admin can continue searching
    }
  };

  const handleRemoveDependency = (taskId) => {
    setFormData((prev) => ({ 
      ...prev, 
      dependencies: prev.dependencies.filter(id => id !== taskId)
    }));
  };
  const handleAssigneeSelect = async (user) => {
    setFormData((prev) => ({ ...prev, assignee: user._id }));
    setAssigneeSearch(user.name);
    setFilteredUsers([]); // Clear filtered users after selection

    // Fetch user's previous tasks
    await fetchUserTasks(user._id);
  };

  const fetchUserTasks = async (userId) => {
    setLoadingUserTasks(true);
    try {
      const tasks = await getUserTasks(userId);
      setSelectedUserTasks(Array.isArray(tasks) ? tasks : []);
    } catch (error) {
      console.error("Error fetching user tasks:", error);
      setSelectedUserTasks([]);
    } finally {
      setLoadingUserTasks(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleDateChange = (date) => {
    if (!date) {
      setDueDate(null);
      setDateError("");
      return;
    }

    setDueDate(date);

    // Validate the date
    if (!isValid(date)) {
      setDateError("Invalid date");
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(date);
    selectedDate.setHours(0, 0, 0, 0);
    
    if (selectedDate < today) {
      setDateError("Due date cannot be in the past");
      return;
    }

    setDateError("");
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const ext = file.name.split(".").pop().toLowerCase();
      const validExtensions = ["pdf", "doc", "docx", "txt", "html", "md"];
      const validTypes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
        "text/html",
        "text/markdown",
        "",
      ];
      if (!validTypes.includes(file.type) && !validExtensions.includes(ext)) {
        toast.error("Only PDF, DOC, DOCX, MD, TXT, and HTML files are allowed.");
        return;
      }

      if (file.size > 15 * 1024 * 1024) {
        toast.error("File size must be less than 15MB");
        return;
      }

      setDocumentFile(file);
    }
  };

  const handleSubmit = async () => {
    if (creationMode === "ai_ingest") {
      if (!documentFile) {
        toast.error("Please attach a Task Document for AI Automated Ingestion.");
        return;
      }
    } else {
      if (!formData.title || !formData.department || !formData.assignee) {
        toast.error("Please fill in all required fields (Title, Department, Assignee).");
        return;
      }
    }

    if (dueDate) {
      if (!isValid(dueDate)) {
        toast.error("Invalid due date");
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const selectedDate = new Date(dueDate);
      selectedDate.setHours(0, 0, 0, 0);
      
      if (selectedDate < today) {
        toast.error("Due date cannot be in the past");
        return;
      }
    }

    setIsLoading(true);

    try {
      const token = localStorage.getItem("WorkflowToken");
      const selectedBranch = localStorage.getItem("selectedBranch");

      // ⚡ OPTION 2: AUTOMATED DOCUMENT INGESTION MODE (/api/tasks/ingest)
      if (creationMode === "ai_ingest") {
        const ingestFormData = new FormData();
        ingestFormData.append("taskFile", documentFile);
        ingestFormData.append("branch", selectedBranch || "blackhole_mumbai");
        if (formData.assignee) ingestFormData.append("assignee", formData.assignee);
        if (formData.department) ingestFormData.append("department", formData.department);
        if (formData.description) ingestFormData.append("content", formData.description);

        console.log("Ingesting task document via SETU Gateway API:", documentFile.name);

        const response = await fetch(`${API_URL}/tasks/ingest`, {
          method: "POST",
          headers: {
            ...(token && { "x-auth-token": token }),
            ...(selectedBranch && selectedBranch !== "all" && { "x-branch": selectedBranch }),
          },
          body: ingestFormData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || errorData.error || `SETU Ingestion Failed: ${response.statusText}`);
        }

        const result = await response.json();
        console.log("SETU Task Ingestion Successful:", result);

        if (onTaskCreated && result.task) onTaskCreated(result.task);
        toast.success("Task created successfully");
        onOpenChange(false);
        return;
      }

      // ✍️ OPTION 1: MANUAL TASK CREATION MODE (/api/tasks)
      const formDataToSend = new FormData();
      formDataToSend.append("title", formData.title);
      formDataToSend.append("description", formData.description.trim() || "No description provided");
      formDataToSend.append("department", formData.department);
      formDataToSend.append("assignee", formData.assignee);
      formDataToSend.append("priority", formData.priority);
      formDataToSend.append("status", formData.status);
      formDataToSend.append("dependencies", JSON.stringify(formData.dependencies));
      if (user?.id) formDataToSend.append("user", user.id);
      formDataToSend.append("links", formData.links || "");
      if (documentFile) {
        formDataToSend.append("document", documentFile);
      }

      if (dueDate) {
        formDataToSend.append("dueDate", format(dueDate, "yyyy-MM-dd"));
      }

      console.log("Creating manual task with data:", formData);

      const response = await fetch(`${API_URL}/tasks`, {
        method: "POST",
        headers: {
          ...(token && { "x-auth-token": token }),
          ...(selectedBranch && selectedBranch !== "all" && { "x-branch": selectedBranch }),
        },
        body: formDataToSend,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to create task: ${response.statusText}`);
      }

      const result = await response.json();
      console.log("Task created successfully:", result);

      if (onTaskCreated) onTaskCreated(result);
      toast.success("Task created successfully");
      onOpenChange(false);
      
    } catch (error) {
      console.error("Error creating task:", error);
      toast.error(error.message || "Failed to create task");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[92vh] overflow-hidden bg-card text-foreground border border-border/70 shadow-2xl rounded-2xl p-0">
        {/* Hidden title for accessibility */}
        <DialogTitle className="sr-only">Create New Task</DialogTitle>
        
        {/* Scrollable Content Area */}
        <div className="px-7 pt-7 pb-6 overflow-y-auto max-h-[calc(92vh-130px)] custom-scrollbar">
          <div className="grid gap-6">

            {/* Mode Selector Toggle */}
            <div className="flex items-center justify-between p-1.5 bg-muted/50 rounded-2xl border border-border/60">
              <button
                type="button"
                onClick={() => setCreationMode("manual")}
                className={cn(
                  "flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2",
                  creationMode === "manual"
                    ? "bg-card text-foreground shadow-sm border border-border/70"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span>✍️</span> Manual Task Creation
              </button>
              <button
                type="button"
                onClick={() => setCreationMode("ai_ingest")}
                className={cn(
                  "flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 flex items-center justify-center gap-2",
                  creationMode === "ai_ingest"
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md border border-blue-500"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span>⚡</span> AI Document Ingestion
              </button>
            </div>

            {/* ⚡ AI AUTOMATED INGESTION MODE VIEW */}
            {creationMode === "ai_ingest" ? (
              <div className="grid gap-5">
                <div className="p-4 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border border-blue-500/30 rounded-2xl text-sm text-foreground backdrop-blur-xl">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xl">🤖</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400 text-base">SETU EOS AI Document Ingestion</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Upload your task specification document (PDF, DOCX, TXT, or MD). The AI ingestion engine will automatically parse the task title, description, priority, department, and matching assignees.
                  </p>
                </div>

                {/* Prominent Drag & Drop File Upload Box */}
                <div className="grid gap-2.5">
                  <Label htmlFor="ai-document-upload" className="text-sm font-bold text-foreground flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-blue-500 shadow-lg shadow-blue-500/50"></div>
                    Upload Task Specification PDF / Document <span className="text-destructive ml-0.5">*</span>
                  </Label>
                  <div className="relative border-2 border-dashed border-blue-500/40 hover:border-blue-500 rounded-2xl p-8 transition-all duration-300 bg-blue-500/5 hover:bg-blue-500/10 text-center cursor-pointer group">
                    <input
                      id="ai-document-upload"
                      type="file"
                      accept=".pdf,.doc,.docx,.txt,.html,.md"
                      onChange={handleFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                    />
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="h-16 w-16 rounded-2xl bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg shadow-blue-500/20">
                        <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-base font-bold text-foreground">
                          {documentFile ? documentFile.name : "Click or Drag & Drop Task Document Here"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 font-medium">
                          Supports PDF, DOCX, TXT, MD files up to 15MB
                        </p>
                      </div>
                    </div>
                  </div>

                  {documentFile && (
                    <div className="mt-2 p-4 bg-emerald-500/15 border border-emerald-500/40 rounded-xl flex items-center justify-between shadow-lg shadow-emerald-500/10 backdrop-blur-xl">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0 font-bold text-xs">
                          PDF
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">{documentFile.name}</p>
                          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5 mt-0.5">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            {(documentFile.size / 1024).toFixed(1)} KB • Ready for AI Extraction
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDocumentFile(null)}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                      >
                        <X className="h-5 w-5" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Optional Department Override */}
                <div className="grid gap-2.5 pt-2">
                  <Label htmlFor="ai-dept" className="text-xs font-bold text-muted-foreground">
                    Department (Optional Override)
                  </Label>
                  <Select
                    value={formData.department}
                    onValueChange={handleDepartmentChange}
                  >
                    <SelectTrigger id="ai-dept" className="h-11 px-4 bg-background/70 border border-border/70 rounded-xl text-sm font-medium">
                      <SelectValue placeholder="Auto-detect department from document..." />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border border-border/70 rounded-xl">
                      {Array.isArray(departments) && departments.map((dept) => (
                        <SelectItem key={dept._id} value={dept._id}>{dept.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              /* Manual Task Creation */
              <div className="grid gap-6">
                {/* Task Title */}
                <div className="grid gap-2.5">
                  <Label htmlFor="title" className="text-sm font-bold text-foreground flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary shadow-lg shadow-primary/50"></div>
                    Task Title <span className="text-destructive ml-0.5">*</span>
                  </Label>
                  <Input
                    id="title"
                    placeholder="Enter a descriptive task title..."
                    value={formData.title}
                    onChange={(e) => handleChange("title", e.target.value)}
                    className="h-12 px-4 bg-background/70 border border-border/70 hover:border-border focus:border-primary focus-visible:ring-4 focus-visible:ring-primary/20 rounded-xl transition-all duration-200 text-base font-medium placeholder:text-muted-foreground text-foreground"
                  />
                </div>

                {/* Description */}
                <div className="grid gap-2.5">
                  <Label htmlFor="description" className="text-sm font-bold text-foreground flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-secondary shadow-lg shadow-secondary/50"></div>
                    Description
                  </Label>
                  <Textarea
                    id="description"
                    placeholder="Describe the task in detail..."
                    className="min-h-[110px] px-4 py-3 bg-background/70 border border-border/70 hover:border-border focus:border-secondary focus-visible:ring-4 focus-visible:ring-secondary/20 rounded-xl resize-none transition-all duration-200 text-base placeholder:text-muted-foreground text-foreground"
                    value={formData.description}
                    onChange={(e) => handleChange("description", e.target.value)}
                  />
                </div>

                {/* Links */}
                <div className="grid gap-2.5">
                  <Label htmlFor="links" className="text-sm font-bold text-foreground flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-accent shadow-lg shadow-accent/50"></div>
                    Reference Links
                  </Label>
                  <Input
                    id="links"
                    placeholder="Add URLs separated by commas..."
                    value={formData.links}
                    onChange={(e) => handleChange("links", e.target.value)}
                    className="h-12 px-4 bg-background/70 border border-border/70 hover:border-border focus:border-accent focus-visible:ring-4 focus-visible:ring-accent/20 rounded-xl transition-all duration-200 text-base placeholder:text-muted-foreground text-foreground"
                  />
                </div>

                {/* Department and Assignee Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="grid gap-2.5">
                    <Label htmlFor="department" className="text-sm font-bold text-foreground flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-info shadow-lg shadow-info/50"></div>
                      Department <span className="text-destructive ml-0.5">*</span>
                    </Label>
                    <Select
                      value={formData.department}
                      onValueChange={handleDepartmentChange}
                    >
                      <SelectTrigger id="department" className="h-12 px-4 bg-background/70 border border-border/70 hover:border-border focus:border-info focus:ring-4 focus:ring-info/20 rounded-xl transition-all duration-200 text-base font-medium text-foreground">
                        <SelectValue placeholder={
                          Array.isArray(departments) && departments.length > 0 
                            ? "Select department..." 
                            : "Loading..."
                        } />
                      </SelectTrigger>
                      <SelectContent className="bg-popover/95 backdrop-blur-xl border border-border/70 rounded-2xl shadow-2xl max-h-64 overflow-y-auto">
                        {Array.isArray(departments) && departments.length > 0 && 
                          departments.map((dept) => (
                            <SelectItem 
                              key={dept._id} 
                              value={dept._id}
                              className="my-1 mx-2 px-3 py-2.5 rounded-lg hover:bg-info/15 cursor-pointer transition-all duration-200 font-medium text-foreground"
                            >
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full bg-info"></div>
                                {dept.name}
                              </div>
                            </SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2.5">
                    <Label htmlFor="assignee-search" className="text-sm font-bold text-foreground flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-success shadow-lg shadow-success/50"></div>
                      Assignee <span className="text-destructive ml-0.5">*</span>
                    </Label>
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground z-10" />
                      <Input
                        id="assignee-search"
                        placeholder="Search assignees by name or email..."
                        value={assigneeSearch}
                        onChange={handleAssigneeSearch}
                        disabled={!formData.department}
                        className="h-12 pl-12 pr-10 bg-background/70 border border-border/70 hover:border-border focus:border-success focus-visible:ring-4 focus-visible:ring-success/20 rounded-xl transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed text-base placeholder:text-muted-foreground text-foreground"
                      />
                      {assigneeSearch && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setAssigneeSearch("");
                            setFormData((prev) => ({ ...prev, assignee: "" }));
                            setFilteredUsers([]);
                            setSelectedUserTasks([]);
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-lg transition-all"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {filteredUsers.length > 0 && formData.department && (
                      <div className="mt-1 bg-popover/95 backdrop-blur-xl border border-border/70 rounded-xl max-h-60 overflow-y-auto shadow-xl custom-scrollbar">
                        {filteredUsers.map((user) => (
                          <div
                            key={user._id}
                            className="m-2 px-4 py-3 hover:bg-success/15 cursor-pointer text-sm flex items-center justify-between rounded-lg transition-all duration-200 group"
                            onClick={() => handleAssigneeSelect(user)}
                          >
                            <span className="font-semibold text-foreground group-hover:text-success transition-colors">{user.name}</span>
                            <span className="text-xs bg-success/15 text-success px-3 py-1 rounded-full font-bold flex items-center gap-1.5">
                              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                              Active
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {formData.department && filteredUsers.length === 0 && assigneeSearch && !formData.assignee && (
                      <div className="px-4 py-2 text-sm text-muted-foreground">
                        No active users found in this department
                      </div>
                    )}

                    {/* User's Previous Tasks */}
                    {formData.assignee && (
                      <div className="mt-4 p-4 bg-primary/5 border border-primary/20 rounded-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          <h4 className="font-semibold text-foreground">Previous Tasks for {assigneeSearch}</h4>
                        </div>

                        {loadingUserTasks ? (
                          <div className="text-center py-4">
                            <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
                              <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                              Loading tasks...
                            </div>
                          </div>
                        ) : selectedUserTasks.length > 0 ? (
                          <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                            {selectedUserTasks.slice(0, 5).map((task) => (
                              <div key={task._id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg border border-border/50 hover:border-primary/40 transition-colors duration-200">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className={`text-xs px-2 py-1 rounded-full ${
                                      task.status === 'Completed' ? 'bg-success/20 text-success' :
                                      task.status === 'In Progress' ? 'bg-info/20 text-info' :
                                      'bg-warning/20 text-warning'
                                    }`}>
                                      {task.status}
                                    </span>
                                    <span className={`text-xs px-2 py-1 rounded-full ${
                                      task.priority === 'High' ? 'bg-red-500/20 text-red-500' :
                                      task.priority === 'Medium' ? 'bg-yellow-500/20 text-yellow-500' :
                                      'bg-green-500/20 text-green-500'
                                    }`}>
                                      {task.priority}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-xs text-muted-foreground ml-2">
                                  {task.dueDate ? formatDate(task.dueDate) : 'No date'}
                                </div>
                              </div>
                            ))}
                            {selectedUserTasks.length > 5 && (
                              <div className="text-xs text-muted-foreground text-center py-2">
                                +{selectedUserTasks.length - 5} more tasks
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-4 text-muted-foreground text-sm">
                            No previous tasks found for this user
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Priority and Due Date */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="grid gap-2.5">
                    <Label htmlFor="priority" className="text-sm font-bold text-foreground flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-warning shadow-lg shadow-warning/50"></div>
                      Priority
                    </Label>
                    <Select
                      value={formData.priority}
                      onValueChange={(value) => handleChange("priority", value)}
                    >
                      <SelectTrigger id="priority" className="h-12 px-4 bg-background/70 border border-border/70 hover:border-border focus:border-warning focus:ring-4 focus:ring-warning/20 rounded-xl transition-all duration-200 text-base font-medium text-foreground">
                        <SelectValue placeholder="Select priority..." />
                      </SelectTrigger>
                      <SelectContent className="bg-popover/95 backdrop-blur-xl border border-border/70 rounded-2xl shadow-2xl">
                        <SelectItem value="High" className="my-1 mx-2 px-3 py-2.5 rounded-lg hover:bg-destructive/15 cursor-pointer transition-all duration-200 text-foreground">
                          <span className="flex items-center gap-2.5 font-semibold">
                            <span className="h-2.5 w-2.5 rounded-full bg-destructive shadow-lg shadow-destructive/30"></span>
                            <span className="text-destructive">High Priority</span>
                          </span>
                        </SelectItem>
                        <SelectItem value="Medium" className="my-1 mx-2 px-3 py-2.5 rounded-lg hover:bg-warning/15 cursor-pointer transition-all duration-200 text-foreground">
                          <span className="flex items-center gap-2.5 font-semibold">
                            <span className="h-2.5 w-2.5 rounded-full bg-warning shadow-lg shadow-warning/30"></span>
                            <span className="text-warning">Medium Priority</span>
                          </span>
                        </SelectItem>
                        <SelectItem value="Low" className="my-1 mx-2 px-3 py-2.5 rounded-lg hover:bg-success/15 cursor-pointer transition-all duration-200 text-foreground">
                          <span className="flex items-center gap-2.5 font-semibold">
                            <span className="h-2.5 w-2.5 rounded-full bg-success shadow-lg shadow-success/30"></span>
                            <span className="text-success">Low Priority</span>
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2.5">
                    <Label htmlFor="dueDate" className="text-sm font-bold text-foreground flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-info shadow-lg shadow-info/50"></div>
                      Due Date
                    </Label>
                    <div className="relative">
                      <Input
                        id="dueDate"
                        type="date"
                        value={dueDate ? format(dueDate, "yyyy-MM-dd") : ""}
                        onChange={(e) => {
                          if (e.target.value) {
                            handleDateChange(new Date(e.target.value));
                          } else {
                            handleDateChange(null);
                          }
                        }}
                        min={format(new Date(), "yyyy-MM-dd")}
                        className={cn(
                          "h-12 bg-background/70 border border-border/70",
                          "hover:border-border",
                          "focus:border-primary",
                          "rounded-xl transition-all duration-200",
                          "text-foreground font-medium",
                          dateError && "border-destructive"
                        )}
                      />
                      {dueDate && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDateChange(null)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-lg transition-all"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {dateError && (
                      <p className="text-sm text-destructive flex items-center gap-1.5 mt-1 font-medium">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {dateError}
                      </p>
                    )}
                  </div>
                </div>

                {/* Dependencies */}
                <div className="grid gap-2.5">
                  <Label htmlFor="dependencies" className="text-sm font-bold text-foreground flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-secondary shadow-lg shadow-secondary/50"></div>
                    Dependencies
                  </Label>
                  <div className="relative">
                    <Button
                      type="button"
                      variant="outline"
                      id="dependencies"
                      onClick={() => {
                        if (Array.isArray(tasks) && tasks.length > 0) {
                          setFilteredDependencies(tasks);
                          setShowDependencyDropdown(!showDependencyDropdown);
                          setDropdownSearchQuery("");
                        }
                      }}
                      className="w-full h-12 px-4 bg-background/70 border border-border/70 hover:border-border focus:border-secondary focus:ring-4 focus:ring-secondary/20 rounded-xl transition-all duration-200 text-base font-medium text-left justify-start text-foreground"
                    >
                      <Search className="h-5 w-5 text-muted-foreground mr-3" />
                      <span className="text-muted-foreground">
                        {formData.dependencies.length > 0 
                          ? `${formData.dependencies.length} task${formData.dependencies.length > 1 ? 's' : ''} selected`
                          : "Click to select dependent tasks..."
                        }
                      </span>
                      <svg className="ml-auto h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </Button>
                    {showDependencyDropdown && (
                      <div className="dependency-dropdown-container absolute z-50 w-full mt-1 bg-popover/95 backdrop-blur-xl border border-border/70 rounded-xl shadow-xl overflow-hidden">
                        {/* Search Bar Inside Dropdown */}
                        <div className="p-3 border-b border-border/60 bg-muted/40">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                            <Input
                              placeholder="Search tasks by name or description..."
                              value={dropdownSearchQuery}
                              onChange={handleDependencySearch}
                              className="h-10 pl-10 pr-8 bg-background/70 border border-border/70 hover:border-border focus:border-secondary focus-visible:ring-2 focus-visible:ring-secondary/20 rounded-lg transition-all duration-200 text-sm placeholder:text-muted-foreground text-foreground"
                              autoFocus
                            />
                            {dropdownSearchQuery && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setDropdownSearchQuery("");
                                  setFilteredDependencies(Array.isArray(tasks) ? tasks : []);
                                }}
                                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded transition-all"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                        
                        {/* Tasks List */}
                        <div className="max-h-60 overflow-y-auto custom-scrollbar">
                        {filteredDependencies.length > 0 ? (
                          <>
                        {filteredDependencies.map((task) => {
                          const isSelected = formData.dependencies.includes(task._id);
                          return (
                            <div
                              key={task._id}
                              className={`m-2 px-4 py-3 cursor-pointer text-sm flex items-center justify-between rounded-lg transition-all duration-200 group ${
                                isSelected
                                  ? "bg-secondary/20 border border-secondary/50"
                                  : "hover:bg-muted/60"
                              }`}
                              onClick={() => handleDependencySelect(task._id)}
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <svg className="h-4 w-4 text-secondary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                <div className="flex-1 min-w-0">
                                  <span className={`font-semibold block truncate ${isSelected ? "text-secondary" : "text-foreground group-hover:text-secondary transition-colors"}`}>
                                    {task.title}
                                  </span>
                                  {task.description && (
                                    <span className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                      {task.description}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {isSelected && (
                                <span className="text-xs bg-secondary/20 text-secondary px-2 py-1 rounded-full font-bold flex items-center gap-1.5 ml-2 flex-shrink-0">
                                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                  </svg>
                                  Selected
                                </span>
                              )}
                            </div>
                          );
                        })}
                          </>
                        ) : (
                          <div className="p-4 text-center">
                            <p className="text-sm text-muted-foreground font-medium">
                              {dropdownSearchQuery 
                                ? `No tasks found matching "${dropdownSearchQuery}"`
                                : "No tasks available for dependencies"
                              }
                            </p>
                          </div>
                        )}
                        </div>
                      </div>
                    )}
                  </div>
                  {formData.dependencies.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {formData.dependencies.map((taskId) => {
                        const task = tasks.find(t => t._id === taskId);
                        if (!task) return null;
                        return (
                          <div
                            key={taskId}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-secondary/15 border border-secondary/40 rounded-lg text-sm"
                          >
                            <svg className="h-3.5 w-3.5 text-secondary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            <span className="font-medium text-foreground truncate max-w-[200px]">
                              {task.title}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveDependency(taskId)}
                              className="h-5 w-5 p-0 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded transition-all flex-shrink-0"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {Array.isArray(tasks) && tasks.length === 0 && (
                    <p className="text-xs text-muted-foreground font-medium">No tasks available for dependencies</p>
                  )}
                  {showDependencyDropdown && filteredDependencies.length === 0 && dependencySearch && (
                    <p className="text-xs text-muted-foreground font-medium mt-1">No tasks found matching "{dependencySearch}"</p>
                  )}
                </div>

                {/* Document Upload */}
                <div className="grid gap-2.5">
                  <Label htmlFor="document" className="text-sm font-bold text-foreground flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-accent shadow-lg shadow-accent/50"></div>
                    Document Attachment
                  </Label>
                  <div className="relative">
                    <Input
                      id="document"
                      type="file"
                      accept=".pdf,.doc,.docx,.txt,.html,.md"
                      onChange={handleFileChange}
                      className="h-12 px-4 bg-background/70 border-2 border-dashed border-border/70 hover:border-border focus:border-accent focus-visible:ring-4 focus-visible:ring-accent/20 rounded-xl transition-all duration-200 cursor-pointer text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gradient-to-r file:from-accent file:to-accent/80 file:text-accent-foreground hover:file:from-accent/90 hover:file:to-accent/70 file:transition-all file:duration-200"
                    />
                  </div>
                  {documentFile && (
                    <div className="mt-1 p-3 bg-accent/15 border border-accent/30 rounded-lg">
                      <p className="text-sm text-foreground flex items-center gap-2.5 font-medium">
                        <svg className="h-5 w-5 text-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="truncate">{documentFile.name}</span>
                        <span className="text-xs text-accent bg-accent/20 px-2 py-0.5 rounded-full ml-auto">Attached</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Premium Footer */}
        <DialogFooter className="px-7 py-4 border-t border-border/60 bg-muted/30">
          <div className="flex items-center gap-3 w-full sm:w-auto sm:ml-auto">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              className="flex-1 sm:flex-none h-12 px-6 rounded-xl border-border/70 hover:bg-muted/60 transition-all duration-200 font-semibold text-foreground"
            >
              <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Cancel
            </Button>
            <Button 
              type="submit" 
              onClick={handleSubmit} 
              disabled={isLoading || dateError}
              className="flex-1 sm:flex-none h-12 px-8 rounded-xl gradient-primary text-primary-foreground hover:shadow-xl hover:shadow-primary/30 transition-all duration-200 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none font-bold"
            >
              {isLoading ? (
                <span className="flex items-center gap-2.5">
                  <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                  {creationMode === "ai_ingest" ? "Extracting Document..." : "Creating Task..."}
                </span>
              ) : (
                <span className="flex items-center gap-2.5">
                  {creationMode === "ai_ingest" ? (
                    <>
                      <span className="text-lg">⚡</span> Ingest Task with AI
                    </>
                  ) : (
                    <>
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                      </svg>
                      Create Task
                    </>
                  )}
                </span>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}