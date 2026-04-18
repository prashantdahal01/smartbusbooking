import { useEffect, useRef, useState } from "react";
import { ChevronDown, CircleHelp, LogOut, Settings, UserRoundPen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function ProfileDropdown() {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  const adminName = currentUser?.name || "Admin";
  const adminEmail = currentUser?.email || "admin@smartbus.local";

  const onSignOut = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="ml-1 flex items-center gap-2 rounded-xl border border-transparent px-1.5 py-1 transition hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-700 dark:hover:bg-slate-800"
      >
        <img
          src="https://i.pravatar.cc/80?img=12"
          alt="Admin avatar"
          className="h-9 w-9 rounded-full object-cover"
        />
        <div className="hidden text-left sm:block">
          <p className="max-w-[12rem] truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{adminName}</p>
          <p className="max-w-[12rem] truncate text-xs text-slate-500 dark:text-slate-400">{adminEmail}</p>
        </div>
        <ChevronDown className="hidden h-4 w-4 text-slate-500 dark:text-slate-400 sm:block" />
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-2 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/70">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{adminName}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{adminEmail}</p>
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/admin/settings?tab=profile");
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <UserRoundPen className="h-4 w-4" />
            Edit Profile
          </button>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/admin/settings");
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Settings className="h-4 w-4" />
            Account Settings
          </button>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/admin/settings?tab=support");
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <CircleHelp className="h-4 w-4" />
            Support
          </button>

          <div className="my-2 h-px bg-slate-100 dark:bg-slate-700" />

          <button
            type="button"
            onClick={onSignOut}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-600 transition hover:bg-rose-50 dark:hover:bg-rose-900/20"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      ) : null}
    </div>
  );
}
