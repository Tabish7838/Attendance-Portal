import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { buildApiUrl } from "./config";
import { useNavigate } from "react-router-dom";

function Login() {
  const navigate = useNavigate();
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupUsername, setSignupUsername] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate("/attendance");
    });
  }, []);

  const login = async () => {
    if (!loginIdentifier.trim() || !loginPassword) {
      alert("Please enter your username or email and password.");
      return;
    }

    let loginEmail = loginIdentifier.trim();

    if (!loginEmail.includes("@")) {
      try {
        const res = await fetch(
          buildApiUrl(`/users/by-username/${encodeURIComponent(loginEmail)}`)
        );
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.message || "Username not found");
        }
        const payload = await res.json();
        loginEmail = payload.email;
      } catch (err: any) {
        alert(err.message || "Could not find username");
        return;
      }
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });
    if (error) alert(error.message);
    else navigate("/attendance");
  };

  const signup = async () => {
    if (!signupUsername.trim() || !signupEmail.trim() || !signupPassword) {
      alert("Please fill username, email, and password.");
      return;
    }

    const desiredUsername = signupUsername.trim();

    try {
      const check = await fetch(
        buildApiUrl(`/users/by-username/${encodeURIComponent(desiredUsername)}`)
      );
      if (check.ok) {
        alert("That username is already taken. Please choose another.");
        return;
      }
      if (check.status !== 404) {
        const payload = await check.json().catch(() => ({}));
        alert(payload.message || "Unable to verify username availability.");
        return;
      }
    } catch (err) {
      alert("Network error while checking username availability.");
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPassword,
    });
    if (error) alert(error.message);
    else {
      const supabaseUser = data.user;
      if (supabaseUser) {
        const response = await fetch(buildApiUrl("/users"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supabase_id: supabaseUser.id,
            username: desiredUsername,
            email: signupEmail.trim(),
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          alert(payload.message || "Failed to save username. Please try another.");
          return;
        }
      }

      alert("Signup successful. Now login using your username or email.");
      setLoginIdentifier(desiredUsername);
      setLoginPassword("");
      setSignupUsername("");
      setSignupEmail("");
      setSignupPassword("");
      setMode("login");
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-hero">
        <span className="section-label">Teacher portal</span>
        <h1>Welcome to your attendance command center.</h1>
        <p>
          Streamline daily roll calls, track attendance trends, and export reports for your class in a
          single, secure space.
        </p>
        <ul className="auth-highlights">
          <li>✨ View persistent student rosters and past records.</li>
          <li>📊 Export professional Excel summaries for parents and staff.</li>
          <li>🔐 Secure logins with username or email — your data stays yours.</li>
        </ul>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <header className="auth-card-header">
            <h2>Access your account</h2>
            <p>Choose how you want to sign in below.</p>
          </header>

          <div className="auth-toggle">
            <button
              type="button"
              className={`toggle-btn ${mode === "login" ? "active" : ""}`}
              onClick={() => setMode("login")}
            >
              Log in
            </button>
            <button
              type="button"
              className={`toggle-btn ${mode === "signup" ? "active" : ""}`}
              onClick={() => setMode("signup")}
            >
              Create account
            </button>
          </div>

          {mode === "login" ? (
            <>
              <div className="form-group">
                <label htmlFor="identifier">Username or Email</label>
                <input
                  id="identifier"
                  type="text"
                  placeholder="e.g. mrssharma or name@school.edu"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                />
              </div>

              <button className="btn btn-primary full-width" onClick={login}>
                Log in
              </button>
            </>
          ) : (
            <>
              <div className="form-group">
                <label htmlFor="username">Choose a unique username</label>
                <input
                  id="username"
                  type="text"
                  placeholder="e.g. mrssharma"
                  value={signupUsername}
                  onChange={(e) => setSignupUsername(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="signup-email">Email address</label>
                <input
                  id="signup-email"
                  type="email"
                  placeholder="name@school.edu"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="signup-password">Password</label>
                <input
                  id="signup-password"
                  type="password"
                  placeholder="Enter your password"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                />
              </div>

              <button className="btn btn-secondary full-width" onClick={signup}>
                Create account
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export default Login;
