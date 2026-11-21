/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Custom Hook for accessing V2 Monitoring State
 */

import { useMonitoringV2Context } from '../context/MonitoringV2Context.jsx';

export const useMonitoringV2 = () => {
  return useMonitoringV2Context();
};

export default useMonitoringV2;
