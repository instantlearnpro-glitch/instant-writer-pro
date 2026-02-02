import React, { createContext, useContext, useRef, useState, useCallback, ReactNode } from 'react';
import { PatternTracker, findSimilarElements, getElementSignature, PatternMatch, ActionType } from './patternDetector';
import PatternModal from '../components/PatternModal';
import { reflowPages } from './pagination';

interface PatternContextType {
  trackAction: (type: ActionType, element: HTMLElement, command?: string, value?: string) => void;
  applyToSimilar: (type: ActionType, element: HTMLElement, applyFn: (el: HTMLElement) => void) => void;
}

const PatternContext = createContext<PatternContextType | null>(null);

export const usePattern = () => {
  const context = useContext(PatternContext);
  if (!context) {
    throw new Error('usePattern must be used within PatternProvider');
  }
  return context;
};

interface PatternProviderProps {
  children: ReactNode;
  workspaceSelector: string;
  onContentChange: (html: string) => void;
}

export const PatternProvider: React.FC<PatternProviderProps> = ({ 
  children, 
  workspaceSelector,
  onContentChange 
}) => {
  const trackerRef = useRef(new PatternTracker());
  const pendingApplyFnRef = useRef<((el: HTMLElement) => void) | null>(null);
  
  const [modal, setModal] = useState<{
    isOpen: boolean;
    actionType: string;
    matches: PatternMatch[];
    command?: string;
    value?: string;
  }>({ isOpen: false, actionType: '', matches: [] });

  const trackAction = useCallback((
    type: ActionType, 
    element: HTMLElement, 
    command?: string, 
    value?: string
  ) => {
    trackerRef.current.recordAction(type, element, command, value);
    
    const pattern = trackerRef.current.detectPattern();
    if (pattern) {
      const workspace = document.querySelector(workspaceSelector) as HTMLElement;
      if (workspace) {
        const signature = getElementSignature(element);
        const matches = findSimilarElements(signature, element, workspace);
        
        if (matches.length > 0) {
          setModal({
            isOpen: true,
            actionType: pattern.actionType,
            matches: matches,
            command: pattern.command,
            value: pattern.value
          });
        }
      }
    }
  }, [workspaceSelector]);

  const applyToSimilar = useCallback((
    type: ActionType,
    element: HTMLElement,
    applyFn: (el: HTMLElement) => void
  ) => {
    pendingApplyFnRef.current = applyFn;
    trackAction(type, element);
  }, [trackAction]);

  const handleConfirm = (selectedIds: string[]) => {
    const applyFn = pendingApplyFnRef.current;
    
    selectedIds.forEach(id => {
      const element = document.getElementById(id);
      if (element && applyFn) {
        applyFn(element);
      }
    });
    
    const workspace = document.querySelector(workspaceSelector) as HTMLElement;
    if (workspace) {
      reflowPages(workspace);
      onContentChange(workspace.innerHTML);
    }
    
    trackerRef.current.clear();
    pendingApplyFnRef.current = null;
    setModal({ isOpen: false, actionType: '', matches: [] });
  };

  const handleCancel = () => {
    trackerRef.current.clear();
    pendingApplyFnRef.current = null;
    setModal({ isOpen: false, actionType: '', matches: [] });
  };

  return (
    <PatternContext.Provider value={{ trackAction, applyToSimilar }}>
      {children}
      <PatternModal
        isOpen={modal.isOpen}
        actionType={modal.actionType}
        matches={modal.matches}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </PatternContext.Provider>
  );
};
