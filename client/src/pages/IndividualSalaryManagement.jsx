import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  DollarSign, 
  Users, 
  Search, 
  Edit, 
  Save, 
  X, 
  Plus,
  Trash2,
  Eye,
  ArrowLeft
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { useAuth } from '../context/auth-context';
import api from '../lib/api';
import { sortBySurname } from '../utils/nameSorting';

const IndividualSalaryManagement = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [editingUser, setEditingUser] = useState(null);
  const [salaryForm, setSalaryForm] = useState({
    baseSalary: '',
    currency: 'INR',
    salaryType: 'Monthly',
    payGrade: 'B1'
  });
  const [loading, setLoading] = useState(false);

  // Check if user has admin access
  const isAdmin = user?.role === 'Admin';

  useEffect(() => {
    if (!isAdmin) {
      navigate('/dashboard');
      return;
    }
    fetchUsers();
    fetchDepartments();
  }, [isAdmin, navigate]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await api.users.getUsers();
      console.log('Users response:', response);
      
      // Handle API response format
      const usersData = response.success ? response.data : response;
      setUsers(Array.isArray(usersData) ? usersData : []);
    } catch (error) {
      console.error('Error fetching users:', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await api.departments.getDepartments();
      console.log('Departments response:', response);
      
      // Handle API response format
      const data = response.success ? response.data : response;
      setDepartments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching departments:', error);
      setDepartments([]);
    }
  };

  const handleEditSalary = (user) => {
    setEditingUser(user);
    setSalaryForm({
      baseSalary: user.salary?.baseSalary || '',
      currency: user.salary?.currency || 'INR',
      salaryType: user.salary?.salaryType || 'Monthly',
      payGrade: user.salary?.payGrade || 'B1'
    });
  };

  const handleSaveSalary = async () => {
    if (!editingUser || !salaryForm.baseSalary) {
      alert('Please enter a valid salary amount');
      return;
    }

    try {
      setLoading(true);
      
      const salaryData = {
        user: editingUser._id,
        baseSalary: parseFloat(salaryForm.baseSalary),
        currency: salaryForm.currency,
        salaryType: salaryForm.salaryType,
        payGrade: salaryForm.payGrade,
        allowances: [
          {
            type: 'Basic',
            amount: parseFloat(salaryForm.baseSalary),
            percentage: 100,
            description: 'Base salary',
            isRecurring: true
          }
        ],
        deductions: [
          {
            type: 'Tax',
            amount: parseFloat(salaryForm.baseSalary) * 0.1,
            percentage: 10,
            description: 'Income tax',
            isRecurring: true
          }
        ],
        effectiveDate: new Date(),
        isActive: true
      };

      // Create or update salary
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/salary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(salaryData)
      });

      if (response.ok) {
        alert('Salary updated successfully!');
        setEditingUser(null);
        fetchUsers(); // Refresh the list
      } else {
        const error = await response.json();
        alert(`Error: ${error.message || 'Failed to update salary'}`);
      }
    } catch (error) {
      console.error('Error saving salary:', error);
      alert('Error saving salary. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingUser(null);
    setSalaryForm({
      baseSalary: '',
      currency: 'INR',
      salaryType: 'Monthly',
      payGrade: 'B1'
    });
  };

  // Filter users based on search and department
  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.email?.toLowerCase().includes(searchQuery.toLowerCase());

    // Handle department filtering - department can be an object or string
    const userDepartmentId = user.department?._id || user.department;
    const matchesDepartment = selectedDepartment === 'all' || userDepartmentId === selectedDepartment;

    return matchesSearch && matchesDepartment;
  });

  const sortedFilteredUsers = sortBySurname(filteredUsers);

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
        <div className="max-w-2xl mx-auto">
          <Card className="text-center p-8">
            <CardContent>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h2>
              <p className="text-gray-600 mb-6">You need admin privileges to access salary management.</p>
              <Button onClick={() => navigate('/dashboard')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-green-600 via-blue-600 to-purple-600 bg-clip-text text-transparent">
              Individual Salary Management
            </h1>
            <p className="text-gray-600 mt-1">
              Set and manage individual employee salaries
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => navigate('/salary-management')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Salary Overview
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <Label htmlFor="search">Search Employees</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    id="search"
                    placeholder="Search by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              
              <div className="w-full md:w-48">
                <Label htmlFor="department">Department</Label>
                <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Departments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {Array.isArray(departments) && departments.map(dept => (
                      <SelectItem key={dept._id} value={dept._id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Users List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            Array.from({ length: 6 }).map((_, index) => (
              <Card key={index} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-4 bg-gray-200 rounded mb-4" />
                  <div className="h-8 bg-gray-200 rounded mb-2" />
                  <div className="h-3 bg-gray-200 rounded w-2/3" />
                </CardContent>
              </Card>
            ))
          ) : sortedFilteredUsers.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No employees found</h3>
              <p className="text-gray-600">Try adjusting your search or filter criteria.</p>
            </div>
          ) : (
            sortedFilteredUsers.map((employee) => (
              <Card key={employee._id} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={employee.avatar} />
                      <AvatarFallback>
                        {employee.name?.split(' ').map(n => n[0]).join('') || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{employee.name}</h3>
                      <p className="text-sm text-gray-600">{employee.email}</p>
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Department:</span>
                      <span className="font-medium">
                        {employee.department?.name || employee.department || 'Not assigned'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Role:</span>
                      <Badge variant="outline">{employee.role}</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Current Salary:</span>
                      <span className="font-medium text-green-600">
                        {employee.salary?.baseSalary ? 
                          `₹${employee.salary.baseSalary.toLocaleString()}/month` : 
                          'Not set'
                        }
                      </span>
                    </div>
                  </div>

                  {editingUser?._id === employee._id ? (
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="salary">Base Salary (₹)</Label>
                        <Input
                          id="salary"
                          type="number"
                          placeholder="Enter salary amount"
                          value={salaryForm.baseSalary}
                          onChange={(e) => setSalaryForm(prev => ({ ...prev, baseSalary: e.target.value }))}
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label htmlFor="currency">Currency</Label>
                          <Select value={salaryForm.currency} onValueChange={(value) => setSalaryForm(prev => ({ ...prev, currency: value }))}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="INR">INR (₹)</SelectItem>
                              <SelectItem value="USD">USD ($)</SelectItem>
                              <SelectItem value="EUR">EUR (€)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div>
                          <Label htmlFor="payGrade">Pay Grade</Label>
                          <Select value={salaryForm.payGrade} onValueChange={(value) => setSalaryForm(prev => ({ ...prev, payGrade: value }))}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="A1">A1</SelectItem>
                              <SelectItem value="A2">A2</SelectItem>
                              <SelectItem value="B1">B1</SelectItem>
                              <SelectItem value="B2">B2</SelectItem>
                              <SelectItem value="C1">C1</SelectItem>
                              <SelectItem value="C2">C2</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button onClick={handleSaveSalary} disabled={loading} className="flex-1">
                          <Save className="w-4 h-4 mr-2" />
                          Save
                        </Button>
                        <Button variant="outline" onClick={handleCancelEdit} className="flex-1">
                          <X className="w-4 h-4 mr-2" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button onClick={() => handleEditSalary(employee)} className="w-full">
                      <Edit className="w-4 h-4 mr-2" />
                      Edit Salary
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default IndividualSalaryManagement;
