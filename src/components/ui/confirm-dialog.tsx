import { Button } from "./button";
import { Dialog, Modal, ModalOverlay } from "./modal";
import type { ReactNode } from "react";
import { GlassSurface } from "./glass";

/** 与应用设计语言一致的确认对话框；用于删除等不可逆操作，替代原生 window.confirm。 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = "确认",
  busy = false,
  danger = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <ModalOverlay
      isOpen={open}
      onOpenChange={(next) => !next && onClose()}
      isDismissable
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(15,18,26,.32)] backdrop-blur-[3px]"
    >
      <Modal>
        <Dialog aria-label={title} className="outline-none">
          <GlassSurface radius={20} blur={8} className="w-[380px] max-w-full p-5">
            <h2 className="text-[15px] font-semibold text-ink-1">{title}</h2>
            {children && (
              <div className="mt-1.5 text-[12px] text-ink-3 leading-relaxed">
                {children}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button className="btn btn-outline" onPress={onClose} isDisabled={busy}>
                取消
              </Button>
              <Button
                className={danger ? "btn btn-danger" : "btn btn-accent"}
                isDisabled={busy}
                onPress={onConfirm}
              >
                {busy ? "处理中…" : confirmLabel}
              </Button>
            </div>
          </GlassSurface>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
