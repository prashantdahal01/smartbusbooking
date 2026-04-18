import { useEffect, useMemo, useState } from "react";
import { Mail, Save, ShieldCheck } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { updateUserByAdmin } from "../../services/admin.service";

const SETTINGS_KEY = "admin-settings";

const defaultPrefs = {
  emailAlerts: true,
  bookingAlerts: true,
  weeklySummary: false,
};

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromQuery = searchParams.get("tab") || "profile";
  const [activeTab, setActiveTab] = useState(tabFromQuery);

  const { currentUser, refreshMe } = useAuth();
  const [name, setName] = useState(currentUser?.name || "");
  const [phone, setPhone] = useState(currentUser?.phone || "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");

  const [prefs, setPrefs] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      return { ...defaultPrefs, ...stored };
    } catch {
      return defaultPrefs;
    }
  });

  useEffect(() => {
    setActiveTab(tabFromQuery);
  }, [tabFromQuery]);

  useEffect(() => {
    setName(currentUser?.name || "");
    setPhone(currentUser?.phone || "");
  }, [currentUser?.name, currentUser?.phone]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(prefs));
  }, [prefs]);

  const tabs = useMemo(
    () => [
      { key: "profile", label: "Profile" },
      { key: "preferences", label: "Account Settings" },
      { key: "support", label: "Support" },
    ],
    []
  );

  const onSaveProfile = async (event) => {
    event.preventDefault();
    if (!currentUser?.id) return;

    setSavingProfile(true);
    setProfileError("");
    setProfileMessage("");
    try {
      await updateUserByAdmin(currentUser.id, { name, phone });
      await refreshMe();
      setProfileMessage("Profile updated successfully.");
    } catch (err) {
      setProfileError(err?.response?.data?.message || err?.message || "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Settings</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Manage profile, account preferences, and support options</p>
      </div>

      <div className="admin-surface p-3">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setActiveTab(tab.key);
                setSearchParams({ tab: tab.key });
              }}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab.key
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "profile" ? (
        <div className="admin-surface p-5 sm:p-6">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Edit Profile</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Update your admin profile details</p>

          {profileError ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{profileError}</div>
          ) : null}
          {profileMessage ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{profileMessage}</div>
          ) : null}

          <form onSubmit={onSaveProfile} className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Name</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Phone</label>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
              <input
                value={currentUser?.email || ""}
                disabled
                className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={savingProfile}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {savingProfile ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {activeTab === "preferences" ? (
        <div className="admin-surface p-5 sm:p-6">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Account Settings</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Configure notification preferences</p>

          <div className="mt-5 space-y-3">
            {[
              { key: "emailAlerts", label: "Enable email alerts" },
              { key: "bookingAlerts", label: "Notify on new bookings" },
              { key: "weeklySummary", label: "Weekly analytics summary" },
            ].map((item) => (
              <label
                key={item.key}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <span>{item.label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(prefs[item.key])}
                  onChange={(event) =>
                    setPrefs((prev) => ({
                      ...prev,
                      [item.key]: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {activeTab === "support" ? (
        <div className="admin-surface p-5 sm:p-6">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Support</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Get help from the SmartBus platform team</p>

          <div className="mt-5 space-y-3 text-sm">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
              <p className="font-semibold text-slate-900 dark:text-slate-100">Support Email</p>
              <a href="mailto:support@smartbus.com" className="mt-1 inline-flex items-center gap-2 text-blue-600 dark:text-blue-400">
                <Mail className="h-4 w-4" />
                support@smartbus.com
              </a>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
              <p className="font-semibold text-slate-900 dark:text-slate-100">Security</p>
              <p className="mt-1 text-slate-600 dark:text-slate-300">Enable 2FA and periodic password rotation for production admins.</p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                Account Protected
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
