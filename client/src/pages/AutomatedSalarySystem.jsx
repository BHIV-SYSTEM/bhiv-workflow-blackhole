import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Calculator, 
  Users, 
  MapPin, 
  Upload, 
  DollarSign,
  Clock,
  Activity,
  FileText,
  CheckCircle,
  ArrowRight,
  Zap,
  Target,
  TrendingUp,
  Shield,
  Smartphone,
  Globe
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useNavigate } from 'react-router-dom';

const AutomatedSalarySystem = () => {
  const navigate = useNavigate();
  const [activeFeature, setActiveFeature] = useState(null);

  const features = [
    {
      id: 'location-tracking',
      title: 'Location-Based Attendance',
      description: 'Start day button only works when physically at office location',
      icon: MapPin,
      color: 'from-blue-500 to-cyan-500',
      route: '/real-time-tracker',
      status: 'Implemented',
      details: [
        'GPS-based location validation',
        'Configurable office radius',
        'Remote work allowance settings',
        'Real-time location tracking'
      ]
    },
    {
      id: 'live-dashboard',
      title: 'Live Attendance Dashboard',
      description: 'Real-time monitoring of employee attendance with beautiful UI',
      icon: Activity,
      color: 'from-green-500 to-emerald-500',
      route: '/live-attendance',
      status: 'Implemented',
      details: [
        'Real-time attendance updates',
        'Present/absent employee counts',
        'Average attendance metrics',
        'Live status indicators'
      ]
    },
    {
      id: 'leave-management',
      title: 'Leave Management System',
      description: 'Complete leave request and approval workflow',
      icon: FileText,
      color: 'from-purple-500 to-pink-500',
      route: '/leave-form',
      status: 'Implemented',
      details: [
        'Leave request submission',
        'Approval workflow',
        'Leave balance tracking',
        'Document upload support'
      ]
    },
    {
      id: 'biometric-upload',
      title: 'Biometric Excel Processing',
      description: 'Upload and process biometric data with comparison analysis',
      icon: Upload,
      color: 'from-orange-500 to-red-500',
      route: '/attendance-dashboard',
      status: 'Implemented',
      details: [
        'Excel file upload and parsing',
        'Automatic employee matching',
        'Data validation and preview',
        'Discrepancy detection'
      ]
    },
    {
      id: 'salary-calculation',
      title: 'Automated Salary Engine',
      description: 'Compare biometric vs start day data for genuine salary calculation',
      icon: Calculator,
      color: 'from-indigo-500 to-purple-500',
      route: '/salary-dashboard',
      status: 'Implemented',
      details: [
        'Biometric vs start day comparison',
        'Genuine working hours calculation',
        'Automated deductions and bonuses',
        'Discrepancy analysis'
      ]
    },
    {
      id: 'salary-management',
      title: 'Salary Management Dashboard',
      description: 'Comprehensive salary management with working days configuration',
      icon: DollarSign,
      color: 'from-yellow-500 to-orange-500',
      route: '/salary-dashboard',
      status: 'Implemented',
      details: [
        'Bulk salary calculations',
        'Individual salary management',
        'Working days configuration',
        'Salary cards generation'
      ]
    },
    {
      id: 'real-time-tracking',
      title: 'Real-Time Attendance Tracking',
      description: 'Live attendance rendering with 8-hour completion validation',
      icon: Clock,
      color: 'from-teal-500 to-blue-500',
      route: '/real-time-tracker',
      status: 'Implemented',
      details: [
        'Live time tracking',
        '8-hour completion validation',
        'Progress indicators',
        'Status updates'
      ]
    },
    {
      id: 'employee-tagging',
      title: 'Employee/Intern Classification',
      description: 'Enhanced user model with employee type tagging',
      icon: Users,
      color: 'from-pink-500 to-rose-500',
      route: '/employee-monitoring',
      status: 'Implemented',
      details: [
        'Employee vs Intern tagging',
        'Salary grade classification',
        'Working hours configuration',
        'Attendance policy settings'
      ]
    }
  ];

  const systemStats = {
    totalFeatures: 8,
    implementedFeatures: 8,
    completionRate: 100,
    technologies: ['React', 'Node.js', 'MongoDB', 'Socket.io', 'Excel Processing']
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
          Automated Salary Analysis System
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Complete automation of attendance tracking, biometric data processing, and salary calculation 
          with real-time monitoring and comprehensive management features.
        </p>
        
        {/* System Stats */}
        <div className="flex flex-wrap justify-center gap-4 mt-6">
          <Badge className="bg-green-100 text-green-800 px-4 py-2">
            <CheckCircle className="w-4 h-4 mr-2" />
            {systemStats.implementedFeatures}/{systemStats.totalFeatures} Features Complete
          </Badge>
          <Badge className="bg-blue-100 text-blue-800 px-4 py-2">
            <Zap className="w-4 h-4 mr-2" />
            {systemStats.completionRate}% Implementation Rate
          </Badge>
          <Badge className="bg-purple-100 text-purple-800 px-4 py-2">
            <Target className="w-4 h-4 mr-2" />
            Production Ready
          </Badge>
        </div>
      </motion.div>

      {/* Features Grid */}
      <div className="max-w-7xl mx-auto">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 bg-white/80 backdrop-blur-sm">
            <TabsTrigger value="overview">System Overview</TabsTrigger>
            <TabsTrigger value="features">Feature Details</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature, index) => (
                <motion.div
                  key={feature.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.02 }}
                  className="cursor-pointer"
                  onClick={() => navigate(feature.route)}
                >
                  <Card className="h-full bg-white/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300">
                    <CardHeader className="pb-3">
                      <div className={`w-12 h-12 rounded-lg bg-gradient-to-r ${feature.color} flex items-center justify-center mb-3`}>
                        <feature.icon className="w-6 h-6 text-white" />
                      </div>
                      <CardTitle className="text-lg">{feature.title}</CardTitle>
                      <CardDescription className="text-sm">
                        {feature.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <Badge 
                          variant="outline" 
                          className="border-green-500 text-green-700 bg-green-50"
                        >
                          {feature.status}
                        </Badge>
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Quick Actions */}
            <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-yellow-500" />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Button
                    onClick={() => navigate('/real-time-tracker')}
                    className="h-16 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <Activity className="w-5 h-5" />
                      <span>Start Tracking</span>
                    </div>
                  </Button>
                  
                  <Button
                    onClick={() => navigate('/salary-dashboard')}
                    className="h-16 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <Calculator className="w-5 h-5" />
                      <span>Calculate Salaries</span>
                    </div>
                  </Button>
                  
                  <Button
                    onClick={() => navigate('/live-attendance')}
                    className="h-16 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <Users className="w-5 h-5" />
                      <span>Live Dashboard</span>
                    </div>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="features" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {features.map((feature, index) => (
                <motion.div
                  key={feature.id}
                  initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg bg-gradient-to-r ${feature.color} flex items-center justify-center`}>
                          <feature.icon className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{feature.title}</CardTitle>
                          <Badge variant="outline" className="border-green-500 text-green-700 bg-green-50 mt-1">
                            {feature.status}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-600 mb-4">{feature.description}</p>
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm text-gray-900">Key Features:</h4>
                        <ul className="space-y-1">
                          {feature.details.map((detail, i) => (
                            <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                              <CheckCircle className="w-3 h-3 text-green-500" />
                              {detail}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <Button
                        onClick={() => navigate(feature.route)}
                        variant="outline"
                        className="w-full mt-4"
                      >
                        Access Feature
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Technology Stack */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="max-w-4xl mx-auto mt-12"
      >
        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <Globe className="w-5 h-5 text-blue-500" />
              Technology Stack
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap justify-center gap-3">
              {systemStats.technologies.map((tech, index) => (
                <Badge
                  key={index}
                  variant="outline"
                  className="px-4 py-2 bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200"
                >
                  {tech}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default AutomatedSalarySystem;
