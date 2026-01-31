import React from 'react';
import { Layers, FileText } from 'lucide-react';

interface SidebarProps {
  isSidebarOpen: boolean;
  pageCount: number;
  currentPage: number;
  onPageSelect: (pageIndex: number) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isSidebarOpen, pageCount, currentPage, onPageSelect }) => {
  return (
    <div className={`w-64 border-r border-gray-200 bg-white h-[calc(100vh-64px)] overflow-y-auto flex-shrink-0 transition-all duration-300 ${isSidebarOpen ? 'ml-0' : '-ml-64'}`}>
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
            <Layers size={14} />
            Navigation
        </h2>
      </div>
      <div className="p-2 space-y-1">
        {Array.from({ length: pageCount }).map((_, idx) => (
          <button
            key={idx}
            onClick={() => onPageSelect(idx)}
            className={`w-full text-left px-3 py-3 rounded-md text-sm flex items-center gap-3 transition-colors ${
              currentPage === idx 
                ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-600' 
                : 'text-gray-600 hover:bg-gray-50 border-l-4 border-transparent'
            }`}
          >
            <span className="flex items-center justify-center w-6 h-6 bg-gray-100 rounded text-xs font-bold text-gray-500">
                {idx + 1}
            </span>
            <span className="truncate flex-1">Page {idx + 1}</span>
            {currentPage === idx && <FileText size={14} />}
          </button>
        ))}
        {pageCount === 0 && (
            <div className="text-center text-gray-400 py-8 text-sm">
                No pages detected
            </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
