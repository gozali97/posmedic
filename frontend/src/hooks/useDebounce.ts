import { useEffect, useState } from 'react';

/** Returns `value` after it stopped changing for `delay` ms (search boxes). */
export const useDebounce = <T>(value: T, delay = 400): T => {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
};
