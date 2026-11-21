import React from 'react';
import { motion } from 'framer-motion';
import { 
  Trophy, 
  Medal, 
  Award, 
  Star, 
  Clock, 
  TrendingUp,
  User,
  Crown
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';

const TopPerformers = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-600" />
            Top Performers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64 text-gray-500">
            No performance data available
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort performers by attendance rate and limit to top 10
  const topPerformers = data
    .sort((a, b) => b.attendanceRate - a.attendanceRate)
    .slice(0, 10);

  const getRankIcon = (index) => {
    switch (index) {
      case 0:
        return { icon: Crown, color: 'text-yellow-500', bg: 'bg-yellow-100' };
      case 1:
        return { icon: Trophy, color: 'text-gray-400', bg: 'bg-gray-100' };
      case 2:
        return { icon: Medal, color: 'text-amber-600', bg: 'bg-amber-100' };
      default:
        return { icon: Star, color: 'text-blue-500', bg: 'bg-blue-100' };
    }
  };

  const getRankBadge = (index) => {
    switch (index) {
      case 0:
        return { text: '1st', variant: 'default', className: 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-white' };
      case 1:
        return { text: '2nd', variant: 'secondary', className: 'bg-gradient-to-r from-gray-400 to-gray-500 text-white' };
      case 2:
        return { text: '3rd', variant: 'default', className: 'bg-gradient-to-r from-amber-400 to-amber-500 text-white' };
      default:
        return { text: `${index + 1}th`, variant: 'outline', className: 'border-blue-200 text-blue-600' };
    }
  };

  const getPerformanceColor = (rate) => {
    if (rate >= 95) return 'text-green-600';
    if (rate >= 90) return 'text-blue-600';
    if (rate >= 85) return 'text-yellow-600';
    return 'text-gray-600';
  };

  const getProgressColor = (rate) => {
    if (rate >= 95) return 'bg-gradient-to-r from-green-400 to-green-500';
    if (rate >= 90) return 'bg-gradient-to-r from-blue-400 to-blue-500';
    if (rate >= 85) return 'bg-gradient-to-r from-yellow-400 to-yellow-500';
    return 'bg-gradient-to-r from-gray-400 to-gray-500';
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

  const itemVariants = {
    hidden: { 
      opacity: 0, 
      x: -20,
      scale: 0.95
    },
    visible: { 
      opacity: 1, 
      x: 0,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 15
      }
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-600" />
          Top Performers
          <Badge variant="outline" className="ml-auto">
            {topPerformers.length} employees
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-0">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-1"
        >
          {topPerformers.map((performer, index) => {
            const rankIcon = getRankIcon(index);
            const rankBadge = getRankBadge(index);
            const RankIcon = rankIcon.icon;

            return (
              <motion.div
                key={performer.name || performer.id}
                variants={itemVariants}
                whileHover={{ 
                  scale: 1.02,
                  transition: { type: "spring", stiffness: 400, damping: 10 }
                }}
                className={`relative p-4 border-l-4 transition-all duration-300 hover:bg-gray-50 ${
                  index === 0 ? 'border-l-yellow-400 bg-yellow-50/30' :
                  index === 1 ? 'border-l-gray-400 bg-gray-50/30' :
                  index === 2 ? 'border-l-amber-400 bg-amber-50/30' :
                  'border-l-blue-400 hover:border-l-blue-500'
                }`}
              >
                {/* Rank indicator */}
                <div className="absolute top-2 right-2">
                  <Badge className={rankBadge.className}>
                    {rankBadge.text}
                  </Badge>
                </div>

                <div className="flex items-center gap-4">
                  {/* Rank Icon */}
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ 
                      delay: index * 0.1 + 0.2,
                      type: "spring",
                      stiffness: 200,
                      damping: 15
                    }}
                    className={`p-2 rounded-full ${rankIcon.bg}`}
                  >
                    <RankIcon className={`w-5 h-5 ${rankIcon.color}`} />
                  </motion.div>

                  {/* Avatar */}
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ 
                      delay: index * 0.1 + 0.3,
                      type: "spring",
                      stiffness: 200,
                      damping: 15
                    }}
                  >
                    <Avatar className="w-12 h-12 border-2 border-white shadow-md">
                      <AvatarImage src={performer.avatar} alt={performer.name} />
                      <AvatarFallback className="bg-gradient-to-br from-blue-400 to-purple-500 text-white font-medium">
                        {performer.name?.split(' ').map(n => n[0]).join('') || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </motion.div>

                  {/* Employee Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-gray-900 truncate">
                        {performer.name || 'Unknown Employee'}
                      </h3>
                      {index < 3 && (
                        <Star className="w-4 h-4 text-yellow-500 fill-current" />
                      )}
                    </div>
                    
                    <p className="text-sm text-gray-600 truncate mb-2">
                      {performer.email || 'No email'}
                    </p>

                    {/* Performance Metrics */}
                    <div className="space-y-2">
                      {/* Attendance Rate */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Attendance</span>
                        <span className={`font-medium ${getPerformanceColor(performer.attendanceRate)}`}>
                          {performer.attendanceRate?.toFixed(1) || 0}%
                        </span>
                      </div>
                      
                      <motion.div
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ 
                          delay: index * 0.1 + 0.5,
                          duration: 1,
                          ease: "easeOut"
                        }}
                        className="w-full"
                      >
                        <Progress 
                          value={performer.attendanceRate || 0} 
                          className="h-2"
                        />
                      </motion.div>

                      {/* Additional Metrics */}
                      <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{performer.avgHours?.toFixed(1) || 0}h avg</span>
                        </div>
                        
                        {performer.totalOvertimeHours > 0 && (
                          <div className="flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            <span>{performer.totalOvertimeHours?.toFixed(1) || 0}h OT</span>
                          </div>
                        )}
                        
                        {performer.discrepancies > 0 && (
                          <Badge variant="outline" className="text-xs px-1 py-0">
                            {performer.discrepancies} issues
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Animated background for top 3 */}
                {index < 3 && (
                  <motion.div
                    animate={{
                      backgroundPosition: ['0% 0%', '100% 100%'],
                    }}
                    transition={{
                      duration: 10,
                      repeat: Infinity,
                      repeatType: 'reverse',
                      ease: 'linear'
                    }}
                    className="absolute inset-0 opacity-5 pointer-events-none"
                    style={{
                      background: index === 0 ? 
                        'linear-gradient(45deg, #fbbf24, #f59e0b)' :
                        index === 1 ?
                        'linear-gradient(45deg, #9ca3af, #6b7280)' :
                        'linear-gradient(45deg, #f59e0b, #d97706)',
                      backgroundSize: '200% 200%',
                    }}
                  />
                )}
              </motion.div>
            );
          })}
        </motion.div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Based on attendance rate and performance</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span>Live rankings</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TopPerformers;
