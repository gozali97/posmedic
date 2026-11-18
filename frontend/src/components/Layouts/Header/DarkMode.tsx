import { useAppDispatch, useAppSelector } from '@/store';
import { toggleTheme } from '@/store/themeConfigSlice';

const DarkMode = () => {
    const dispatch = useAppDispatch();
    const isDark = useAppSelector((s) => s.themeConfig.theme === 'dark');

    return (
        <div className="relative mx-[8px] md:mx-[10px] lg:mx-[12px] first:ml-0 last:mr-0">
            <button
                type="button"
                className="leading-none inline-block transition-all relative top-[2px] text-[#fe7a36]"
                onClick={() => dispatch(toggleTheme())}
                aria-label={isDark ? 'Mode terang' : 'Mode gelap'}
                title={isDark ? 'Mode terang' : 'Mode gelap'}
            >
                <i className="material-symbols-outlined !text-[20px] md:!text-[22px]">{isDark ? 'light_mode' : 'dark_mode'}</i>
            </button>
        </div>
    );
};

export default DarkMode;
