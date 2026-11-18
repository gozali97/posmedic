import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useDropdown } from '@/hooks/useDropdown';
import { useAppDispatch, useAppSelector } from '@/store';
import { logout } from '@/store/authSlice';

const initials = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]!.toUpperCase())
        .join('') || '?';

const itemClass = 'flex items-center gap-[10px] w-full py-[7px] px-[20px] text-black dark:text-white transition-all hover:text-primary-500 text-left';

const ProfileMenu = () => {
    const { open, toggle, setOpen, ref } = useDropdown();
    const user = useAppSelector((s) => s.auth.user);
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => setOpen(false), [location.pathname, setOpen]);

    const handleLogout = async () => {
        await dispatch(logout());
        navigate('/login', { replace: true });
    };

    if (!user) return null;

    return (
        <div className="relative mx-[8px] md:mx-[10px] lg:mx-[12px] first:ml-0 last:mr-0" ref={ref}>
            <button type="button" onClick={toggle} className="flex items-center gap-[8px] text-black dark:text-white" aria-expanded={open} aria-haspopup="menu">
                <span className="w-[35px] h-[35px] md:w-[42px] md:h-[42px] rounded-full border-[2px] border-primary-200 bg-primary-50 text-primary-600 dark:bg-[#15203c] dark:text-primary-300 flex items-center justify-center font-semibold">
                    {initials(user.fullname)}
                </span>
                <span className="hidden lg:block font-semibold">{user.fullname}</span>
                <i className="material-symbols-outlined !text-[18px]" aria-hidden="true">
                    expand_more
                </i>
            </button>

            {open && (
                <div className="bg-white dark:bg-[#0c1427] shadow-3xl dark:shadow-none py-[22px] absolute mt-[13px] md:mt-[14px] w-[220px] z-[1] top-full right-0 rounded-md" role="menu">
                    <div className="border-b border-gray-100 dark:border-[#172036] pb-[12px] mx-[20px] mb-[10px]">
                        <span className="block text-black dark:text-white font-medium truncate">{user.fullname}</span>
                        <span className="block text-xs">@{user.username}</span>
                    </div>
                    <ul>
                        <li>
                            <Link to="/profile" className={itemClass} role="menuitem">
                                <i className="material-symbols-outlined !text-[22px]">account_circle</i>
                                Profil & Password
                            </Link>
                        </li>
                        <li>
                            <button type="button" className={itemClass} onClick={handleLogout} role="menuitem">
                                <i className="material-symbols-outlined !text-[22px]">logout</i>
                                Logout
                            </button>
                        </li>
                    </ul>
                </div>
            )}
        </div>
    );
};

export default ProfileMenu;
