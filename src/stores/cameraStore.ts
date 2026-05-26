import { create } from "zustand";

type CameraState = {
  permitted: boolean;
  active: boolean;
  loading: boolean;
  error: string | null;
  setPermitted: (permitted: boolean) => void;
  setActive: (active: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
};

export const useCameraStore = create<CameraState>((set) => ({
  permitted: false,
  active: false,
  loading: false,
  error: null,
  setPermitted: (permitted) => set({ permitted }),
  setActive: (active) => set({ active }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  reset: () => set({ permitted: false, active: false, loading: false, error: null })
}));
