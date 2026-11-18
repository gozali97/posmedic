import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { TOKEN_KEYS } from '@/config/api';
import { errorMessage, tokenStorage } from '@/services/api.service';
import { authService } from '@/services/auth.service';
import type { LoginData, LoginRequest, User } from '@/types/auth.types';

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    loading: boolean;
}

const readStoredUser = (): User | null => {
    const raw = tokenStorage.get(TOKEN_KEYS.user);
    if (!raw || !tokenStorage.access()) return null;
    try {
        return JSON.parse(raw) as User;
    } catch {
        return null;
    }
};

const storedUser = readStoredUser();

const initialState: AuthState = {
    user: storedUser,
    isAuthenticated: storedUser !== null,
    loading: false,
};

export const login = createAsyncThunk<LoginData, LoginRequest, { rejectValue: string }>('auth/login', async (body, { rejectWithValue }) => {
    try {
        const res = await authService.login(body);
        tokenStorage.save(res.data!);
        return res.data!;
    } catch (err) {
        return rejectWithValue(errorMessage(err, 'Login gagal'));
    }
});

/** Reloads the current user so permission changes made by an admin apply without re-login. */
export const fetchMe = createAsyncThunk<User, void, { rejectValue: string }>('auth/fetchMe', async (_, { rejectWithValue }) => {
    try {
        const res = await authService.me();
        return res.data!;
    } catch (err) {
        return rejectWithValue(errorMessage(err));
    }
});

export const logout = createAsyncThunk('auth/logout', async () => {
    try {
        await authService.logout();
    } catch {
        /* the local session is cleared regardless */
    }
    tokenStorage.clear();
});

const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        /** Called when the API reports the session is gone (expired, or a login elsewhere). */
        sessionExpired(state) {
            state.user = null;
            state.isAuthenticated = false;
        },
        setUser(state, action: PayloadAction<User>) {
            state.user = action.payload;
            tokenStorage.set(TOKEN_KEYS.user, JSON.stringify(action.payload));
        },
    },
    extraReducers: (builder) => {
        builder
            .addCase(login.pending, (state) => {
                state.loading = true;
            })
            .addCase(login.fulfilled, (state, action) => {
                state.loading = false;
                state.user = action.payload.user;
                state.isAuthenticated = true;
            })
            .addCase(login.rejected, (state) => {
                state.loading = false;
            })
            .addCase(fetchMe.fulfilled, (state, action) => {
                state.user = action.payload;
                tokenStorage.set(TOKEN_KEYS.user, JSON.stringify(action.payload));
            })
            .addCase(logout.fulfilled, (state) => {
                state.user = null;
                state.isAuthenticated = false;
            });
    },
});

export const { sessionExpired, setUser } = authSlice.actions;
export default authSlice.reducer;
