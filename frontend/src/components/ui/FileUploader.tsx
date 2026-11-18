import { useEffect, useId, useRef, useState } from 'react';

const DEFAULT_ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

interface FileUploaderProps {
    label?: string;
    /** Newly chosen file, not yet uploaded. */
    file: File | null;
    /** URL of the image already saved on the server. */
    currentUrl?: string | null;
    onChange: (file: File | null) => void;
    /** Called when the user removes the saved image (send remove_* to the backend). */
    onRemoveCurrent?: () => void;
    accept?: string[];
    maxBytes?: number;
    error?: string;
}

/**
 * Image picker with preview. Checks type and size in the browser for quick feedback;
 * the backend still validates MIME, extension and size.
 */
const FileUploader = ({ label, file, currentUrl, onChange, onRemoveCurrent, accept = DEFAULT_ACCEPT, maxBytes = DEFAULT_MAX_BYTES, error }: FileUploaderProps) => {
    const id = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [localError, setLocalError] = useState('');
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!file) {
            setPreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    const handleSelect = (selected: File | undefined) => {
        if (inputRef.current) inputRef.current.value = '';
        if (!selected) return;
        if (!accept.includes(selected.type)) {
            setLocalError('Format file harus JPG, PNG, atau WEBP');
            return;
        }
        if (selected.size > maxBytes) {
            setLocalError(`Ukuran file maksimal ${Math.round(maxBytes / 1024 / 1024)} MB`);
            return;
        }
        setLocalError('');
        onChange(selected);
    };

    const shown = previewUrl ?? currentUrl ?? null;
    const message = localError || error;

    return (
        <div>
            {label && (
                <label htmlFor={id} className="mb-[10px] text-black dark:text-white font-medium block">
                    {label}
                </label>
            )}
            <div className="flex flex-wrap items-center gap-[15px]">
                <div className="w-[96px] h-[96px] rounded-md border border-dashed border-gray-200 dark:border-[#172036] bg-gray-50 dark:bg-[#15203c] flex items-center justify-center overflow-hidden">
                    {shown ? <img src={shown} alt="Pratinjau" className="max-w-full max-h-full object-contain" /> : <i className="material-symbols-outlined !text-[32px] text-gray-400">image</i>}
                </div>
                <div className="flex flex-wrap gap-[10px]">
                    <label
                        htmlFor={id}
                        className="cursor-pointer inline-flex items-center gap-[6px] rounded-md border border-primary-500 text-primary-500 py-[8px] px-[16px] font-medium transition-all hover:bg-primary-500 hover:text-white focus-within:outline-2 focus-within:outline-primary-500"
                    >
                        <i className="material-symbols-outlined !text-[20px]">upload</i>
                        Pilih gambar
                        <input ref={inputRef} id={id} type="file" accept={accept.join(',')} className="sr-only" onChange={(e) => handleSelect(e.target.files?.[0])} />
                    </label>
                    {file && (
                        <button
                            type="button"
                            className="rounded-md border border-gray-200 dark:border-[#172036] py-[8px] px-[16px] transition-all hover:border-danger-500 hover:text-danger-500"
                            onClick={() => onChange(null)}
                        >
                            Batalkan
                        </button>
                    )}
                    {!file && currentUrl && onRemoveCurrent && (
                        <button
                            type="button"
                            className="rounded-md border border-gray-200 dark:border-[#172036] py-[8px] px-[16px] transition-all hover:border-danger-500 hover:text-danger-500"
                            onClick={onRemoveCurrent}
                        >
                            Hapus gambar
                        </button>
                    )}
                </div>
            </div>
            {message ? (
                <p className="!mt-[6px] !mb-0 text-sm text-danger-500" role="alert">
                    {message}
                </p>
            ) : (
                <p className="!mt-[6px] !mb-0 text-sm text-gray-500 dark:text-gray-400">JPG, PNG, atau WEBP, maks. {Math.round(maxBytes / 1024 / 1024)} MB.</p>
            )}
        </div>
    );
};

export default FileUploader;
