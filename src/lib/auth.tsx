import {
  adminClient,
  apiKeyClient,
  organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";

import { RESET_FLAG_KEY } from "@/livestore/store";

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [organizationClient(), apiKeyClient(), adminClient()],
});

export interface AuthState {
  userId: string | null;
  orgId: string | null;
  isAuthenticated: boolean;
  role: string | null;
  approved: boolean;
}

type AuthContextType = AuthState & {
  isLoading: boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({
    approved: false,
    isAuthenticated: false,
    orgId: null,
    role: null,
    userId: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  const updateAuthFromSession = useCallback(
    (session: Awaited<ReturnType<typeof authClient.getSession>>["data"]) => {
      if (session?.user) {
        const user = session.user as typeof session.user & {
          approved?: boolean;
        };
        const isApproved = user.approved ?? false;

        setAuth({
          approved: isApproved,
          isAuthenticated: isApproved && !!session.session.activeOrganizationId,
          orgId: isApproved
            ? (session.session.activeOrganizationId ?? null)
            : null,
          role: user.role ?? "user",
          userId: user.id,
        });
      }
    },
    []
  );

  useEffect(() => {
    authClient.getSession().then(({ data: session }) => {
      updateAuthFromSession(session);
      setIsLoading(false);
    });
  }, [updateAuthFromSession]);

  const logout = useCallback(async () => {
    try {
      localStorage.setItem(RESET_FLAG_KEY, "true");
    } catch {
      // localStorage not available
    }
    await authClient.signOut();
    setAuth({
      approved: false,
      isAuthenticated: false,
      orgId: null,
      role: null,
      userId: null,
    });
  }, []);

  const refresh = useCallback(async () => {
    const { data: session } = await authClient.getSession();
    updateAuthFromSession(session);
  }, [updateAuthFromSession]);

  return (
    <AuthContext.Provider value={{ ...auth, isLoading, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
