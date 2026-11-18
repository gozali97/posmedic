import Swal from 'sweetalert2';

const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
});

export const toast = {
    success: (title: string) => Toast.fire({ icon: 'success', title }),
    error: (title: string) => Toast.fire({ icon: 'error', title, timer: 5000 }),
    warning: (title: string) => Toast.fire({ icon: 'warning', title, timer: 5000 }),
    info: (title: string) => Toast.fire({ icon: 'info', title }),
};

interface ConfirmOptions {
    title: string;
    text?: string;
    confirmText?: string;
    danger?: boolean;
}

/**
 * Resolves true only when the user presses the confirm button.
 * Waits for the close animation: SweetAlert removes aria-hidden from #root only then, and a Headless UI dialog
 * opened earlier would record that aria-hidden and restore it on close, hiding the whole app from screen readers.
 */
export const confirmDialog = async ({ title, text, confirmText = 'Ya, lanjutkan', danger = false }: ConfirmOptions): Promise<boolean> => {
    let markClosed: () => void = () => {};
    const closed = new Promise<void>((resolve) => (markClosed = resolve));
    const result = await Swal.fire({
        didClose: () => markClosed(),
        title,
        text,
        icon: danger ? 'warning' : 'question',
        showCancelButton: true,
        confirmButtonText: confirmText,
        cancelButtonText: 'Batal',
        confirmButtonColor: danger ? '#ff4023' : '#1e56a8',
        cancelButtonColor: '#64748b',
        focusCancel: danger,
        reverseButtons: true,
    });
    await closed;
    return result.isConfirmed;
};
