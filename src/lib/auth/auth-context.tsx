"use client";

import {
	createContext,
	useContext,
	useEffect,
	useState,
	useCallback,
	useRef,
} from "react";
import { useRouter } from "next/navigation";
import { useNotification } from "@/lib/notifications/notification-context";

export type Role = "superadmin" | "admin" | "finance";

export interface AuthUser {
	id: string;
	email: string;
	role: Role;
	name: string;
}

interface AuthContextValue {
	user: AuthUser | null;
	loading: boolean;
	logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Cek session setiap 5 menit selagi tab aktif
const SESSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [user, setUser] = useState<AuthUser | null>(null);
	const [loading, setLoading] = useState(true);
	const router = useRouter();
	const { notify } = useNotification();

	// Track previous user for session expired detection
	const prevUserRef = useRef<AuthUser | null>(null);

	// Pengecekan awal saat mount
	useEffect(() => {
		fetch("/api/auth/me")
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				if (data?.user) {
					setUser(data.user);
					prevUserRef.current = data.user;
				}
			})
			.catch(() => {})
			.finally(() => setLoading(false));
	}, []);

	// Effect untuk mendeteksi session expired dan menampilkan notifikasi
	useEffect(() => {
		if (prevUserRef.current !== null && user === null) {
			// User berubah dari login ke logout - session expired
			notify("error", "Sesi login telah berakhir. Silakan login kembali.");
			router.push("/login");
		}
		prevUserRef.current = user;
	}, [user, notify, router]);

	// Pengecekan berkala: deteksi session expired saat user masih di halaman
	useEffect(() => {
		const checkSession = async () => {
			try {
				const r = await fetch("/api/auth/me");
				if (r.ok) return;

				// Session sudah tidak valid — set user ke null
				setUser(null);
			} catch {
				// Network error — abaikan, jangan paksa logout
			}
		};

		const interval = setInterval(checkSession, SESSION_CHECK_INTERVAL_MS);

		// Cek ulang saat tab kembali aktif (user buka tab setelah lama)
		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") void checkSession();
		};
		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			clearInterval(interval);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, [notify, router]);

	const logout = useCallback(async () => {
		await fetch("/api/auth/logout", { method: "POST" });
		setUser(null);
		notify("success", "Berhasil logout.");
		router.push("/login");
	}, [notify, router]);

	return (
		<AuthContext.Provider value={{ user, loading, logout }}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth(): AuthContextValue {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error("useAuth must be used within AuthProvider");
	return ctx;
}
