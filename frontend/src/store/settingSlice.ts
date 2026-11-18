import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { errorMessage } from '@/services/api.service';
import { settingService } from '@/services/setting.service';
import type { StoreSetting } from '@/types/setting.types';

interface SettingState {
    store: StoreSetting | null;
    /** true once /settings answered, so "null" can be told apart from "not loaded yet". */
    loaded: boolean;
}

const initialState: SettingState = { store: null, loaded: false };

export const fetchSettings = createAsyncThunk<StoreSetting | null, void, { rejectValue: string }>('setting/fetch', async (_, { rejectWithValue }) => {
    try {
        const res = await settingService.get();
        return res.data ?? null;
    } catch (err) {
        return rejectWithValue(errorMessage(err));
    }
});

const settingSlice = createSlice({
    name: 'setting',
    initialState,
    reducers: {
        setStoreSetting(state, action: PayloadAction<StoreSetting>) {
            state.store = action.payload;
            state.loaded = true;
        },
    },
    extraReducers: (builder) => {
        builder.addCase(fetchSettings.fulfilled, (state, action) => {
            state.store = action.payload;
            state.loaded = true;
        });
    },
});

export const { setStoreSetting } = settingSlice.actions;
export default settingSlice.reducer;
