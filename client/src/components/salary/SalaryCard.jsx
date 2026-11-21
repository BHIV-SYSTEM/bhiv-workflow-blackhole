import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  DollarSign, 
  User, 
  Calendar, 
  TrendingUp, 
  TrendingDown,
  Clock,
  MapPin,
  Edit,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Award,
  AlertCircle,
  CheckCircle,
  Building
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Separator } from '../ui/separator';

const SalaryCard = ({ data, onEdit }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSalary, setShowSalary] = useState(false);

  if (!data || !data.user) {
    return (
      <Card className="border border-red-200 bg-red-50">
        <CardContent className="p-6 text-center">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-700">Invalid salary data</p>
        </CardContent>
      </Card>
    );
  }

  const { user, salary, attendance, status } = data;

  // Get tag color
  const getTagColor = (tag) => {
    const colors = {
      'Employee': 'bg-blue-100 text-blue-800 border-blue-200',
      'Intern': 'bg-green-100 text-green-800 border-green-200',
      'Contractor': 'bg-orange-100 text-orange-800 border-orange-200',
      'Freelancer': 'bg-purple-100 text-purple-800 border-purple-200',
      'Consultant': 'bg-pink-100 text-pink-800 border-pink-200'
    };
    return colors[tag] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  // Get attendance color
  const getAttendanceColor = (rate) => {
    if (rate >= 95) return 'text-green-600';
    if (rate >= 90) return 'text-blue-600';
    if (rate >= 85) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Format currency
  const formatCurrency = (amount, currency = 'USD') => {
    if (typeof amount !== 'number') return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Mask salary for privacy
  const maskSalary = (amount) => {
    return showSalary ? formatCurrency(amount, salary?.currency) : '••••••';
  };

  const cardVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { 
      opacity: 1, 
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 15
      }
    }
  };

  const expandVariants = {
    collapsed: { height: 0, opacity: 0 },
    expanded: { 
      height: 'auto', 
      opacity: 1,
      transition: {
        height: { duration: 0.3 },
        opacity: { duration: 0.2, delay: 0.1 }
      }
    }
  };

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover={{ 
        scale: 1.02,
        transition: { type: "spring", stiffness: 400, damping: 10 }
      }}
    >
      <Card className="overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-white via-gray-50 to-blue-50">
        {/* Gradient Header */}
        <div className="h-2 bg-gradient-to-r from-blue-500 via-purple-500 to-indigo-500" />
        
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            {/* User Info */}
            <div className="flex items-center gap-3">
              <motion.div
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                <Avatar className="w-12 h-12 border-2 border-white shadow-md">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="bg-gradient-to-br from-blue-400 to-purple-500 text-white font-medium">
                    {user.name?.split(' ').map(n => n[0]).join('') || 'U'}
                  </AvatarFallback>
                </Avatar>
              </motion.div>
              
              <div>
                <h3 className="font-semibold text-gray-900 text-lg">
                  {user.name || 'Unknown Employee'}
                </h3>
                <p className="text-sm text-gray-600">{user.email}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={`text-xs ${getTagColor(user.tag)}`}>
                    {user.tag || 'Employee'}
                  </Badge>
                  {salary?.payGrade && (
                    <Badge variant="outline" className="text-xs">
                      {salary.payGrade}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setShowSalary(!showSalary)}
                variant="ghost"
                size="sm"
                className="p-2"
              >
                {showSalary ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
              
              <Button
                onClick={onEdit}
                variant="ghost"
                size="sm"
                className="p-2"
              >
                <Edit className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Salary Information */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-600">Base Salary</span>
              <motion.span 
                className="text-lg font-bold text-gray-900"
                animate={{ scale: showSalary ? [1, 1.1, 1] : 1 }}
                transition={{ duration: 0.3 }}
              >
                {maskSalary(salary?.base)}
              </motion.span>
            </div>

            {salary?.calculated && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Net Salary</span>
                <motion.span 
                  className="text-xl font-bold bg-gradient-to-r from-green-600 to-blue-600 bg-clip-text text-transparent"
                  animate={{ scale: showSalary ? [1, 1.1, 1] : 1 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                >
                  {maskSalary(salary.calculated.netPay)}
                </motion.span>
              </div>
            )}
          </div>

          <Separator />

          {/* Attendance Information */}
          {attendance && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Attendance Rate</span>
                <span className={`text-sm font-bold ${getAttendanceColor(attendance.attendanceRate)}`}>
                  {attendance.attendanceRate}%
                </span>
              </div>
              
              <Progress 
                value={attendance.attendanceRate} 
                className="h-2"
              />

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="text-center">
                  <p className="text-gray-600">Working Days</p>
                  <p className="font-semibold">{attendance.workingDays}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-600">Attended</p>
                  <p className="font-semibold">{attendance.attendedDays}</p>
                </div>
              </div>
            </div>
          )}

          {/* Status Indicator */}
          {status && (
            <div className="flex items-center gap-2">
              {status === 'success' ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-500" />
              )}
              <span className={`text-sm ${status === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                {status === 'success' ? 'Calculation Complete' : 'Calculation Error'}
              </span>
            </div>
          )}

          {/* Expand/Collapse Button */}
          <Button
            onClick={() => setIsExpanded(!isExpanded)}
            variant="ghost"
            className="w-full flex items-center justify-center gap-2 text-sm"
          >
            {isExpanded ? 'Show Less' : 'Show Details'}
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>

          {/* Expanded Details */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                variants={expandVariants}
                initial="collapsed"
                animate="expanded"
                exit="collapsed"
                className="space-y-4 pt-4 border-t border-gray-200"
              >
                {/* Salary Breakdown */}
                {salary?.calculated && showSalary && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-gray-900">Salary Breakdown</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Base Pay</span>
                        <span>{formatCurrency(salary.calculated.basePay, salary.currency)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Allowances</span>
                        <span className="text-green-600">+{formatCurrency(salary.calculated.allowances, salary.currency)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Adjustments</span>
                        <span className="text-blue-600">+{formatCurrency(salary.calculated.adjustments, salary.currency)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Deductions</span>
                        <span className="text-red-600">-{formatCurrency(salary.calculated.deductions || 0, salary.currency)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-medium">
                        <span>Net Pay</span>
                        <span className="text-green-600">{formatCurrency(salary.calculated.netPay, salary.currency)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Additional Info */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600 mb-1">Employee ID</p>
                    <p className="font-medium">{user.id}</p>
                  </div>
                  <div>
                    <p className="text-gray-600 mb-1">Currency</p>
                    <p className="font-medium">{salary?.currency || 'USD'}</p>
                  </div>
                </div>

                {/* Performance Indicators */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm font-medium">Performance</span>
                  </div>
                  <Badge variant="outline" className="bg-white">
                    {attendance?.attendanceRate >= 95 ? 'Excellent' : 
                     attendance?.attendanceRate >= 90 ? 'Good' : 
                     attendance?.attendanceRate >= 85 ? 'Average' : 'Needs Improvement'}
                  </Badge>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>

        {/* Animated Background Pattern */}
        <motion.div
          animate={{
            backgroundPosition: ['0% 0%', '100% 100%'],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            repeatType: 'reverse',
            ease: 'linear'
          }}
          className="absolute inset-0 opacity-5 pointer-events-none"
          style={{
            background: 'linear-gradient(45deg, #3b82f6, #8b5cf6, #06b6d4)',
            backgroundSize: '200% 200%',
          }}
        />
      </Card>
    </motion.div>
  );
};

export default SalaryCard;
