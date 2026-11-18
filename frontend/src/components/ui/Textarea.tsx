import { useId, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { FieldWrapper, fieldBorder } from './Input';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    error?: string;
    hint?: ReactNode;
    wrapperClassName?: string;
}

const Textarea = ({ label, error, hint, wrapperClassName, id, required, rows = 3, className = '', ...rest }: TextareaProps) => {
    const autoId = useId();
    const textareaId = id ?? autoId;

    return (
        <FieldWrapper id={textareaId} label={label} required={required} error={error} hint={hint} className={wrapperClassName}>
            <textarea
                id={textareaId}
                rows={rows}
                required={required}
                aria-invalid={error ? true : undefined}
                className={`rounded-md text-black dark:text-white border bg-white dark:bg-[#0c1427] p-[17px] block w-full outline-0 transition-all placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:border-primary-500 ${fieldBorder(error)} ${className}`}
                {...rest}
            />
        </FieldWrapper>
    );
};

export default Textarea;
