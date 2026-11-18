import { useId } from 'react';

interface SearchInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

/** Search box from the Trezo DataTable header. */
const SearchInput = ({ value, onChange, placeholder = 'Cari…', className = 'sm:w-[280px]' }: SearchInputProps) => {
    const id = useId();
    return (
        <div className={`relative w-full ${className}`}>
            <label htmlFor={id} className="sr-only">
                {placeholder}
            </label>
            <i className="material-symbols-outlined !text-[20px] absolute left-[11px] top-1/2 -translate-y-1/2 text-black dark:text-white pointer-events-none" aria-hidden="true">
                search
            </i>
            <input
                id={id}
                type="search"
                placeholder={placeholder}
                className="bg-gray-50 border border-gray-50 h-[36px] text-xs rounded-md w-full block text-black pl-[38px] pr-[13px] placeholder:text-gray-500 outline-0 focus:border-primary-500 dark:bg-[#15203c] dark:text-white dark:border-[#15203c] dark:placeholder:text-gray-400"
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
        </div>
    );
};

export default SearchInput;
