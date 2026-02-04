import React, { useState, useRef, useEffect } from 'react';
import { QRCode } from 'react-qrcode-logo';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialUrl?: string;
  onInsert: (imageUrl: string, url: string) => void;
}

const QRCodeModal: React.FC<QRCodeModalProps> = ({ isOpen, onClose, initialUrl = '', onInsert }) => {
  const [url, setUrl] = useState(initialUrl);
  const [qrStyle, setQrStyle] = useState<'squares' | 'dots'>('squares');
  const [eyeRadius, setEyeRadius] = useState<number>(0); // 0 = square, 10+ = rounded
  const [quietZone, setQuietZone] = useState<number>(10);
  const [fgColor, setFgColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [logoSize, setLogoSize] = useState<number>(40);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [borderEnabled, setBorderEnabled] = useState(false);
  const [borderColor, setBorderColor] = useState('#111111');
  const [borderWidth, setBorderWidth] = useState<number>(6);
  const [borderRadius, setBorderRadius] = useState<number>(12);
  
  useEffect(() => {
    if (isOpen) {
      setUrl(initialUrl);
      setLogoUrl('');
      setLogoSize(40);
      setBorderEnabled(false);
      setBorderColor('#111111');
      setBorderWidth(6);
      setBorderRadius(12);
    }
  }, [isOpen, initialUrl]);

  if (!isOpen) return null;

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setLogoUrl(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogoRemove = () => {
    setLogoUrl('');
    setLogoSize(40);
    if (logoInputRef.current) {
      logoInputRef.current.value = '';
    }
  };

  const buildRoundedRectPath = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ) => {
    const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  const getQrDataUrl = (element: HTMLCanvasElement) => {
    if (!borderEnabled || borderWidth <= 0) {
      return element.toDataURL('image/png');
    }

    const size = element.width + borderWidth * 2;
    const output = document.createElement('canvas');
    output.width = size;
    output.height = size;

    const ctx = output.getContext('2d');
    if (!ctx) return element.toDataURL('image/png');

    ctx.clearRect(0, 0, size, size);
    buildRoundedRectPath(ctx, 0, 0, size, size, borderRadius);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(element, borderWidth, borderWidth);
    ctx.restore();

    ctx.lineWidth = borderWidth;
    ctx.strokeStyle = borderColor;
    buildRoundedRectPath(ctx, borderWidth / 2, borderWidth / 2, size - borderWidth, size - borderWidth, borderRadius);
    ctx.stroke();

    return output.toDataURL('image/png');
  };

  const handleInsert = () => {
    const element = document.getElementById('react-qrcode-logo');
    if (element instanceof HTMLCanvasElement) {
      const dataUrl = getQrDataUrl(element);
      onInsert(dataUrl, url || '');
      onClose();
    }
  };

  const handleDownload = () => {
    const element = document.getElementById('react-qrcode-logo');
    if (element instanceof HTMLCanvasElement) {
      const dataUrl = getQrDataUrl(element);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = 'qrcode.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-[900px] h-[740px] flex overflow-hidden">
        {/* Left: Controls */}
        <div className="w-1/2 p-4 border-r border-gray-200 bg-gray-50">
          <h2 className="text-lg font-bold mb-3 text-gray-800">Generate QR Code</h2>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Destination URL</label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-violet-500 focus:border-violet-500"
                placeholder="https://..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dot Style</label>
              <div className="flex gap-4">
                <button
                  onClick={() => setQrStyle('squares')}
                  className={`flex-1 py-1.5 px-4 rounded border ${qrStyle === 'squares' ? 'bg-violet-50 border-violet-500 text-violet-700' : 'bg-white border-gray-300 hover:bg-violet-50'}`}
                >
                  Squares
                </button>
                <button
                  onClick={() => setQrStyle('dots')}
                  className={`flex-1 py-1.5 px-4 rounded border ${qrStyle === 'dots' ? 'bg-violet-50 border-violet-500 text-violet-700' : 'bg-white border-gray-300 hover:bg-violet-50'}`}
                >
                  Dots
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Eye Corner Style</label>
              <input
                type="range"
                min="0"
                max="20"
                value={eyeRadius}
                onChange={(e) => setEyeRadius(parseInt(e.target.value))}
                className="w-full accent-violet-500"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Square</span>
                <span>Round</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Margin (Quiet Zone)</label>
              <input
                type="range"
                min="0"
                max="50"
                value={quietZone}
                onChange={(e) => setQuietZone(parseInt(e.target.value))}
                className="w-full accent-violet-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dot Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={fgColor}
                    onChange={(e) => setFgColor(e.target.value)}
                    className="h-9 w-16 p-0 border border-gray-300 rounded cursor-pointer"
                  />
                  <span className="text-sm text-gray-600 font-mono">{fgColor}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Background</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="h-9 w-16 p-0 border border-gray-300 rounded cursor-pointer"
                  />
                  <span className="text-sm text-gray-600 font-mono">{bgColor}</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Center Logo</label>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="block w-full text-sm text-gray-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-full file:border-0
                      file:text-sm file:font-semibold
                    file:bg-violet-50 file:text-violet-700
                    hover:file:bg-violet-100"
                  />
                  {logoUrl && (
                    <button
                      type="button"
                      onClick={handleLogoRemove}
                      aria-label="Remove logo"
                      className="h-6 w-6 rounded-full border border-gray-300 text-gray-600 hover:bg-white"
                    >
                      ×
                    </button>
                  )}
                </div>
                {logoUrl && (
                  <div>
                     <label className="block text-xs text-gray-500 mb-1">Logo Size</label>
                      <input
                       type="range"
                       min="20"
                       max="80"
                       value={logoSize}
                       onChange={(e) => setLogoSize(parseInt(e.target.value))}
                      className="w-full accent-violet-500"
                    />
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Outer Border</label>
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={borderEnabled}
                    onChange={(e) => setBorderEnabled(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Enable border
                </label>
                {borderEnabled && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Border Color</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={borderColor}
                            onChange={(e) => setBorderColor(e.target.value)}
                            className="h-9 w-16 p-0 border border-gray-300 rounded cursor-pointer"
                          />
                          <span className="text-sm text-gray-600 font-mono">{borderColor}</span>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Thickness</label>
                        <input
                          type="range"
                          min="2"
                          max="24"
                          value={borderWidth}
                          onChange={(e) => setBorderWidth(parseInt(e.target.value))}
                          className="w-full accent-violet-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Corner Radius</label>
                      <input
                        type="range"
                        min="0"
                        max="40"
                        value={borderRadius}
                        onChange={(e) => setBorderRadius(parseInt(e.target.value))}
                        className="w-full accent-violet-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="w-1/2 p-6 flex flex-col items-center justify-between bg-gray-100">
          <div className="flex-1 flex items-center justify-center w-full">
            <div
              className="bg-white p-8 rounded-xl shadow-sm border border-gray-200"
            >
              <div
                className="inline-flex items-center justify-center"
                style={{
                  border: borderEnabled ? `${borderWidth}px solid ${borderColor}` : 'none',
                  borderRadius: borderEnabled ? `${borderRadius}px` : '0px',
                  backgroundColor: borderEnabled ? bgColor : 'transparent',
                  overflow: borderEnabled ? 'hidden' : 'visible',
                }}
              >
                <QRCode
                  value={url || 'https://example.com'}
                  size={250}
                  qrStyle={qrStyle}
                  eyeRadius={eyeRadius}
                  quietZone={quietZone}
                  logoImage={logoUrl}
                  logoWidth={logoSize}
                  logoHeight={logoSize}
                  removeQrCodeBehindLogo={true}
                  fgColor={fgColor}
                  bgColor={borderEnabled ? 'transparent' : bgColor}
                  id="react-qrcode-logo"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-4 w-full pt-6">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDownload}
              className="flex-1 px-4 py-2 border border-violet-600 text-violet-600 rounded-lg font-medium hover:bg-violet-50 transition-colors"
            >
              Download PNG
            </button>
            <button
              onClick={handleInsert}
              className="flex-1 px-4 py-2 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700 shadow-md transition-all transform hover:scale-[1.02]"
            >
              Insert
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QRCodeModal;
