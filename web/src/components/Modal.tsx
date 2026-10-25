import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: ModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="modal-layer" role="presentation">
      <button
        type="button"
        className="modal-backdrop"
        aria-label="关闭对话框"
        onClick={onClose}
      />
      <section
        className={`modal-card ${wide ? 'modal-card-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <header className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button
            className="icon-button"
            type="button"
            aria-label="关闭"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer !== undefined ? (
          <footer className="modal-footer">{footer}</footer>
        ) : null}
      </section>
    </div>,
    document.body,
  );
}
