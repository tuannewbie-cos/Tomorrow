import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { ThemeColors } from '../constants/theme';
import { QuotedSelection } from '../types/chat';

export interface TextSelectionPopoverProps {
  theme: ThemeColors;
  onAskWithQuote: (selection: QuotedSelection) => void;
  onQuickExplain: (selection: QuotedSelection) => void;
}

interface PopoverState {
  visible: boolean;
  selection: QuotedSelection | null;
  top: number;
  left: number;
  placement: 'above' | 'below';
}

const POPOVER_ESTIMATED_WIDTH = 246;
const EDGE_MARGIN_PX = 12;

function findBubbleElement(node: Node | null): HTMLElement | null {
  if (!node) return null;
  const el = node.nodeType === 3 ? node.parentElement : (node as HTMLElement);
  if (!el || typeof el.closest !== 'function') return null;

  // Reject selections inside editable fields or PromptBox
  if (el.closest('input, textarea, [contenteditable="true"], .tmr-prompt-container')) {
    return null;
  }

  return el.closest('[data-tomorrow-bubble="true"]') as HTMLElement | null;
}

export const TextSelectionPopover: React.FC<TextSelectionPopoverProps> = ({
  theme,
  onAskWithQuote,
  onQuickExplain,
}) => {
  const [popover, setPopover] = useState<PopoverState>({
    visible: false,
    selection: null,
    top: 0,
    left: 0,
    placement: 'above',
  });
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hidePopover = useCallback(() => {
    setPopover((prev) => (prev.visible ? { ...prev, visible: false } : prev));
  }, []);

  const evaluateSelection = useCallback(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      hidePopover();
      return;
    }

    const selectedText = sel.toString().trim();
    if (selectedText.length < 3) {
      hidePopover();
      return;
    }

    const range = sel.getRangeAt(0);
    const anchorBubble = findBubbleElement(sel.anchorNode);
    const focusBubble = findBubbleElement(sel.focusNode);
    const commonBubble = findBubbleElement(range.commonAncestorContainer);

    const bubbleEl =
      anchorBubble && focusBubble && anchorBubble === focusBubble
        ? anchorBubble
        : commonBubble && anchorBubble && focusBubble
        ? commonBubble
        : null;

    if (!bubbleEl) {
      hidePopover();
      return;
    }

    const messageId = bubbleEl.getAttribute('data-message-id') || '';
    const paneId = bubbleEl.getAttribute('data-pane-id') || 'pane-1';
    if (!messageId) {
      hidePopover();
      return;
    }

    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      hidePopover();
      return;
    }

    const placement: 'above' | 'below' = rect.top < 110 ? 'below' : 'above';
    const rawTop = placement === 'above' ? rect.top - 46 : rect.bottom + 10;
    const clampedTop = Math.max(56, Math.min(window.innerHeight - 48, rawTop));

    const pillWidth = popoverRef.current?.offsetWidth || POPOVER_ESTIMATED_WIDTH;
    const centerX = rect.left + rect.width / 2;
    const rawLeft = centerX - pillWidth / 2;
    const clampedLeft = Math.max(
      EDGE_MARGIN_PX,
      Math.min(window.innerWidth - pillWidth - EDGE_MARGIN_PX, rawLeft)
    );

    setPopover({
      visible: true,
      selection: {
        text: selectedText.slice(0, 500),
        messageId,
        paneId,
      },
      top: clampedTop,
      left: clampedLeft,
      placement,
    });
  }, [hidePopover]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }

    const scheduleEvaluate = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        evaluateSelection();
      }, 60);
    };

    const handleScrollOrResize = () => {
      hidePopover();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hidePopover();
      }
    };

    document.addEventListener('mouseup', scheduleEvaluate);
    document.addEventListener('keyup', scheduleEvaluate);
    document.addEventListener('selectionchange', scheduleEvaluate);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      document.removeEventListener('mouseup', scheduleEvaluate);
      document.removeEventListener('keyup', scheduleEvaluate);
      document.removeEventListener('selectionchange', scheduleEvaluate);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [evaluateSelection, hidePopover]);

  if (Platform.OS !== 'web' || !popover.visible || !popover.selection) {
    return null;
  }

  const isDark = theme.mode === 'dark';
  const pillBg = isDark ? '#1C1C1F' : '#FFFFFF';
  const pillBorder = isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.12)';
  const pillText = isDark ? '#F4F4F5' : '#18181B';
  const pillSubText = isDark ? '#D4D4D8' : '#3F3F46';
  const dividerColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.10)';
  const hoverBg = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';
  const shadow = isDark
    ? '0 10px 28px -6px rgba(0, 0, 0, 0.65), 0 2px 8px -2px rgba(0, 0, 0, 0.45)'
    : '0 10px 28px -6px rgba(15, 23, 42, 0.18), 0 2px 8px -2px rgba(15, 23, 42, 0.08)';

  const clearSelectionAndHide = () => {
    try {
      window.getSelection()?.removeAllRanges();
    } catch {
      // ignore
    }
    hidePopover();
  };

  const baseButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    border: 'none',
    background: 'transparent',
    padding: '6px 12px',
    borderRadius: 999,
    fontSize: 12.5,
    fontWeight: 600,
    letterSpacing: -0.15,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontFamily:
      "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
    transition: 'background-color 120ms ease',
    outline: 'none',
  };

  return (
    <div
      ref={popoverRef}
      role="toolbar"
      aria-label="Hành động trên đoạn văn bản đã chọn"
      style={{
        position: 'fixed',
        top: popover.top,
        left: popover.left,
        zIndex: 9999,
        display: 'inline-flex',
        alignItems: 'center',
        padding: 3,
        borderRadius: 999,
        backgroundColor: pillBg,
        border: `1px solid ${pillBorder}`,
        boxShadow: shadow,
        opacity: popover.visible ? 1 : 0,
        transform: 'translate3d(0, 0, 0)',
        transition: 'opacity 120ms ease, transform 120ms ease',
        userSelect: 'none',
      }}
    >
      <button
        type="button"
        style={{ ...baseButtonStyle, color: pillText }}
        onMouseDown={(e) => {
          e.preventDefault();
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = hoverBg;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
        onClick={() => {
          const sel = popover.selection;
          clearSelectionAndHide();
          if (sel) onAskWithQuote(sel);
        }}
      >
        <span>✦ Hỏi Tomorrow</span>
      </button>

      <div
        style={{
          width: 1,
          height: 16,
          backgroundColor: dividerColor,
          margin: '0 1px',
          flexShrink: 0,
        }}
      />

      <button
        type="button"
        style={{ ...baseButtonStyle, color: pillSubText, fontWeight: 500 }}
        onMouseDown={(e) => {
          e.preventDefault();
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = hoverBg;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
        onClick={() => {
          const sel = popover.selection;
          clearSelectionAndHide();
          if (sel) onQuickExplain(sel);
        }}
      >
        <span>Giải thích kỹ</span>
      </button>
    </div>
  );
};
