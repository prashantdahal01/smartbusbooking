import { toast } from "react-hot-toast";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const resolveRedirectPath = (candidate, fallback = "/search") => {
  const value = String(candidate || "").trim();
  if (value.startsWith("/")) return value;
  return fallback;
};

export function useRequireAuth() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const requireAuth = ({
    message = "Please log in to continue.",
    actionLabel = "Log In",
    redirectTo,
    onBeforeRedirect,
    toastId = "auth-required-toast",
  } = {}) => {
    if (currentUser?.id) return true;

    const currentPath = `${location.pathname || ""}${location.search || ""}`;
    const redirectPath = resolveRedirectPath(redirectTo || currentPath || "/search");

    const openLogin = () => {
      if (typeof onBeforeRedirect === "function") {
        onBeforeRedirect();
      }
      navigate(`/login?redirect=${encodeURIComponent(redirectPath)}`);
    };

    toast.custom(
      (toastRef) => (
        <div className="pointer-events-auto w-[min(92vw,380px)] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
          <p className="text-sm font-semibold text-slate-900">Sign in required</p>
          <p className="mt-1 text-sm text-slate-600">{message}</p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              onClick={() => toast.dismiss(toastRef.id)}
            >
              Not now
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white transition hover:bg-sky-700"
              onClick={() => {
                toast.dismiss(toastRef.id);
                openLogin();
              }}
            >
              {actionLabel}
            </button>
          </div>
        </div>
      ),
      {
        id: toastId,
        duration: 6500,
        position: "top-center",
      }
    );

    return false;
  };

  return {
    isAuthenticated: Boolean(currentUser?.id),
    requireAuth,
  };
}

export default useRequireAuth;