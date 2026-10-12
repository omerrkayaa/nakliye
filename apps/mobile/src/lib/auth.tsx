import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import type { Role } from "@nakliye/shared";
import { api, ApiError, bindSession } from "./api";
import { storage } from "./storage";
import type { Me, Tokens } from "./types";

const REFRESH_KEY = "nk_rt";

type Status = "loading" | "signedOut" | "signedIn" | "offline";

interface AuthState {
  status: Status;
  me: Me | null;
  /** Oturum neden kapandı (askı, hesap silindi): giriş ekranında bir kez gösterilir */
  notice: string | null;
  signIn: (t: Tokens) => Promise<void>;
  signOut: () => Promise<void>;
  /** Sunucuda zaten kapanmış oturumu (ör. hesap silindi) yerelde kapatır ve giriş ekranında not gösterir */
  endSession: (notice: string) => Promise<void>;
  addRoles: (roles: Role[]) => Promise<void>;
  /** Profil (ad, firma) değişince /me'yi yeniden oku */
  refreshMe: () => Promise<void>;
  /** Açılışta sunucuya ulaşılamadıysa tekrar dene */
  retry: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<Status>("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const onTokens = useCallback((t: Tokens | null, reason?: string) => {
    if (t) void storage.set(REFRESH_KEY, t.refreshToken);
    else {
      // API oturumu reddetti (yenileme belirteci geçersiz ya da süresi dolmuş, hesap askıya alındı)
      void storage.remove(REFRESH_KEY);
      setMe(null);
      setNotice(reason ?? null);
      setStatus("signedOut");
    }
  }, []);

  // Açılış: kayıtlı yenileme belirteciyle oturumu geri yükle
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const refreshToken = await storage.get(REFRESH_KEY);
      if (!refreshToken) {
        bindSession(null, onTokens);
        if (!cancelled) setStatus("signedOut");
        return;
      }
      try {
        const t = await api<Tokens>("/auth/refresh", { method: "POST", body: { refreshToken }, auth: false });
        bindSession(t, onTokens);
        onTokens(t);
        const m = await api<Me>("/me");
        if (cancelled) return;
        setMe(m);
        setStatus("signedIn");
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 0) return setStatus("offline");
        await storage.remove(REFRESH_KEY);
        bindSession(null, onTokens);
        setStatus("signedOut");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, onTokens]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      me,
      notice,
      signIn: async (t) => {
        bindSession(t, onTokens);
        onTokens(t);
        setMe(await api<Me>("/me"));
        setNotice(null);
        setStatus("signedIn");
      },
      signOut: async () => {
        const refreshToken = await storage.get(REFRESH_KEY);
        if (refreshToken) await api("/auth/logout", { method: "POST", body: { refreshToken }, auth: false }).catch(() => {});
        await storage.remove(REFRESH_KEY);
        bindSession(null, onTokens);
        setMe(null);
        setStatus("signedOut");
      },
      endSession: async (reason) => {
        await storage.remove(REFRESH_KEY);
        bindSession(null, onTokens);
        setMe(null);
        setNotice(reason);
        setStatus("signedOut");
      },
      addRoles: async (roles) => {
        await api("/me/roles", { method: "POST", body: { roles } });
        // Roller erişim belirtecinde taşınıyor: yeni rollerle belirteç almak için yenile
        const refreshToken = await storage.get(REFRESH_KEY);
        const t = await api<Tokens>("/auth/refresh", { method: "POST", body: { refreshToken }, auth: false });
        bindSession(t, onTokens);
        onTokens(t);
        setMe(await api<Me>("/me"));
      },
      refreshMe: async () => {
        setMe(await api<Me>("/me"));
      },
      retry: () => {
        setStatus("loading");
        setAttempt((n) => n + 1);
      },
    }),
    [status, me, notice, onTokens],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth, AuthProvider içinde kullanılmalı");
  return ctx;
}
