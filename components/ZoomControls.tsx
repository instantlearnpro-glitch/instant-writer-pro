import React from 'react';

interface ZoomControlsProps {
  zoom: number;
  viewMode: 'single' | 'double';
  onZoomChange: (zoom: number) => void;
  onViewModeChange: (mode: 'single' | 'double') => void;
}

const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200];

const ZoomControls: React.FC<ZoomControlsProps> = ({
  zoom,
  viewMode,
  onZoomChange,
  onViewModeChange
}) => {
  const handleZoomIn = () => {
    const currentIndex = ZOOM_PRESETS.findIndex(z => z >= zoom);
    if (currentIndex < ZOOM_PRESETS.length - 1) {
      onZoomChange(ZOOM_PRESETS[currentIndex + 1]);
    } else if (zoom < 200) {
      onZoomChange(Math.min(200, zoom + 10));
    }
  };

  const handleZoomOut = () => {
    const currentIndex = ZOOM_PRESETS.findIndex(z => z >= zoom);
    if (currentIndex > 0) {
      onZoomChange(ZOOM_PRESETS[currentIndex - 1]);
    } else if (zoom > 50) {
      onZoomChange(Math.max(50, zoom - 10));
    }
  };

  return (
    <div className="fixed bottom-4 right-4 flex items-center gap-2 bg-white shadow-lg rounded-lg px-3 py-2 z-50 border border-gray-200">
      {/* Zoom Out */}
      <button
        onClick={handleZoomOut}
        disabled={zoom <= 50}
        className="p-1.5 hover:bg-brand-50 hover:text-brand-600 rounded disabled:opacity-40 disabled:cursor-not-allowed"
        title="Riduci zoom"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
        </svg>
      </button>

      {/* Zoom Dropdown */}
      <select
        value={zoom}
        onChange={(e) => onZoomChange(Number(e.target.value))}
        className="text-sm bg-transparent border-none focus:outline-none cursor-pointer font-medium text-gray-700 w-16 text-center"
      >
        {ZOOM_PRESETS.map(z => (
          <option key={z} value={z}>{z}%</option>
        ))}
      </select>

      {/* Zoom In */}
      <button
        onClick={handleZoomIn}
        disabled={zoom >= 200}
        className="p-1.5 hover:bg-brand-50 hover:text-brand-600 rounded disabled:opacity-40 disabled:cursor-not-allowed"
        title="Aumenta zoom"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      <div className="w-px h-5 bg-gray-300 mx-1" />

      {/* Single Page View */}
      <button
        onClick={() => onViewModeChange('single')}
        className={`p-1.5 rounded ${viewMode === 'single' ? 'bg-brand-100 text-brand-600' : 'hover:bg-brand-50 hover:text-brand-600 text-gray-600'}`}
        title="Single page view"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="3" width="12" height="18" rx="1" strokeWidth={2} />
        </svg>
      </button>

      {/* Double Page View */}
      <button
        onClick={() => onViewModeChange('double')}
        className={`p-1.5 rounded ${viewMode === 'double' ? 'bg-brand-100 text-brand-600' : 'hover:bg-brand-50 hover:text-brand-600 text-gray-600'}`}
        title="Two-page view"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="2" y="4" width="8" height="16" rx="1" strokeWidth={2} />
          <rect x="14" y="4" width="8" height="16" rx="1" strokeWidth={2} />
        </svg>
      </button>
    </div>
  );
};

export default ZoomControls;
