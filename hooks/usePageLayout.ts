import React, { useState, useRef } from 'react';
import { PAGE_FORMATS, getGutterByPageCount } from '../constants';
import { DocumentState } from '../types';

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
    const [pageMargins, setPageMargins] = useState<{ top: number; bottom: number; left: number; right: number }>({ top: 0.5, bottom: 0.5, left: 0.375, right: 0.5 });
    const [showMarginGuides, setShowMarginGuides] = useState(false);
    const [showSmartGuides, setShowSmartGuides] = useState(false);

    const marginReflowTimeoutRef = useRef<number | null>(null);

    const updatePageCSS = (width: string, height: string, margins: { top: number; bottom: number; left: number; right: number }) => {
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

        // Use current margins but keep the gutter as-is (auto-managed by pageCount effect)
        const margins = { ...format.margins, left: pageMargins.left };
        setPageMargins(margins);

        if (formatId === 'custom') {
            updatePageCSS(customPageSize.width, customPageSize.height, margins);
        } else {
            updatePageCSS(format.width, format.height, margins);
        }
    };

    /** Called by App.tsx when DOM pageCount changes — auto-recalculate gutter */
    const updateGutterForPageCount = (domPageCount: number) => {
        const gutter = getGutterByPageCount(domPageCount);
        if (Math.abs(gutter - pageMargins.left) < 0.001) return; // No change needed

        const newMargins = { ...pageMargins, left: gutter };
        setPageMargins(newMargins);

        const format = Object.values(PAGE_FORMATS).find(f => f.id === pageFormatId);
        const width = pageFormatId === 'custom' ? customPageSize.width : (format?.width || '8.5in');
        const height = pageFormatId === 'custom' ? customPageSize.height : (format?.height || '11in');
        updatePageCSS(width, height, newMargins);
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
        updateGutterForPageCount,
        handleCustomPageSizeChange,
        handleMarginChange,
        updatePageCSS
    };
};
