/**
 * PART F: FRONTEND CURRENCY FORMATTING
 * 
 * Utilities for displaying salary and earnings in INR format
 */

/**
 * Format number as Indian Rupees
 * @param {Number} amount - Amount to format
 * @param {Boolean} showSymbol - Whether to show ₹ symbol
 * @returns {String} Formatted currency string
 */
export const formatINR = (amount, showSymbol = true) => {
  if (!amount && amount !== 0) return showSymbol ? '₹0.00' : '0.00';

  const formatted = parseFloat(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  return showSymbol ? `₹${formatted}` : formatted;
};

/**
 * Format large numbers with commas (Indian style)
 * @param {Number} number - Number to format
 * @returns {String} Formatted number
 */
export const formatNumberINR = (number) => {
  if (!number && number !== 0) return '0';

  return number.toLocaleString('en-IN', {
    maximumFractionDigits: 0
  });
};

/**
 * Parse INR string to number
 * @param {String} currencyString - INR formatted string
 * @returns {Number} Parsed number
 */
export const parseINR = (currencyString) => {
  if (!currencyString) return 0;

  // Remove ₹ symbol and commas, then parse
  const cleaned = currencyString.replace(/[₹,]/g, '');
  return parseFloat(cleaned) || 0;
};

/**
 * Format compound salary display
 * @param {Object} salary - { basicForDay, hourlyRate, worked_hours }
 * @returns {String} Formatted salary display
 */
export const formatSalaryDisplay = (salary) => {
  if (!salary) return '₹0.00';

  const { basicForDay, hourlyRate, worked_hours } = salary;

  if (basicForDay) {
    return formatINR(basicForDay);
  }

  if (hourlyRate && worked_hours) {
    const calculated = hourlyRate * worked_hours;
    return formatINR(calculated);
  }

  return '₹0.00';
};

/**
 * Format salary breakdown
 * @param {Object} employee - Employee data with salary config
 * @param {Number} hoursWorked - Hours worked
 * @returns {Object} Salary breakdown with INR formatting
 */
export const formatSalaryBreakdown = (employee, hoursWorked) => {
  const breakdown = {
    regularPay: 0,
    overtimePay: 0,
    allowances: 0,
    deductions: 0,
    netPay: 0
  };

  if (!employee) return breakdown;

  const { hourlyRate, overtimeRate = 1.5, allowances = {}, deductions = {} } = employee;

  if (hourlyRate && hoursWorked) {
    const standardHours = 8;
    const regularHours = Math.min(hoursWorked, standardHours);
    const overtimeHours = Math.max(0, hoursWorked - standardHours);

    breakdown.regularPay = regularHours * hourlyRate;
    breakdown.overtimePay = overtimeHours * hourlyRate * overtimeRate;
  }

  // Calculate allowances
  breakdown.allowances = Object.values(allowances || {}).reduce((a, b) => a + b, 0);

  // Calculate deductions
  breakdown.deductions = Object.values(deductions || {}).reduce((a, b) => a + b, 0);

  // Calculate net
  breakdown.netPay = 
    breakdown.regularPay + 
    breakdown.overtimePay + 
    breakdown.allowances - 
    breakdown.deductions;

  return breakdown;
};

/**
 * React Component: Currency Display
 */
export const CurrencyDisplay = ({ amount, showSymbol = true, className = '' }) => {
  return (
    <span className={`currency-display ${className}`}>
      {formatINR(amount, showSymbol)}
    </span>
  );
};

/**
 * React Component: Salary Card
 */
export const SalaryCard = ({ 
  label, 
  amount, 
  type = 'neutral', // 'positive', 'negative', 'neutral'
  icon = null 
}) => {
  const typeClass = `salary-card--${type}`;

  return (
    <div className={`salary-card ${typeClass}`}>
      {icon && <div className="salary-card__icon">{icon}</div>}
      <div className="salary-card__content">
        <div className="salary-card__label">{label}</div>
        <div className="salary-card__amount">
          {formatINR(amount)}
        </div>
      </div>
    </div>
  );
};

/**
 * React Component: Mismatch Alert
 */
export const MismatchAlert = ({ 
  timeDiffIn, 
  timeDiffOut, 
  remarks, 
  severity = 'warning' 
}) => {
  const getSeverityColor = () => {
    if (severity === 'high' || Math.max(timeDiffIn || 0, timeDiffOut || 0) > 60) {
      return 'alert-danger';
    }
    if (severity === 'medium' || Math.max(timeDiffIn || 0, timeDiffOut || 0) > 30) {
      return 'alert-warning';
    }
    return 'alert-info';
  };

  return (
    <div className={`mismatch-alert ${getSeverityColor()}`}>
      <div className="alert-icon">⚠️</div>
      <div className="alert-content">
        <div className="alert-title">Time Mismatch Detected</div>
        <div className="alert-message">
          {timeDiffIn > 0 && <span>IN: {timeDiffIn} min difference | </span>}
          {timeDiffOut > 0 && <span>OUT: {timeDiffOut} min difference</span>}
        </div>
        <div className="alert-remark">{remarks}</div>
      </div>
    </div>
  );
};

/**
 * React Component: Attendance Summary with Salary
 */
export const AttendanceSummary = ({ summary, showSalary = true }) => {
  return (
    <div className="attendance-summary">
      <div className="summary-grid">
        <div className="summary-item">
          <div className="summary-label">Present Days</div>
          <div className="summary-value">{summary.presentDays || 0}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Absent Days</div>
          <div className="summary-value">{summary.absentDays || 0}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Half Days</div>
          <div className="summary-value">{summary.halfDays || 0}</div>
        </div>
        <div className="summary-item">
          <div className="summary-label">Total Hours</div>
          <div className="summary-value">{summary.totalHours?.toFixed(2) || 0}h</div>
        </div>
      </div>

      {showSalary && (
        <div className="salary-section">
          <div className="summary-label">Total Earnings</div>
          <div className="summary-earnings">
            {formatINR(summary.totalEarnings || 0)}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * React Component: Salary Breakdown Card
 */
export const SalaryBreakdownCard = ({ breakdown }) => {
  return (
    <div className="salary-breakdown">
      <h3>Salary Breakdown</h3>
      
      <div className="breakdown-row">
        <span className="breakdown-label">Regular Pay (8h)</span>
        <span className="breakdown-value">
          {formatINR(breakdown.regularPay)}
        </span>
      </div>

      {breakdown.overtimePay > 0 && (
        <div className="breakdown-row">
          <span className="breakdown-label">Overtime Pay (1.5x)</span>
          <span className="breakdown-value positive">
            {formatINR(breakdown.overtimePay)}
          </span>
        </div>
      )}

      {breakdown.allowances > 0 && (
        <div className="breakdown-row">
          <span className="breakdown-label">Allowances</span>
          <span className="breakdown-value positive">
            {formatINR(breakdown.allowances)}
          </span>
        </div>
      )}

      {breakdown.deductions > 0 && (
        <div className="breakdown-row">
          <span className="breakdown-label">Deductions</span>
          <span className="breakdown-value negative">
            -{formatINR(breakdown.deductions)}
          </span>
        </div>
      )}

      <div className="breakdown-row breakdown-total">
        <span className="breakdown-label">Net Pay</span>
        <span className="breakdown-value total">
          {formatINR(breakdown.netPay)}
        </span>
      </div>
    </div>
  );
};

/**
 * React Hook: Format salary data
 */
export const useSalaryFormatter = (amount, options = {}) => {
  const {
    showSymbol = true,
    decimals = 2,
    abbreviate = false
  } = options;

  const format = (value) => {
    if (abbreviate) {
      if (value >= 100000) {
        return `₹${(value / 100000).toFixed(1)}L`;
      }
      if (value >= 1000) {
        return `₹${(value / 1000).toFixed(1)}K`;
      }
    }

    return formatINR(value, showSymbol);
  };

  return {
    formatted: format(amount),
    raw: amount,
    parse: (str) => parseINR(str)
  };
};

/**
 * Tailwind CSS Classes for Salary Display
 */
export const SALARY_STYLES = {
  container: 'flex flex-col gap-4 p-4 bg-white rounded-lg shadow',
  row: 'flex justify-between items-center py-2 border-b border-gray-200 last:border-0',
  label: 'text-gray-600 text-sm font-medium',
  amount: 'text-gray-900 font-semibold text-lg',
  positive: 'text-green-600',
  negative: 'text-red-600',
  card: 'bg-gradient-to-r from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200',
  cardTitle: 'text-blue-900 font-semibold text-sm',
  cardAmount: 'text-blue-900 font-bold text-2xl mt-2'
};

export default {
  formatINR,
  formatNumberINR,
  parseINR,
  formatSalaryDisplay,
  formatSalaryBreakdown,
  CurrencyDisplay,
  SalaryCard,
  MismatchAlert,
  AttendanceSummary,
  SalaryBreakdownCard,
  useSalaryFormatter,
  SALARY_STYLES
};
