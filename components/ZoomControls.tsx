import React from 'react';

interface ZoomControlsProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
}

const ZOOM_PRESETS = [25, 33, 50, 75, 100, 125, 150, 200];

const ZoomControls: React.FC<ZoomControlsProps> = ({
  zoom,
  onZoomChange
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
    } else if (zoom > 25) {
      onZoomChange(Math.max(25, zoom - 10));
    }
  };

  // At zoom <=50%, pages are displayed in a multi-page grid
  const isMultiPageView = zoom <= 50;

  return (
    <div className="fixed bottom-4 right-4 flex items-center gap-2 bg-white shadow-lg rounded-lg px-3 py-2 z-50 border border-gray-200">
      {/* Zoom Out */}
      <button
        onClick={handleZoomOut}
        disabled={zoom <= 25}
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

      {/* Multi-page indicator */}
      {isMultiPageView && (
        <>
          <div className="w-px h-5 bg-gray-300 mx-1" />
          <div className="flex items-center gap-1.5 text-xs text-brand-600 font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="2" y="3" width="8" height="8" rx="1" strokeWidth={1.5} />
              <rect x="14" y="3" width="8" height="8" rx="1" strokeWidth={1.5} />
              <rect x="2" y="13" width="8" height="8" rx="1" strokeWidth={1.5} />
              <rect x="14" y="13" width="8" height="8" rx="1" strokeWidth={1.5} />
            </svg>
            Multi-page
          </div>
        </>
      )}
    </div>
  );
};

export default ZoomControls;
