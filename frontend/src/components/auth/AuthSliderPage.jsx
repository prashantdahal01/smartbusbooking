import { BusFront, ShieldCheck, Ticket } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const normalizeMode = (value) => (value === "signup" ? "signup" : "signin");

export default function AuthSliderPage({ initialMode = "signin" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, token, role, authLoading } = useAuth();

  const [mode, setMode] = useState(() => normalizeMode(initialMode));

  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [rememberSession, setRememberSession] = useState(true);
  const [signInError, setSignInError] = useState("");
  const [signInLoading, setSignInLoading] = useState(false);

  const [signUpName, setSignUpName] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPhone, setSignUpPhone] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [signUpError, setSignUpError] = useState("");
  const [signUpLoading, setSignUpLoading] = useState(false);

  useEffect(() => {
    setMode(normalizeMode(initialMode));
  }, [initialMode]);

  if (token && authLoading) {
    return (
      <div className="auth-slider-page">
        <div className="auth-shell">
          <div className="auth-form-pane auth-signin-pane">
            <div className="auth-form-wrap">
              <h1 className="auth-title">Checking your session...</h1>
              <p className="auth-subtitle">Please wait while we validate your login.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (token && role === "admin") return <Navigate to="/admin" replace />;
  if (token && role === "operator") return <Navigate to="/operator/dashboard" replace />;
  if (token && role === "customer") return <Navigate to="/search" replace />;

  const switchMode = (nextMode) => {
    const safeMode = normalizeMode(nextMode);
    setMode(safeMode);
    navigate(safeMode === "signup" ? "/register" : "/login", { replace: true });
  };

  const submitSignIn = async (event) => {
    event.preventDefault();
    setSignInError("");
    setSignInLoading(true);

    try {
      const user = await login(signInEmail.trim(), signInPassword, { persist: rememberSession });
      const redirect = new URLSearchParams(location.search).get("redirect");

      if (user.role === "admin") navigate("/admin");
      else if (user.role === "operator") navigate("/operator/dashboard");
      else if (redirect && redirect.startsWith("/")) navigate(redirect);
      else navigate("/search");
    } catch (error) {
      setSignInError(error?.response?.data?.message || error?.message || "Sign in failed");
    } finally {
      setSignInLoading(false);
    }
  };

  const submitSignUp = async (event) => {
    event.preventDefault();
    setSignUpError("");
    setSignUpLoading(true);

    try {
      await register({
        name: signUpName.trim(),
        email: signUpEmail.trim(),
        phone: signUpPhone.trim(),
        password: signUpPassword,
      });
      navigate("/search");
    } catch (error) {
      setSignUpError(error?.response?.data?.message || error?.message || "Sign up failed");
    } finally {
      setSignUpLoading(false);
    }
  };

  return (
    <div className="auth-slider-page">
      <div className={`auth-shell ${mode === "signup" ? "is-signup" : ""}`}>
        <div className="auth-mobile-switch">
          <button
            type="button"
            onClick={() => switchMode("signin")}
            className={`auth-mobile-switch-btn ${mode === "signin" ? "active" : ""}`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchMode("signup")}
            className={`auth-mobile-switch-btn ${mode === "signup" ? "active" : ""}`}
          >
            Sign Up
          </button>
        </div>

        <section className="auth-form-pane auth-signin-pane">
          <div className="auth-form-wrap">
            <h1 className="auth-title">Welcome back!</h1>
            <p className="auth-subtitle">Sign in with your email &amp; password</p>

            <form onSubmit={submitSignIn} className="auth-form auth-form-signin" noValidate>
              <div className="auth-field">
                <label className="auth-label" htmlFor="auth-signin-email">Email address</label>
                <input
                  id="auth-signin-email"
                  type="email"
                  value={signInEmail}
                  onChange={(event) => setSignInEmail(event.target.value)}
                  required
                  className="auth-input"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>

              <div className="auth-field">
                <label className="auth-label" htmlFor="auth-signin-password">Password</label>
                <input
                  id="auth-signin-password"
                  type="password"
                  value={signInPassword}
                  onChange={(event) => setSignInPassword(event.target.value)}
                  required
                  className="auth-input"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
              </div>

              <div className="auth-inline-meta">
                <label className="auth-checkbox-label" htmlFor="auth-remember-session">
                  <input
                    id="auth-remember-session"
                    type="checkbox"
                    checked={rememberSession}
                    onChange={(event) => setRememberSession(event.target.checked)}
                    className="auth-checkbox"
                  />
                  Keep me signed in
                </label>
                <Link to="/forgot-password" className="auth-link">
                  Forgot your password?
                </Link>
              </div>

              {signInError ? <p className="auth-error">{signInError}</p> : null}

              <button type="submit" disabled={signInLoading} className="auth-primary-btn">
                {signInLoading ? "Signing In..." : "Sign In"}
              </button>
            </form>

            <p className="auth-footer-text">
              Do not have an account?{" "}
              <button type="button" onClick={() => switchMode("signup")} className="auth-link-btn">
                Sign up
              </button>
            </p>
          </div>
        </section>

        <section className="auth-form-pane auth-signup-pane">
          <div className="auth-form-wrap">
            <h1 className="auth-title">Create account</h1>
            <p className="auth-subtitle">Start your journey in one click</p>

            <form onSubmit={submitSignUp} className="auth-form auth-form-signup" noValidate>
              <div className="auth-grid-row">
                <div className="auth-field">
                  <label className="auth-label" htmlFor="auth-signup-name">Name</label>
                  <input
                    id="auth-signup-name"
                    type="text"
                    value={signUpName}
                    onChange={(event) => setSignUpName(event.target.value)}
                    required
                    className="auth-input"
                    placeholder="Full name"
                    autoComplete="name"
                  />
                </div>

                <div className="auth-field">
                  <label className="auth-label" htmlFor="auth-signup-phone">Phone</label>
                  <input
                    id="auth-signup-phone"
                    type="text"
                    value={signUpPhone}
                    onChange={(event) => setSignUpPhone(event.target.value)}
                    className="auth-input"
                    placeholder="98xxxxxxxx"
                    autoComplete="tel"
                  />
                </div>
              </div>

              <div className="auth-field">
                <label className="auth-label" htmlFor="auth-signup-email">Email address</label>
                <input
                  id="auth-signup-email"
                  type="email"
                  value={signUpEmail}
                  onChange={(event) => setSignUpEmail(event.target.value)}
                  required
                  className="auth-input"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>

              <div className="auth-field">
                <label className="auth-label" htmlFor="auth-signup-password">Password</label>
                <input
                  id="auth-signup-password"
                  type="password"
                  value={signUpPassword}
                  onChange={(event) => setSignUpPassword(event.target.value)}
                  required
                  className="auth-input"
                  placeholder="Create password"
                  autoComplete="new-password"
                />
              </div>

              <p className="auth-helper-text">Phone number is optional</p>

              {signUpError ? <p className="auth-error">{signUpError}</p> : null}

              <button type="submit" disabled={signUpLoading} className="auth-primary-btn">
                {signUpLoading ? "Creating..." : "Sign Up"}
              </button>
            </form>

            <p className="auth-footer-text">
              Already have an account?{" "}
              <button type="button" onClick={() => switchMode("signin")} className="auth-link-btn">
                Sign in
              </button>
            </p>
          </div>
        </section>

        <aside className="auth-overlay-shell" aria-hidden="true">
          <div className="auth-overlay">
            <div className="auth-overlay-panel auth-overlay-left">
              <BusFront className="auth-overlay-icon" />
              <h2>Already have an account ?</h2>
              <p>Sign in with your email &amp; password</p>
              <button type="button" className="auth-ghost-btn" onClick={() => switchMode("signin")}>
                Sign In
              </button>
            </div>

            <div className="auth-overlay-panel auth-overlay-right">
              <ShieldCheck className="auth-overlay-icon" />
              <h2>Don&apos;t have an account ?</h2>
              <p>Start your journey in one click</p>
              <button type="button" className="auth-ghost-btn" onClick={() => switchMode("signup")}>
                Sign Up
              </button>
              <div className="auth-overlay-badge">
                <Ticket className="h-3.5 w-3.5" />
                Secure booking access
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
