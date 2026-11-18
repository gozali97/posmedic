import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import authReducer from './authSlice';
import cartReducer from './cartSlice';
import settingReducer from './settingSlice';
import themeConfigReducer from './themeConfigSlice';

export const store = configureStore({
    reducer: {
        auth: authReducer,
        cart: cartReducer,
        setting: settingReducer,
        themeConfig: themeConfigReducer,
    },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
