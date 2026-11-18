import { createSlice } from '@reduxjs/toolkit';

type Theme = 'light' | 'dark';

const readTheme = (): Theme => {
    try {
        return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
    } catch {
        return 'light';
    }
};

const applyTheme = (theme: Theme) => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
        localStorage.setItem('theme', theme);
    } catch {
        /* ignore */
    }
};

interface ThemeConfigState {
    theme: Theme;
    /** Trezo's `active` flag: shows the sidebar on small screens, hides it on xl. */
    sidebarToggled: boolean;
}

const initialState: ThemeConfigState = { theme: readTheme(), sidebarToggled: false };
applyTheme(initialState.theme);

const themeConfigSlice = createSlice({
    name: 'themeConfig',
    initialState,
    reducers: {
        toggleTheme(state) {
            state.theme = state.theme === 'dark' ? 'light' : 'dark';
            applyTheme(state.theme);
        },
        toggleSidebar(state) {
            state.sidebarToggled = !state.sidebarToggled;
        },
        closeSidebar(state) {
            state.sidebarToggled = false;
        },
    },
});

export const { toggleTheme, toggleSidebar, closeSidebar } = themeConfigSlice.actions;
export default themeConfigSlice.reducer;
