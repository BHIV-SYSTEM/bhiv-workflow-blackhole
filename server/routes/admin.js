const express = require("express")
const router = express.Router()
const User = require("../models/User")
const Department = require("../models/Department")
const Task = require("../models/Task")
const auth = require("../middleware/auth")
const adminAuth = require("../middleware/adminAuth")
const { isValidOrgEmail, orgEmailMongoFilter, ORG_EMAIL_ERROR } = require("../utils/orgEmail")

// Helper to get branch filter from request
const getBranchQuery = (req) => {
  const selectedBranch = req.headers['x-branch'] || req.query.branch;
  if (selectedBranch && selectedBranch !== 'all') {
    return { branch: selectedBranch };
  }
  return {};
};

// ===== USER ROUTES =====

// @route   GET api/admin/users
// @desc    Get all users - FILTERED BY BRANCH
// @access  Admin or Manager
router.get("/users", auth, async (req, res) => {
  try {
    const { includeExited } = req.query;
    const branchQuery = getBranchQuery(req);

    // Build filter - show users filtered by branch
    const baseFilter = { ...branchQuery };
    if (!includeExited || includeExited !== 'true') {
      baseFilter.stillExist = 1;
    }

    // If manager, only return users from their department
    if (req.user?.role === "Manager") {
      const manager = await User.findById(req.user.id)
      if (!manager.department) {
        return res.json([])
      }

      const users = await User.find({
        ...baseFilter,
        department: manager.department
      }).select("-password").sort({ name: 1 })

      // Add blackhole indicator
      const usersWithIndicators = users.map(user => ({
        ...user.toObject(),
        isBlackhole: isValidOrgEmail(user.email),
        canBeAssigned: isValidOrgEmail(user.email) && user.stillExist === 1
      }));

      return res.json(usersWithIndicators)
    }

    // For admins, return users filtered by branch
    const users = await User.find(baseFilter).select("-password").sort({ name: 1 })

    // Add blackhole indicator
    const usersWithIndicators = users.map(user => ({
      ...user.toObject(),
      isBlackhole: isValidOrgEmail(user.email),
      canBeAssigned: isValidOrgEmail(user.email) && user.stillExist === 1
    }));

    res.json(usersWithIndicators)
  } catch (error) {
    console.error("Error fetching users:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// @route   GET api/admin/users/all
// @desc    Get all users including exited ones (admin only) - FILTERED BY BRANCH
// @access  Admin only
router.get("/users/all", auth, adminAuth, async (req, res) => {
  try {
    const branchQuery = getBranchQuery(req);
    const users = await User.find(branchQuery).select("-password").populate("department", "name").sort({ name: 1 })

    // Add blackhole indicator
    const usersWithIndicators = users.map(user => ({
      ...user.toObject(),
      isBlackhole: isValidOrgEmail(user.email),
      canBeAssigned: isValidOrgEmail(user.email) && user.stillExist === 1
    }));

    res.json(usersWithIndicators)
  } catch (error) {
    console.error("Error fetching all users:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// @route   GET api/admin/users/:id
// @desc    Get user by ID - SHOW ALL USERS
// @access  Admin or Manager (of user's department) or Self
router.get("/users/:id", auth, async (req, res) => {
  try {
    const userId = req.params.id

    // Allow users to access their own data
    if (userId !== req.user.id) {
      // Check if admin
      if (req.user.role !== "Admin") {
        // Check if manager of user's department
        if (req.user.role === "Manager") {
          const user = await User.findById(userId)
          const manager = await User.findById(req.user.id)

          if (
            !user ||
            !manager ||
            !user.department ||
            !manager.department ||
            user.department.toString() !== manager.department.toString()
          ) {
            return res.status(403).json({ error: "Not authorized to access this user" })
          }
        } else {
          return res.status(403).json({ error: "Not authorized to access this user" })
        }
      }
    }

    const user = await User.findById(userId).select("-password").populate("department", "name color")

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    const userObj = user.toObject();
    userObj.isBlackhole = isValidOrgEmail(user.email);
    userObj.canBeAssigned = userObj.isBlackhole && user.stillExist === 1;

    res.json(userObj)
  } catch (error) {
    console.error("Error fetching user:", error)
    if (error.kind === "ObjectId") {
      return res.status(404).json({ error: "User not found" })
    }
    res.status(500).json({ error: "Server error" })
  }
})

// @route   POST api/admin/users
// @desc    Create a new user - ONLY ALLOW BLACKHOLE EMAILS
// @access  Admin only
router.post("/users", auth, adminAuth, async (req, res) => {
  try {
    const { name, email, password, role, department, avatar, branch } = req.body

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" })
    }

    if (!isValidOrgEmail(email)) {
      return res.status(400).json({ error: ORG_EMAIL_ERROR })
    }

    // Check if user with the same email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() })
    if (existingUser) {
      return res.status(400).json({ error: "User with this email already exists" })
    }

    // Create new user (stillExist defaults to 1)
    const newUser = new User({
      name,
      email: email.toLowerCase(),
      password, // Store password directly without hashing
      role: role || "User",
      department: (department && department !== "" && department !== "null") ? department : null,
      avatar: avatar || null,
      branch: branch || "blackhole_mumbai",
      stillExist: 1 // Default to active
    })

    const user = await newUser.save()

    // If department is specified, add user to department members
    if (department) {
      await Department.findByIdAndUpdate(department, { $addToSet: { members: user._id } })
    }

    // Notify connected clients about the new user
    if (req.io) {
      const userToSend = { ...user.toObject() }
      delete userToSend.password
      req.io.emit("user:created", userToSend)
    }

    // Return user without password
    const userResponse = { ...user.toObject() }
    delete userResponse.password
    userResponse.isBlackhole = isValidOrgEmail(user.email);
    userResponse.canBeAssigned = userResponse.isBlackhole;

    res.json(userResponse)
  } catch (error) {
    console.error("Error creating user:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// @route   PUT api/admin/users/:id
// @desc    Update a user
// @access  Admin or Self (limited fields)
router.put("/users/:id", auth, async (req, res) => {
  try {
    const userId = req.params.id
    const { name, email, password, role, department, avatar, stillExist } = req.body

    // Check if user exists
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // Check permissions
    const isSelf = req.user.id === userId
    const isAdminUser = req.user.role === "Admin"

    // Only admins can change roles, departments, or stillExist status
    if ((role !== undefined || department !== undefined || stillExist !== undefined) && !isAdminUser) {
      return res.status(403).json({ error: "Not authorized to change role, department, or status" })
    }

    // If not admin and not self, deny access
    if (!isAdminUser && !isSelf) {
      return res.status(403).json({ error: "Not authorized to update this user" })
    }

    // Check if email is being changed and if it conflicts with existing users
    if (email && email.toLowerCase() !== user.email) {
      if (!isValidOrgEmail(email)) {
        return res.status(400).json({ error: ORG_EMAIL_ERROR })
      }

      const existingUser = await User.findOne({ email: email.toLowerCase() })
      if (existingUser) {
        return res.status(400).json({ error: "User with this email already exists" })
      }
      user.email = email.toLowerCase()
    }

    // Update user fields
    if (name) user.name = name
    if (avatar !== undefined) user.avatar = avatar

    // Handle password update (without bcrypt)
    if (password) {
      user.password = password // Store password directly without hashing
    }

    // Handle role update (admin only)
    if (isAdminUser && role) {
      user.role = role
    }

    // Handle stillExist update (admin only)
    if (isAdminUser && stillExist !== undefined) {
      user.stillExist = stillExist
    }

    // Handle department change (admin only)
    if (isAdminUser && department !== undefined) {
      const oldDepartment = user.department
      user.department = department

      // If department changed, update department members
      if (oldDepartment !== department) {
        // Remove from old department if exists
        if (oldDepartment) {
          await Department.findByIdAndUpdate(oldDepartment, { $pull: { members: userId } })

          // If user was the lead of old department, remove lead
          const oldDept = await Department.findById(oldDepartment)
          if (oldDept && oldDept.lead && oldDept.lead.toString() === userId) {
            oldDept.lead = null
            await oldDept.save()
          }
        }

        // Add to new department if exists
        if (department) {
          await Department.findByIdAndUpdate(department, { $addToSet: { members: userId } })
        }
      }
    }

    user.updatedAt = Date.now()
    await user.save()

    // Notify connected clients about the updated user
    if (req.io) {
      const userToSend = { ...user.toObject() }
      delete userToSend.password
      req.io.emit("user:updated", userToSend)
    }

    // Return user without password
    const userResponse = { ...user.toObject() }
    delete userResponse.password
    userResponse.isBlackhole = isValidOrgEmail(user.email);
    userResponse.canBeAssigned = userResponse.isBlackhole && user.stillExist === 1;

    res.json(userResponse)
  } catch (error) {
    console.error("Error updating user:", error)
    if (error.kind === "ObjectId") {
      return res.status(404).json({ error: "User not found" })
    }
    res.status(500).json({ error: "Server error" })
  }
})

// @route   PUT api/admin/users/:id/status
// @desc    Update user status (stillExist field)
// @access  Admin only
router.put("/users/:id/status", auth, adminAuth, async (req, res) => {
  try {
    const userId = req.params.id
    const { stillExist } = req.body

    if (stillExist !== 0 && stillExist !== 1) {
      return res.status(400).json({ error: "stillExist must be 0 or 1" })
    }

    // Prevent changing your own status
    if (userId === req.user.id) {
      return res.status(400).json({ error: "Cannot change your own status" })
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { stillExist } },
      { new: true }
    ).select("-password").populate("department", "name")

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // Notify connected clients about the status change
    if (req.io) {
      req.io.emit("user:statusUpdated", {
        userId,
        stillExist,
        user
      })
    }

    res.json({
      success: true,
      message: stillExist === 1 ? "User reactivated successfully" : "User marked as exited successfully",
      user
    })
  } catch (error) {
    console.error("Error updating user status:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// @route   DELETE api/admin/users/:id
// @desc    Delete a user
// @access  Admin only
router.delete("/users/:id", auth, adminAuth, async (req, res) => {
  try {
    const userId = req.params.id

    // Prevent deleting yourself
    if (userId === req.user.id) {
      return res.status(400).json({ error: "Cannot delete your own account" })
    }

    // Find user
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // Check if there are tasks assigned to this user
    const tasksCount = await Task.countDocuments({ assignee: userId })
    if (tasksCount > 0) {
      return res.status(400).json({
        error: "Cannot delete user with assigned tasks. Consider marking as exited instead.",
      })
    }

    // If user is in a department, update department
    if (user.department) {
      // Remove from department members
      await Department.findByIdAndUpdate(user.department, { $pull: { members: userId } })

      // If user is department lead, remove lead
      const dept = await Department.findById(user.department)
      if (dept && dept.lead && dept.lead.toString() === userId) {
        dept.lead = null
        await dept.save()
      }
    }

    // Delete the user
    await User.findByIdAndDelete(userId)

    // Notify connected clients about the deleted user
    if (req.io) {
      req.io.emit("user:deleted", { _id: userId })
    }

    res.json({ message: "User deleted successfully" })
  } catch (error) {
    console.error("Error deleting user:", error)
    if (error.kind === "ObjectId") {
      return res.status(404).json({ error: "User not found" })
    }
    res.status(500).json({ error: "Server error" })
  }
})

// @route   GET api/admin/users/role/:role
// @desc    Get users by role - FILTERED BY BRANCH
// @access  Admin or Manager
router.get("/users/role/:role", auth, async (req, res) => {
  try {
    const { role } = req.params
    const branchQuery = getBranchQuery(req);

    // Validate role
    if (!["Admin", "Manager", "User"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" })
    }

    const baseFilter = {
      role,
      stillExist: 1,
      ...branchQuery
    }

    // If manager, only return users from their department
    if (req.user.role === "Manager") {
      const manager = await User.findById(req.user.id)
      if (!manager.department) {
        return res.json([])
      }

      const users = await User.find({
        ...baseFilter,
        department: manager.department,
      })
        .select("-password")
        .sort({ name: 1 })

      // Add blackhole indicator
      const usersWithIndicators = users.map(user => ({
        ...user.toObject(),
        isBlackhole: isValidOrgEmail(user.email),
        canBeAssigned: isValidOrgEmail(user.email)
      }));

      return res.json(usersWithIndicators)
    }

    // For admins, return users with the specified role filtered by branch
    const users = await User.find(baseFilter).select("-password").sort({ name: 1 })

    // Add blackhole indicator
    const usersWithIndicators = users.map(user => ({
      ...user.toObject(),
      isBlackhole: isValidOrgEmail(user.email),
      canBeAssigned: isValidOrgEmail(user.email)
    }));

    res.json(usersWithIndicators)
  } catch (error) {
    console.error("Error fetching users by role:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// @route   GET api/admin/users/search
// @desc    Search users by name or email - FILTERED BY BRANCH
// @access  Admin or Manager
router.get("/users/search", auth, async (req, res) => {
  try {
    const { query } = req.query
    const branchQuery = getBranchQuery(req);

    if (!query) {
      return res.status(400).json({ error: "Search query is required" })
    }

    const searchRegex = new RegExp(query, "i")
    const baseFilter = {
      stillExist: 1,
      $or: [{ name: searchRegex }, { email: searchRegex }],
      ...branchQuery
    }

    // If manager, only search users from their department
    if (req.user.role === "Manager") {
      const manager = await User.findById(req.user.id)
      if (!manager.department) {
        return res.json([])
      }

      const users = await User.find({
        ...baseFilter,
        department: manager.department,
      })
        .select("-password")
        .sort({ name: 1 })

      // Add blackhole indicator
      const usersWithIndicators = users.map(user => ({
        ...user.toObject(),
        isBlackhole: isValidOrgEmail(user.email),
        canBeAssigned: isValidOrgEmail(user.email)
      }));

      return res.json(usersWithIndicators)
    }

    // For admins, search users filtered by branch
    const users = await User.find(baseFilter)
      .select("-password")
      .sort({ name: 1 })

    // Add blackhole indicator
    const usersWithIndicators = users.map(user => ({
      ...user.toObject(),
      isBlackhole: isValidOrgEmail(user.email),
      canBeAssigned: isValidOrgEmail(user.email)
    }));

    res.json(usersWithIndicators)
  } catch (error) {
    console.error("Error searching users:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// ===== DEPARTMENT ROUTES =====

// @route   GET api/admin/departments
// @desc    Get all departments
// @access  Private
router.get("/departments", auth, async (req, res) => {
  try {
    const branchQuery = getBranchQuery(req);

    const departments = await Department.find({})
      .populate({
        path: "lead",
        select: "name email role stillExist branch",
        match: branchQuery.branch ? { branch: branchQuery.branch } : {}
      })
      .populate({
        path: "members",
        select: "name email role stillExist branch",
        match: branchQuery.branch ? { branch: branchQuery.branch } : {}
      })
      .sort({ name: 1 })

    // Filter out null members from populate
    const filteredDepartments = departments.map(dept => {
      const deptObj = dept.toObject();
      if (branchQuery.branch) {
        deptObj.members = deptObj.members.filter(m => m !== null);
      }
      return deptObj;
    });

    res.json(filteredDepartments)
  } catch (error) {
    console.error("Error fetching departments:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// @route   GET api/admin/departments/:id
// @desc    Get department by ID - FILTERED BY BRANCH
// @access  Private
router.get("/departments/:id", auth, async (req, res) => {
  try {
    const branchQuery = getBranchQuery(req);

    const department = await Department.findById(req.params.id)
      .populate({
        path: "lead",
        select: "name email role stillExist branch",
        match: branchQuery.branch ? { branch: branchQuery.branch } : {}
      })
      .populate({
        path: "members",
        select: "name email role stillExist branch",
        match: branchQuery.branch ? { branch: branchQuery.branch } : {}
      })

    if (!department) {
      return res.status(404).json({ error: "Department not found" })
    }

    // Filter out null members from populate
    const deptObj = department.toObject();
    if (branchQuery.branch) {
      deptObj.members = deptObj.members.filter(m => m !== null);
    }

    res.json(deptObj)
  } catch (error) {
    console.error("Error fetching department:", error)
    if (error.kind === "ObjectId") {
      return res.status(404).json({ error: "Department not found" })
    }
    res.status(500).json({ error: "Server error" })
  }
})

// @route   POST api/admin/departments
// @desc    Create a new department - ONLY ALLOW ACTIVE BLACKHOLE USERS FOR NEW ASSIGNMENTS
// @access  Admin only
router.post("/departments", auth, adminAuth, async (req, res) => {
  try {
    const { name, description, color, lead } = req.body

    // Check if department with the same name already exists
    const existingDepartment = await Department.findOne({ name })
    if (existingDepartment) {
      return res.status(400).json({ error: "Department with this name already exists" })
    }

    // If lead is specified, check if they are active and have org email
    if (lead) {
      const leadUser = await User.findOne({
        _id: lead,
        stillExist: 1,
        ...orgEmailMongoFilter(),
      })
      if (!leadUser) {
        return res.status(400).json({ error: "Lead user not found, not active, or not authorized" })
      }
    }

    // Create new department
    const newDepartment = new Department({
      name,
      description,
      color: color || "bg-blue-500",
      lead: lead || null,
      members: lead ? [lead] : [],
    })

    const department = await newDepartment.save()

    // If lead is specified, update the user's department
    if (lead) {
      await User.findByIdAndUpdate(lead, { department: department._id })
    }

    // Notify connected clients about the new department
    if (req.io) {
      req.io.emit("department:created", department)
    }

    res.json(department)
  } catch (error) {
    console.error("Error creating department:", error)

    if (error.code === 11000) {
      return res.status(400).json({ error: "Department with this name already exists" })
    }

    if (error.name === "CastError" || error.name === "ValidationError") {
      return res.status(400).json({ error: "Invalid department data provided" })
    }

    res.status(500).json({ error: "Server error" })
  }
})

// @route   PUT api/admin/departments/:id
// @desc    Update a department - ONLY ALLOW ACTIVE BLACKHOLE USERS FOR NEW ASSIGNMENTS
// @access  Admin only
router.put("/departments/:id", auth, adminAuth, async (req, res) => {
  try {
    const { name, description, color, lead } = req.body
    const departmentId = req.params.id

    // Check if department exists
    const department = await Department.findById(departmentId)
    if (!department) {
      return res.status(404).json({ error: "Department not found" })
    }

    // Check if name is being changed and if it conflicts with existing departments
    if (name && name !== department.name) {
      const existingDepartment = await Department.findOne({ name })
      if (existingDepartment) {
        return res.status(400).json({ error: "Department with this name already exists" })
      }
    }

    // If lead is being changed, check if new lead is active and has org email
    if (lead) {
      const leadUser = await User.findOne({
        _id: lead,
        stillExist: 1,
        ...orgEmailMongoFilter(),
      })
      if (!leadUser) {
        return res.status(400).json({ error: "Lead user not found, not active, or not authorized" })
      }
    }

    // Handle lead change
    const previousLead = department.lead

    // Update department fields
    department.name = name || department.name
    department.description = description !== undefined ? description : department.description
    department.color = color || department.color
    department.lead = lead || department.lead
    department.updatedAt = Date.now()

    // If lead is added, make sure they're in the members array
    if (lead && !department.members.includes(lead)) {
      department.members.push(lead)
    }

    await department.save()

    // If lead changed, update user departments
    if (lead && lead !== previousLead) {
      // Set new lead's department
      await User.findByIdAndUpdate(lead, { department: departmentId })

      // If there was a previous lead and they're not in the members array,
      // remove this department from their profile
      if (previousLead && !department.members.includes(previousLead)) {
        const previousLeadUser = await User.findById(previousLead)
        if (previousLeadUser && previousLeadUser.department && previousLeadUser.department.toString() === departmentId) {
          previousLeadUser.department = null
          await previousLeadUser.save()
        }
      }
    }

    // Notify connected clients about the updated department
    if (req.io) {
      req.io.emit("department:updated", department)
    }

    res.json(department)
  } catch (error) {
    console.error("Error updating department:", error)
    if (error.kind === "ObjectId") {
      return res.status(404).json({ error: "Department not found" })
    }
    res.status(500).json({ error: "Server error" })
  }
})

// @route   DELETE api/admin/departments/:id
// @desc    Delete a department
// @access  Admin only
router.delete("/departments/:id", auth, adminAuth, async (req, res) => {
  try {
    const departmentId = req.params.id

    // Find department
    const department = await Department.findById(departmentId)
    if (!department) {
      return res.status(404).json({ error: "Department not found" })
    }

    // Check if there are tasks assigned to this department
    const tasksCount = await Task.countDocuments({ department: departmentId })
    if (tasksCount > 0) {
      return res.status(400).json({
        error: "Cannot delete department with assigned tasks",
      })
    }

    // Update all users who belong to this department
    await User.updateMany(
      { department: departmentId },
      { $set: { department: null } }
    )

    // Delete the department
    await Department.findByIdAndDelete(departmentId)

    // Notify connected clients about the deleted department
    if (req.io) {
      req.io.emit("department:deleted", { _id: departmentId })
    }

    res.json({ message: "Department deleted successfully" })
  } catch (error) {
    console.error("Error deleting department:", error)
    if (error.kind === "ObjectId") {
      return res.status(404).json({ error: "Department not found" })
    }
    res.status(500).json({ error: "Server error" })
  }
})

// @route   PUT api/admin/departments/:id/members
// @desc    Add members to a department - ONLY ALLOW ACTIVE BLACKHOLE USERS FOR NEW ASSIGNMENTS
// @access  Admin or Manager
router.put("/departments/:id/members", auth, async (req, res) => {
  try {
    const { userIds } = req.body
    const departmentId = req.params.id

    if (!userIds || !Array.isArray(userIds)) {
      return res.status(400).json({ error: "User IDs array is required" })
    }

    // Check if department exists
    const department = await Department.findById(departmentId)
    if (!department) {
      return res.status(404).json({ error: "Department not found" })
    }

    // If user is a manager, they can only modify their own department
    if (req.user.role === "Manager" && department.lead && department.lead.toString() !== req.user.id) {
      return res.status(403).json({ error: "Not authorized to modify this department" })
    }

    // For NEW assignments, verify all users are active and have org emails
    const activeUsers = await User.find({
      _id: { $in: userIds },
      stillExist: 1,
      ...orgEmailMongoFilter(),
    })
    if (activeUsers.length !== userIds.length) {
      return res.status(400).json({ error: "Some users are not active, not found, or not authorized" })
    }

    // Add users to department members
    department.members = [...new Set([...department.members, ...userIds])]
    await department.save()

    // Update users' department field
    await User.updateMany({ _id: { $in: userIds } }, { $set: { department: departmentId } })

    // Notify connected clients
    if (req.io) {
      req.io.emit("department:membersUpdated", {
        departmentId,
        members: department.members,
      })
    }

    res.json(department)
  } catch (error) {
    console.error("Error adding members to department:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// @route   DELETE api/admin/departments/:id/members/:userId
// @desc    Remove a member from a department
// @access  Admin or Manager
router.delete("/departments/:id/members/:userId", auth, async (req, res) => {
  try {
    const departmentId = req.params.id
    const userId = req.params.userId

    // Check if department exists
    const department = await Department.findById(departmentId)
    if (!department) {
      return res.status(404).json({ error: "Department not found" })
    }

    // If user is a manager, they can only modify their own department
    if (req.user.role === "Manager" && department.lead && department.lead.toString() !== req.user.id) {
      return res.status(403).json({ error: "Not authorized to modify this department" })
    }

    // Cannot remove the lead from members
    if (department.lead && department.lead.toString() === userId) {
      return res.status(400).json({ error: "Cannot remove department lead from members" })
    }

    // Remove user from department members
    department.members = department.members.filter((member) => member.toString() !== userId)
    await department.save()

    // Update user's department field
    await User.findByIdAndUpdate(userId, { department: null })

    // Notify connected clients
    if (req.io) {
      req.io.emit("department:memberRemoved", {
        departmentId,
        userId,
        members: department.members,
      })
    }

    res.json(department)
  } catch (error) {
    console.error("Error removing member from department:", error)
    res.status(500).json({ error: "Server error" })
  }
})

// @route   GET api/admin/departments/:id/tasks
// @desc    Get tasks by department - SHOW ALL EXISTING ASSIGNEES
// @access  Admin or Manager
router.get("/departments/:id/tasks", auth, async (req, res) => {
  try {
    const { status } = req.query
    const departmentId = req.params.id

    // If manager, check if they belong to the requested department
    if (req.user.role === "Manager") {
      const manager = await User.findById(req.user.id)
      if (!manager.department || manager.department.toString() !== departmentId) {
        return res.status(403).json({ error: "Not authorized to access this department's tasks" })
      }
    }

    // Build filter object
    const filter = { department: departmentId }
    if (status) filter.status = status

    const tasks = await Task.find(filter)
      .populate("dependencies", "title status")

    // Handle assignee population manually - SHOW ALL EXISTING ASSIGNEES
    const tasksWithAssignees = await Promise.all(tasks.map(async (task) => {
      const taskObj = task.toObject()

      if (!task.assignee) {
        taskObj.assignee = null
        return taskObj
      }

      // Get the actual user without filtering - SHOW EXISTING ASSIGNEES
      const actualUser = await User.findById(task.assignee).select("name avatar email stillExist")

      if (!actualUser) {
        taskObj.assignee = null
        return taskObj
      }

      // Always show the assignee, but with status indicators
      const isActive = actualUser.stillExist === 1
      const isBlackhole = isValidOrgEmail(actualUser.email)

      taskObj.assignee = {
        _id: actualUser._id,
        name: actualUser.name,
        avatar: actualUser.avatar,
        email: actualUser.email,
        stillExist: actualUser.stillExist,
        isActive,
        isBlackhole,
        status: !isActive ? 'inactive' : !isBlackhole ? 'non-blackhole' : 'active'
      }

      return taskObj
    }))

    res.json(tasksWithAssignees)
  } catch (error) {
    console.error("Error fetching department tasks:", error)
    if (error.kind === "ObjectId") {
      return res.status(404).json({ error: "Department not found" })
    }
    res.status(500).json({ error: "Server error" })
  }
})

module.exports = router