import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

export interface LoanAsset {
  name: string;
  symbol: string;
  amount: number;
  value: number;
}

export interface LoanApplication {
  id: string;
  totalCollateral: number;
  loanAmount: number;
  interestRate: number;
  ltv: number;
  selectedAssets: LoanAsset[];
  status: 'pending' | 'approved' | 'rejected' | 'active' | 'completed';
  submittedAt: string;
  updatedAt: string;
}

interface LoanState {
  applications: LoanApplication[];
  activeLoan: LoanApplication | null;
}

interface LoanActions {
  addApplication: (application: Omit<LoanApplication, 'id' | 'status' | 'submittedAt' | 'updatedAt'>) => string;
  updateApplicationStatus: (id: string, status: LoanApplication['status']) => void;
  setActiveLoan: (loan: LoanApplication | null) => void;
  getApplicationById: (id: string) => LoanApplication | undefined;
  clearApplications: () => void;
}

type LoanStore = LoanState & LoanActions;

const initialState: LoanState = {
  applications: [],
  activeLoan: null,
};

// Generate application ID
const generateApplicationId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = 'ALT-';
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
};

export const useLoanStore = create<LoanStore>()(
  persist(
    immer((set, get) => ({
      ...initialState,

      addApplication: (applicationData) => {
        const id = generateApplicationId();
        const now = new Date().toISOString();

        const newApplication: LoanApplication = {
          ...applicationData,
          id,
          status: 'pending',
          submittedAt: now,
          updatedAt: now,
        };

        set((state) => {
          state.applications.unshift(newApplication);
        });

        return id;
      },

      updateApplicationStatus: (id, status) =>
        set((state) => {
          const application = state.applications.find(app => app.id === id);
          if (application) {
            application.status = status;
            application.updatedAt = new Date().toISOString();
          }
        }),

      setActiveLoan: (loan) =>
        set((state) => {
          state.activeLoan = loan;
        }),

      getApplicationById: (id) => {
        return get().applications.find(app => app.id === id);
      },

      clearApplications: () =>
        set((state) => {
          state.applications = [];
          state.activeLoan = null;
        }),
    })),
    {
      name: 'altrion-loans',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// Selectors
export const selectApplications = (state: LoanStore) => state.applications;
export const selectActiveLoan = (state: LoanStore) => state.activeLoan;
export const selectPendingApplications = (state: LoanStore) =>
  state.applications.filter(app => app.status === 'pending');
export const selectActiveLoans = (state: LoanStore) =>
  state.applications.filter(app => app.status === 'active');
