import React from 'react';
import { motion } from 'framer-motion';
import { 
  Users, 
  UserCheck, 
  UserX, 
  Clock, 
  TrendingUp, 
  TrendingDown,
  Minus,
  CheckCircle,
  AlertTriangle,
  Activity
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';

const AttendanceSummary = ({ data }) => {
  if (!data) return null;

  const summaryCards = [
    {
      title: 'Total Employees',
      value: data.totalEmployees || 0,
      icon: Users,
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-600',
      change: null,
      description: 'Active employees'
    },
    {
      title: 'Present Today',
      value: data.presentCount || 0,
      icon: UserCheck,
      color: 'from-green-500 to-green-600',
      bgColor: 'bg-green-50',
      textColor: 'text-green-600',
      change: data.presentChange || 0,
      description: 'Currently present'
    },
    {
      title: 'Absent Today',
      value: data.absentCount || 0,
      icon: UserX,
      color: 'from-red-500 to-red-600',
      bgColor: 'bg-red-50',
      textColor: 'text-red-600',
      change: data.absentChange || 0,
      description: 'Currently absent'
    },
    {
      title: 'Attendance Rate',
      value: `${data.attendanceRate || 0}%`,
      icon: Activity,
      color: 'from-purple-500 to-purple-600',
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-600',
      change: data.attendanceRateChange || 0,
      description: 'Overall rate'
    },
    {
      title: 'Average Hours',
      value: `${data.avgHours || 0}h`,
      icon: Clock,
      color: 'from-orange-500 to-orange-600',
      bgColor: 'bg-orange-50',
      textColor: 'text-orange-600',
      change: data.avgHoursChange || 0,
      description: 'Per employee'
    },
    {
      title: 'Verified Records',
      value: data.verifiedCount || 0,
      icon: CheckCircle,
      color: 'from-teal-500 to-teal-600',
      bgColor: 'bg-teal-50',
      textColor: 'text-teal-600',
      change: data.verifiedChange || 0,
      description: 'Verified attendance'
    }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const cardVariants = {
    hidden: { 
      opacity: 0, 
      y: 20,
      scale: 0.95
    },
    visible: { 
      opacity: 1, 
      y: 0,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 15
      }
    }
  };

  const getChangeIcon = (change) => {
    if (change > 0) return TrendingUp;
    if (change < 0) return TrendingDown;
    return Minus;
  };

  const getChangeColor = (change) => {
    if (change > 0) return 'text-green-500';
    if (change < 0) return 'text-red-500';
    return 'text-gray-500';
  };

  const formatChange = (change) => {
    if (change === 0) return '0%';
    const sign = change > 0 ? '+' : '';
    return `${sign}${change}%`;
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4"
    >
      {summaryCards.map((card, index) => {
        const Icon = card.icon;
        const ChangeIcon = getChangeIcon(card.change);
        
        return (
          <motion.div
            key={card.title}
            variants={cardVariants}
            whileHover={{ 
              scale: 1.02,
              transition: { type: "spring", stiffness: 400, damping: 10 }
            }}
            whileTap={{ scale: 0.98 }}
          >
            <Card className="relative overflow-hidden border-2 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300">
              {/* Gradient Background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${card.color} opacity-5`} />
              
              {/* Animated Background Pattern */}
              <div className="absolute inset-0 opacity-5">
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
                  className="w-full h-full bg-gradient-to-br from-transparent via-white to-transparent"
                  style={{
                    backgroundSize: '200% 200%',
                  }}
                />
              </div>

              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-sm font-medium text-gray-600">
                  {card.title}
                </CardTitle>
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ 
                    delay: index * 0.1 + 0.2,
                    type: "spring",
                    stiffness: 200,
                    damping: 15
                  }}
                  className={`p-2 rounded-lg ${card.bgColor}`}
                >
                  <Icon className={`w-4 h-4 ${card.textColor}`} />
                </motion.div>
              </CardHeader>

              <CardContent className="relative z-10">
                <div className="flex items-center justify-between">
                  <div>
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ 
                        delay: index * 0.1 + 0.4,
                        type: "spring",
                        stiffness: 200,
                        damping: 15
                      }}
                      className="text-2xl font-bold text-gray-900"
                    >
                      {card.value}
                    </motion.div>
                    <p className="text-xs text-gray-500 mt-1">
                      {card.description}
                    </p>
                  </div>

                  {/* Change Indicator */}
                  {card.change !== null && (
                    <motion.div
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 + 0.6 }}
                      className="flex items-center gap-1"
                    >
                      <ChangeIcon className={`w-3 h-3 ${getChangeColor(card.change)}`} />
                      <span className={`text-xs font-medium ${getChangeColor(card.change)}`}>
                        {formatChange(card.change)}
                      </span>
                    </motion.div>
                  )}
                </div>

                {/* Progress Bar for Percentage Values */}
                {card.title.includes('Rate') && (
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ 
                      delay: index * 0.1 + 0.8,
                      duration: 1,
                      ease: "easeOut"
                    }}
                    className="mt-3"
                  >
                    <Progress 
                      value={parseInt(card.value)} 
                      className="h-2"
                      style={{
                        background: `linear-gradient(to right, ${card.color.split(' ')[1]}, ${card.color.split(' ')[3]})`
                      }}
                    />
                  </motion.div>
                )}

                {/* Animated Pulse for Active Status */}
                {(card.title.includes('Present') || card.title.includes('Active')) && (
                  <motion.div
                    animate={{
                      scale: [1, 1.1, 1],
                      opacity: [0.5, 1, 0.5]
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    className={`absolute top-2 right-2 w-2 h-2 rounded-full ${card.bgColor.replace('bg-', 'bg-').replace('-50', '-400')}`}
                  />
                )}
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </motion.div>
  );
};

export default AttendanceSummary;
