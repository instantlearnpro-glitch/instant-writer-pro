import React, { useState, useRef } from 'react';
import { PAGE_FORMATS } from '../constants';
import { DocumentState } from '../types';

// applyLayoutOverride is defined in App.tsx as a top-level function, we import it via parameter
// reflowPagesUntilStable is imported from pagination.ts in App.tsx, passed as a parameter

interface UsePageLayoutParams {
    applyLayoutOverride: (css: string, width: string, height: string, margins: { top: number; bottom: number; left: number; right: number }) => string;
    reflowPagesUntilStable: (workspace: HTMLElement, options?: { pullUp?: boolean }) => void;
    setDocState: React.Dispatch<React.SetStateAction<DocumentState>>;
    pushHistoryState: (state: DocumentState, options?: { skipIfSameHtml?: string }) => void;
    debounceTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
}

export const usePageLayout = ({
    applyLayoutOverride,
    reflowPagesUntilStable,
    setDocState,
    pushHistoryState,
    debounceTimeoutRef
}: UsePageLayoutParams) => {
    const [pageFormatId, setPageFormatId] = useState<string>('letter');
    const [customPageSize, setCustomPageSize] = useState<{ width: string; height: string }>({ width: '8.5in', height: '11in' });
    const [pageMargins, setPageMargins] = useState<{ top: number; bottom: number; left: number; right: number }>({ top: 0.5, bottom: 0.5, left: 0.45, right: 0.5 });
    const [showMarginGuides, setShowMarginGuides] = useState(false);
    const [showSmartGuides, setShowSmartGuides] = useState(false);

    const marginReflowTimeoutRef = useRef<number | null>(null);

    const updatePageCSS = (width: string, height: string, margins: { top: number; bottom: number; left: number; right: number }) => {
        // Use functional update so rapid dragging always has the latest CSS content
        setDocState(prev => {
            const updatedCss = applyLayoutOverride(prev.cssContent, width, height, margins);
            return { ...prev, cssContent: updatedCss };
        });

        if (marginReflowTimeoutRef.current) {
            clearTimeout(marginReflowTimeoutRef.current);
        }
        marginReflowTimeoutRef.current = window.setTimeout(() => {
            const workspace = document.querySelector('.editor-workspace');
            if (workspace) {
                reflowPagesUntilStable(workspace as HTMLElement, { pullUp: true });
            }
            // Save to history once drag is completed
            setDocState(prev => {
                if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
                pushHistoryState(prev);
                return prev;
            });
        }, 300);
    };

    const handlePageSizeChange = (formatId: string) => {
        setPageFormatId(formatId);

        const format = Object.values(PAGE_FORMATS).find(f => f.id === formatId);
        if (!format) return;

        setPageMargins(format.margins);

        if (formatId === 'custom') {
            updatePageCSS(customPageSize.width, customPageSize.height, format.margins);
        } else {
            updatePageCSS(format.width, format.height, format.margins);
        }
    };

    const handleCustomPageSizeChange = (width: string, height: string) => {
        setCustomPageSize({ width, height });
        if (pageFormatId === 'custom') {
            const validWidth = /^\d+(\.\d+)?$/.test(width) ? `${width}in` : width;
            const validHeight = /^\d+(\.\d+)?$/.test(height) ? `${height}in` : height;
            updatePageCSS(validWidth || '8.5in', validHeight || '11in', pageMargins);
        }
    };

    const handleMarginChange = (key: 'top' | 'bottom' | 'left' | 'right', value: number) => {
        setPageMargins(prev => {
            const newMargins = { ...prev, [key]: value };

            const format = Object.values(PAGE_FORMATS).find(f => f.id === pageFormatId);
            const width = pageFormatId === 'custom' ? customPageSize.width : (format?.width || '8.5in');
            const height = pageFormatId === 'custom' ? customPageSize.height : (format?.height || '11in');

            updatePageCSS(width, height, newMargins);

            return newMargins;
        });
    };

    return {
        pageFormatId,
        customPageSize,
        pageMargins,
        showMarginGuides,
        setShowMarginGuides,
        showSmartGuides,
        setShowSmartGuides,
        handlePageSizeChange,
        handleCustomPageSizeChange,
        handleMarginChange,
        updatePageCSS
    };
};
