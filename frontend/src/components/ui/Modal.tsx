import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react';
import type { ReactNode } from 'react';

const SIZES = {
    sm: 'sm:max-w-[420px]',
    md: 'sm:max-w-[550px]',
    lg: 'sm:max-w-[800px]',
    xl: 'sm:max-w-[1100px]',
};

interface ModalProps {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    size?: keyof typeof SIZES;
    children: ReactNode;
    /** Rendered under the body, right-aligned (action buttons). */
    footer?: ReactNode;
}

/** Ported from Trezo UIElements/Modal/LiveDemo. Esc and backdrop click close it (Headless UI). */
const Modal = ({ open, onClose, title, size = 'md', children, footer }: ModalProps) => (
    <Dialog open={open} onClose={onClose} className="relative z-[50]">
        <DialogBackdrop
            transition
            className="fixed inset-0 bg-gray-500/75 transition-opacity data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in"
        />
        <div className="fixed inset-0 z-[50] w-screen overflow-y-auto">
            <div className="flex min-h-full items-end justify-center p-4 sm:items-center sm:p-0">
                <DialogPanel
                    transition
                    className={`relative w-full transform overflow-hidden rounded-md bg-white dark:bg-[#0c1427] text-left shadow-xl transition-all data-[closed]:translate-y-4 data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in sm:my-8 data-[closed]:sm:translate-y-0 data-[closed]:sm:scale-95 ${SIZES[size]}`}
                >
                    <div className="bg-gray-50 dark:bg-[#15203c] flex items-center justify-between p-[20px] md:p-[25px]">
                        <DialogTitle as="h5" className="!mb-0">
                            {title}
                        </DialogTitle>
                        <button type="button" className="leading-none text-black dark:text-white transition-all hover:text-primary-500" onClick={onClose} aria-label="Tutup">
                            <i className="material-symbols-outlined !text-[23px]">close</i>
                        </button>
                    </div>
                    <div className="p-[20px] md:p-[25px]">{children}</div>
                    {footer && <div className="px-[20px] md:px-[25px] pb-[20px] md:pb-[25px] flex flex-wrap justify-end gap-[12px]">{footer}</div>}
                </DialogPanel>
            </div>
        </div>
    </Dialog>
);

export default Modal;
