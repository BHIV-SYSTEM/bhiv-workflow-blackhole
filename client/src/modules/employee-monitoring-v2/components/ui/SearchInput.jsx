/**
 * NIYANTRAN EMPLOYEE MONITORING V2
 * Clean Search Input Component
 */

import React from 'react';
import { Search, X } from 'lucide-react';

export const SearchInput = ({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
  onClear,
}) => {
  return (
    <div className={`relative flex items-center ${className}`}>
      <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
      />
      {value && (
        <button
          onClick={onClear ? onClear : () => onChange('')}
          className="absolute right-2.5 text-slate-500 hover:text-slate-300 p-0.5 rounded cursor-pointer"
          title="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

export default SearchInput;
