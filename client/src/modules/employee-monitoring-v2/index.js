/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Public Module Barrel Export
 */

export * from './config/flags.js';
export * from './config/constants.js';
export * from './config/navigation.js';
export * from './services/monitoringV2Api.js';
export * from './context/MonitoringV2Context.jsx';
export * from './hooks/useMonitoringV2.js';

// Layouts & Guards
export * from './components/layouts/RoleGuard.jsx';

// Common Components
export * from './components/common/PrivacyShieldBadge.jsx';
export * from './components/common/ConflictWarningBanner.jsx';
export * from './components/common/DeviceSwitcherModal.jsx';
export * from './components/common/NavIcon.jsx';

// UI Library
export * from './components/ui/Badge.jsx';
export * from './components/ui/Button.jsx';
export * from './components/ui/Card.jsx';
export * from './components/ui/Modal.jsx';
export * from './components/ui/Table.jsx';
export * from './components/ui/Tabs.jsx';
export * from './components/ui/MetricCard.jsx';
export * from './components/ui/SearchInput.jsx';

// Charts
export * from './components/charts/ActivityBarChart.jsx';
export * from './components/charts/TimelineHeatmap.jsx';
export * from './components/charts/CategoryDonut.jsx';

// Integrated Niyantran V2 Pages
export * from './pages/AdminMonitoringV2Page.jsx';
export * from './pages/EmployeeMonitoringV2Page.jsx';

export { default } from './pages/AdminMonitoringV2Page.jsx';
