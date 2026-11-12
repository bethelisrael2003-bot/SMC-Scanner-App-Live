import React, { useEffect, useState, useRef } from "react";
import { X, AlertTriangle, AlertCircle, ShieldAlert } from "lucide-react";
import { Button } from "./Button";

export type ModalVariant = "primary" | "destructive" | "warning" | "secondary";
export type ModalSafetyLevel = "level2" | "level3";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: ModalVariant;
  level?: ModalSafetyLevel;
  checkboxLabel?: string;
  isLoading?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "primary",
  level = "level2",
  checkboxLabel,
  isLoading = false,
  icon,
  children,
}) => {
  const [isAcknowledged, setIsAcknowledged] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);
  const isMountedRef = useRef(true);
  const onCloseRef = useRef(onClose);
  const isLoadingRef = useRef(isLoading);
  const actionInProgressRef = useRef(actionInProgress);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    onCloseRef.current = onClose;
    isLoadingRef.current = isLoading;
    actionInProgressRef.current = actionInProgress;
  });

  // Reset acknowledgment when modal re-opens
  useEffect(() => {
    if (isOpen) {
      setIsAcknowledged(false);
      setActionInProgress(false);
    }
  }, [isOpen]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Keyboard Escape dismissal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isLoadingRef.current && !actionInProgressRef.current) {
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Android Hardware Back / Browser Popstate Coordination
  // Pushes a synthetic history frame ONLY ONCE when opened; pops and cancels when back is pressed.
  useEffect(() => {
    if (!isOpen) return;

    if (typeof window !== "undefined") {
      (window as any).__apexActiveModalCount = ((window as any).__apexActiveModalCount || 0) + 1;
    }

    const historyKey = `apex_modal_${Date.now()}`;
    window.history.pushState({ modalId: historyKey }, "");

    let isDismissedByPop = false;

    const handlePopState = () => {
      isDismissedByPop = true;
      if (typeof window !== "undefined") {
        (window as any).__apexActiveModalCount = Math.max(0, ((window as any).__apexActiveModalCount || 1) - 1);
      }
      if (!isLoadingRef.current && !actionInProgressRef.current) {
        onCloseRef.current();
      }
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (!isDismissedByPop) {
        if (typeof window !== "undefined") {
          (window as any).__apexActiveModalCount = Math.max(0, ((window as any).__apexActiveModalCount || 1) - 1);
        }
        if (window.history.state?.modalId === historyKey) {
          window.history.back();
        }
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isBusy = isLoading || actionInProgress;
  const canConfirm = level === "level2" || (level === "level3" && isAcknowledged);

  const handleSafeConfirm = async () => {
    if (isBusy || !canConfirm) return;
    setActionInProgress(true);
    try {
      await onConfirm();
    } finally {
      if (isMountedRef.current) {
        setActionInProgress(false);
      }
    }
  };

  const variantStyles = {
    primary: {
      iconBg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      buttonVariant: "primary" as const,
      defaultIcon: <AlertCircle className="w-4 h-4 text-emerald-400" />,
    },
    destructive: {
      iconBg: "bg-rose-500/10 text-rose-400 border-rose-500/20",
      buttonVariant: "destructive" as const,
      defaultIcon: <AlertTriangle className="w-4 h-4 text-rose-400" />,
    },
    warning: {
      iconBg: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      buttonVariant: "secondary" as const,
      defaultIcon: <ShieldAlert className="w-4 h-4 text-amber-400" />,
    },
    secondary: {
      iconBg: "bg-zinc-800/40 text-zinc-400 border-zinc-700/40",
      buttonVariant: "secondary" as const,
      defaultIcon: <AlertCircle className="w-4 h-4 text-zinc-400" />,
    },
  };

  const activeStyle = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Darkened Backdrop with Blur */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity duration-150"
        onClick={() => !isBusy && onClose()}
      />

      {/* Modal Card */}
      <div
        className="relative z-10 w-full max-w-sm sm:max-w-md bg-[#0E131A] border border-[#1E2633] rounded-2xl shadow-2xl p-5 space-y-4 font-mono animate-in fade-in zoom-in-95 duration-150 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className={`p-2 rounded-xl border shrink-0 ${activeStyle.iconBg}`}>
              {icon || activeStyle.defaultIcon}
            </span>
            <h3 className="text-sm font-bold text-white tracking-tight">{title}</h3>
          </div>
          <button
            onClick={() => !isBusy && onClose()}
            disabled={isBusy}
            className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800/60 transition-colors cursor-pointer shrink-0 disabled:opacity-40"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content & Description */}
        {description && (
          <div className="text-xs text-zinc-300 leading-relaxed font-sans">{description}</div>
        )}

        {children}

        {/* Level 3 Deliberate Acknowledgment Checkbox */}
        {level === "level3" && (
          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-zinc-950/80 border border-zinc-800 text-xs text-zinc-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isAcknowledged}
              onChange={(e) => setIsAcknowledged(e.target.checked)}
              disabled={isBusy}
              className="mt-0.5 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500/20"
            />
            <span className="leading-snug">
              {checkboxLabel || "I understand the consequences of this action and wish to proceed."}
            </span>
          </label>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#1E2633]">
          <Button
            type="button"
            variant="ghost"
            size="md"
            disabled={isBusy}
            onClick={onClose}
          >
            {cancelText}
          </Button>

          <Button
            type="button"
            variant={activeStyle.buttonVariant}
            size="md"
            isLoading={isBusy}
            disabled={!canConfirm || isBusy}
            onClick={handleSafeConfirm}
            className={
              variant === "warning"
                ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 font-bold"
                : ""
            }
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
};
