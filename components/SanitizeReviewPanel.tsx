import React, { useState, useEffect } from 'react';
import { SanitizeIssue } from '../utils/documentSanitizer';

interface SanitizeReviewPanelProps {
    issues: SanitizeIssue[];
    onResolve: (removedIds: string[]) => void;
    onDismiss: () => void;
}

/**
 * Floating bottom-bar panel that lets the user review detected
 * sanitisation issues one by one or in batch.
 *
 * UX flow:
 *   1. Shows count of issues found
 *   2. User clicks "View" → scrolls to element + highlights it
 *   3. User clicks ✓ to remove or ✗ to skip
 *   4. "Remove All" to batch-remove selected items
 */
const SanitizeReviewPanel: React.FC<SanitizeReviewPanelProps> = ({
    issues,
    onResolve,
    onDismiss
}) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
    const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
    const [highlightedEl, setHighlightedEl] = useState<HTMLElement | null>(null);

    const remaining = issues.filter(i => !removedIds.has(i.id) && !skippedIds.has(i.id));

    // Clean up highlight on unmount
    useEffect(() => {
        return () => {
            if (highlightedEl) {
                highlightedEl.style.outline = '';
                highlightedEl.style.outlineOffset = '';
                highlightedEl.style.backgroundColor = '';
            }
        };
    }, [highlightedEl]);

    if (issues.length === 0) return null;

    const clearHighlight = () => {
        if (highlightedEl) {
            highlightedEl.style.outline = '';
            highlightedEl.style.outlineOffset = '';
            highlightedEl.style.backgroundColor = '';
            setHighlightedEl(null);
        }
    };

    const scrollToIssue = (issue: SanitizeIssue) => {
        clearHighlight();
        const el = issue.element;
        if (!el || !el.isConnected) return;

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.outline = '3px solid #f59e0b';
        el.style.outlineOffset = '2px';
        el.style.backgroundColor = 'rgba(245, 158, 11, 0.15)';
        setHighlightedEl(el);
    };

    const handleRemoveOne = (issue: SanitizeIssue) => {
        clearHighlight();
        const newRemoved = new Set(removedIds);
        newRemoved.add(issue.id);
        setRemovedIds(newRemoved);

        // Remove from DOM immediately
        if (issue.element?.isConnected) {
            issue.element.remove();
        }

        // Check what's left
        const nextRemaining = issues.filter(i => !newRemoved.has(i.id) && !skippedIds.has(i.id));
        if (nextRemaining.length === 0) {
            // Last one — finalize
            onResolve(Array.from(newRemoved));
        } else {
            // Auto-scroll to next
            const nextIssue = nextRemaining[0];
            if (nextIssue) {
                setTimeout(() => scrollToIssue(nextIssue), 100);
            }
        }
    };

    const handleSkipOne = () => {
        clearHighlight();
        if (!current) return;
        const newSkipped = new Set(skippedIds);
        newSkipped.add(current.id);
        setSkippedIds(newSkipped);

        // If no more remaining after this skip, finalize
        const nextRemaining = issues.filter(i => !removedIds.has(i.id) && !newSkipped.has(i.id));
        if (nextRemaining.length === 0) {
            onResolve(Array.from(removedIds));
        } else {
            // Auto-scroll to the next issue
            const nextIssue = nextRemaining[0];
            if (nextIssue) {
                setTimeout(() => scrollToIssue(nextIssue), 100);
            }
        }
    };

    const handleRemoveAll = () => {
        clearHighlight();
        const allIds: string[] = [];
        remaining.forEach(issue => {
            allIds.push(issue.id);
            if (issue.element?.isConnected) {
                issue.element.remove();
            }
        });
        onResolve([...Array.from(removedIds), ...allIds]);
    };

    const handleDismiss = () => {
        clearHighlight();
        onResolve(Array.from(removedIds));
    };

    const current = remaining[Math.min(currentIndex, remaining.length - 1)];

    return (
        <div style={{
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: 'rgba(17, 24, 39, 0.95)',
            backdropFilter: 'blur(12px)',
            borderRadius: '14px',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            fontFamily: 'Inter, system-ui, sans-serif',
            color: 'white',
            minWidth: '480px',
            maxWidth: '700px'
        }}>
            {/* Icon */}
            <div style={{
                background: 'rgba(245, 158, 11, 0.2)',
                borderRadius: '10px',
                width: '40px',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                flexShrink: 0
            }}>
                🔍
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>
                    Orphan Page Numbers Detected
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginTop: '2px' }}>
                    {remaining.length} remaining · Number "{current?.preview}" on page {current?.page}
                </div>
            </div>

            {/* Actions */}
            <button
                onClick={() => current && scrollToIssue(current)}
                style={{
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '8px',
                    color: 'white',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                }}
                title="Scroll to this number"
            >
                👁️ View
            </button>

            <button
                onClick={() => current && handleRemoveOne(current)}
                style={{
                    background: 'rgba(34, 197, 94, 0.2)',
                    border: '1px solid rgba(34, 197, 94, 0.4)',
                    borderRadius: '8px',
                    color: '#86efac',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                }}
                title="Remove this number"
            >
                ✓ Remove
            </button>

            <button
                onClick={handleSkipOne}
                style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '8px',
                    color: 'rgba(255,255,255,0.7)',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                }}
                title="Skip this number"
            >
                ✗ Skip
            </button>

            {remaining.length > 1 && (
                <button
                    onClick={handleRemoveAll}
                    style={{
                        background: 'rgba(141, 85, 241, 0.3)',
                        border: '1px solid rgba(141, 85, 241, 0.5)',
                        borderRadius: '8px',
                        color: '#c4a7ff',
                        padding: '6px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                    }}
                    title="Remove all remaining"
                >
                    Remove All ({remaining.length})
                </button>
            )}

            <button
                onClick={handleDismiss}
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255,255,255,0.4)',
                    padding: '4px 8px',
                    fontSize: '16px',
                    cursor: 'pointer',
                    lineHeight: 1
                }}
                title="Dismiss"
            >
                ✕
            </button>
        </div>
    );
};

export default SanitizeReviewPanel;
