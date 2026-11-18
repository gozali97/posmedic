import { useMemo } from 'react';
import { Link, NavLink } from 'react-router';
import { storageUrl } from '@/config/api';
import { useAppDispatch, useAppSelector } from '@/store';
import { closeSidebar, toggleSidebar } from '@/store/themeConfigSlice';
import { menuForUser } from './menu';

/** Rewritten from Trezo Layout/SidebarMenu: one flat menu built from MENU, filtered by the user's flags. */
const Sidebar = () => {
    const dispatch = useAppDispatch();
    const user = useAppSelector((s) => s.auth.user);
    const store = useAppSelector((s) => s.setting.store);
    const sections = useMemo(() => menuForUser(user), [user]);
    const logo = storageUrl(store?.logo);

    // On small screens the sidebar overlays the page, so close it after picking a page.
    const handleNavigate = () => {
        if (window.innerWidth < 1280) dispatch(closeSidebar());
    };

    return (
        <aside className="sidebar-area bg-white dark:bg-[#0c1427] fixed z-[7] top-0 h-screen transition-all rounded-r-md" aria-label="Menu utama">
            <div className="logo bg-white dark:bg-[#0c1427] border-b border-gray-100 dark:border-[#172036] px-[25px] pt-[19px] pb-[15px] absolute z-[2] right-0 top-0 left-0">
                <Link to="/app" className="transition-none relative flex items-center gap-[8px] outline-none pr-[30px]" onClick={handleNavigate}>
                    <img src={logo || '/images/icon.png'} alt="" className="w-[32px] h-[32px] object-contain" />
                    <span className="font-bold text-black dark:text-white text-lg truncate">{store?.store_name || 'POS Apotek'}</span>
                </Link>
                <button
                    type="button"
                    className="burger-menu inline-block absolute z-[3] top-[24px] right-[25px] transition-all hover:text-primary-500"
                    onClick={() => dispatch(toggleSidebar())}
                    aria-label="Tutup menu"
                >
                    <i className="material-symbols-outlined">close</i>
                </button>
            </div>

            <nav className="pt-[89px] px-[22px] pb-[20px] h-screen overflow-y-scroll sidebar-custom-scrollbar">
                {sections.map((section, i) => (
                    <div key={section.title} className={i > 0 ? 'mt-[22px]' : ''}>
                        <span className="block relative font-medium uppercase text-gray-400 mb-[8px] text-xs">{section.title}</span>
                        <ul>
                            {section.items.map((item) => (
                                <li key={item.to} className="mb-[5px] whitespace-nowrap">
                                    <NavLink
                                        to={item.to}
                                        end={item.to === '/app'}
                                        onClick={handleNavigate}
                                        className="sidebar-link flex items-center gap-[7px] transition-all py-[9px] px-[14px] rounded-md font-medium w-full text-black dark:text-white hover:bg-gray-50 dark:hover:bg-[#15203c]"
                                    >
                                        <i className="material-symbols-outlined transition-all text-gray-500 dark:text-gray-400 !text-[22px] leading-none" aria-hidden="true">
                                            {item.icon}
                                        </i>
                                        <span className="leading-none">{item.label}</span>
                                    </NavLink>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </nav>
        </aside>
    );
};

export default Sidebar;
