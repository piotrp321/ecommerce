import { createContext, useContext } from 'react';

export type ToastTone = 'success' | 'danger' | 'info';

export type ShowToast = (message: string, tone?: ToastTone) => void;

export const ToastContext = createContext<ShowToast>(() => undefined);

export function useToast(): ShowToast {
  return useContext(ToastContext);
}
