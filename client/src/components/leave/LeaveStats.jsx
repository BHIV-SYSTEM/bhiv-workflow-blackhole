import React from 'react';
import { motion } from 'framer-motion';
import { Calendar, Clock, CheckCircle, XCircle, AlertCircle, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Progress } from '../ui/progress';

const LeaveStats = ({ data }) => {
  if (!data) return null;

  const statsCards = [
    {
      title: 'Total Leave Days',
      value: data.totalDays || 0,
      icon: Calendar,
      color: 'from-blue-500 to-blue-600',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-600',
      description: 'This year'
    },
    {
      title: 'Approved Requests',
      value: data.approvedRequests || 0,
      icon: CheckCircle,
      color: 'from-green-500 to-green-600',
      bgColor: 'bg-green-50',
      textColor: 'text-green-600',
      description: 'Successfully approved'
    },
    {
      title: 'Pending Requests',
      value: data.pendingRequests || 0,
      icon: Clock,
      color: 'from-yellow-500 to-yellow-600',
      bgColor: 'bg-yellow-50',
      textColor: 'text-yellow-600',
      description: 'Awaiting approval'
    },
    {
      title: 'Rejected Requests',
      value: data.rejectedRequests || 0,
      icon: XCircle,
      color: 'from-red-500 to-red-600',
      bgColor: 'bg-red-50',
      textColor: 'text-red-600',
      description: 'Not approved'
    }
  ];

  const leaveBalance = {
    sick: { used: data.sickDaysUsed || 0, total: 12 },
    vacation: { used: data.vacationDaysUsed || 0, total: 21 },
    personal: { used: data.personalDaysUsed || 0, total: 5 }
  };

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

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {statsCards.map((card, index) => {
          const Icon = card.icon;
          
          return (
            <motion.div
              key={card.title}
              variants={cardVariants}
              whileHover={{ 
                scale: 1.02,
                transition: { type: "spring", stiffness: 400, damping: 10 }
              }}
            >
              <Card className="relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300">
                {/* Gradient Background */}
                <div className={`absolute inset-0 bg-gradient-to-br ${card.color} opacity-5`} />
                
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
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Leave Balance */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-600" />
              Leave Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(leaveBalance).map(([type, balance], index) => {
                const percentage = (balance.used / balance.total) * 100;
                const remaining = balance.total - balance.used;
                
                return (
                  <motion.div
                    key={type}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.8 + index * 0.1 }}
                    className="space-y-2"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium capitalize">{type} Leave</span>
                      <span className="text-gray-600">
                        {balance.used} / {balance.total} days used
                      </span>
                    </div>
                    
                    <motion.div
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ 
                        delay: 1 + index * 0.1,
                        duration: 1,
                        ease: "easeOut"
                      }}
                    >
                      <Progress 
                        value={percentage} 
                        className="h-2"
                      />
                    </motion.div>
                    
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{remaining} days remaining</span>
                      <span>{percentage.toFixed(1)}% used</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

export default LeaveStats;
