import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import { toggleSidebar } from '@/store/themeConfigSlice';
import DarkMode from './DarkMode';
import Fullscreen from './Fullscreen';
import Notifications from './Notifications';
import ProfileMenu from './ProfileMenu';

/** Trezo header without search, apps, language and RTL settings. */
const Header = () => {
    const dispatch = useAppDispatch();
    const sidebarToggled = useAppSelector((s) => s.themeConfig.sidebarToggled);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 100);
        document.addEventListener('scroll', onScroll, { passive: true });
        return () => document.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <header className={`header-area bg-white dark:bg-[#0c1427] py-[13px] px-[20px] md:px-[25px] fixed top-0 z-[6] rounded-b-md transition-all ${scrolled ? 'shadow-sm' : ''}`}>
            <div className="flex items-center justify-between">
                <button
                    type="button"
                    className={`transition-all inline-block leading-none hover:text-primary-500 ${sidebarToggled ? 'text-primary-500' : ''}`}
                    onClick={() => dispatch(toggleSidebar())}
                    aria-label="Tampilkan/sembunyikan menu"
                >
                    <i className="material-symbols-outlined !text-[22px]">menu</i>
                </button>

                <div className="flex items-center">
                    <DarkMode />
                    <Fullscreen />
                    <Notifications />
                    <ProfileMenu />
                </div>
            </div>
        </header>
    );
};

export default Header;
