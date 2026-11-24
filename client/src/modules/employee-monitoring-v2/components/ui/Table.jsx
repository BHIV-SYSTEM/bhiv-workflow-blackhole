/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Modern Responsive Table Components
 */

import React from 'react';

export const Table = ({ children, className = '', ...props }) => (
  <div className="w-full overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
    <table className={`w-full text-left text-xs text-slate-300 ${className}`} {...props}>
      {children}
    </table>
  </div>
);

export const TableHeader = ({ children, className = '', ...props }) => (
  <thead className={`border-b border-slate-800 bg-slate-900/80 text-slate-400 font-medium uppercase tracking-wider text-[11px] ${className}`} {...props}>
    {children}
  </thead>
);

export const TableBody = ({ children, className = '', ...props }) => (
  <tbody className={`divide-y divide-slate-800/60 ${className}`} {...props}>
    {children}
  </tbody>
);

export const TableRow = ({ children, className = '', hover = true, ...props }) => (
  <tr
    className={`transition-colors ${hover ? 'hover:bg-slate-800/40' : ''} ${className}`}
    {...props}
  >
    {children}
  </tr>
);

export const TableHead = ({ children, className = '', ...props }) => (
  <th className={`px-4 py-3.5 ${className}`} {...props}>
    {children}
  </th>
);

export const TableCell = ({ children, className = '', ...props }) => (
  <td className={`px-4 py-3.5 align-middle ${className}`} {...props}>
    {children}
  </td>
);

export default Table;
