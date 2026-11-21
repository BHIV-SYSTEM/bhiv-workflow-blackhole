/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Dynamic Lucide Icon Mapper
 */

import React from 'react';
import {
  LayoutDashboard,
  Users,
  TrendingUp,
  UserCheck,
  FileSpreadsheet,
  Sparkles,
  BellRing,
  Cpu,
  Activity,
  ShieldAlert,
  ListFilter,
  Layers,
  FileText,
  Settings,
  Timer,
  Laptop,
  ShieldCheck,
  HelpCircle,
  HelpCircle as DefaultIcon,
} from 'lucide-react';

const ICON_MAP = {
  LayoutDashboard,
  Users,
  TrendingUp,
  UserCheck,
  FileSpreadsheet,
  Sparkles,
  BellRing,
  Cpu,
  Activity,
  ShieldAlert,
  ListFilter,
  Layers,
  FileText,
  Settings,
  Timer,
  Laptop,
  ShieldCheck,
  HelpCircle,
};

export const NavIcon = ({ name, className = 'w-4 h-4' }) => {
  const IconComponent = ICON_MAP[name] || DefaultIcon;
  return <IconComponent className={className} />;
};

export default NavIcon;
