import { useEffect, useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail,
  signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, updateProfile,
} from "firebase/auth";
import { auth, googleProvider } from "@/firebase";
import { LOGIN_EVENT } from "@/const";

function friendly(code: string) {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found": return "That email or password doesn't look right.";
    case "auth/email-already-in-use": return "That email already has an account. Try signing in instead.";
    case "auth/weak-password": return "Please choose a password with at least 6 characters.";
    case "auth/invalid-email": return "Please enter a valid email address.";
    case "auth/too-many-requests": return "Too many attempts. Please wait a minute and try again.";
    case "auth/popup-closed-by-user": return "";
    case "auth/unauthorized-domain": return "This website address isn't allowed yet. Add it under Firebase > Authentication > Settings > Authorized domains.";
    case "auth/operation-not-allowed": return "This sign-in method isn't switched on yet in Firebase > Authentication > Sign-in method.";
    default: return "Something went wrong. Please try again.";
  }
}

export default function AuthDialog() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const show = () => { setOpen(true); setError(""); setInfo(""); };
    window.addEventListener(LOGIN_EVENT, show);
    return () => window.removeEventListener(LOGIN_EVENT, show);
  }, []);

  useEffect(() => auth.onAuthStateChanged(user => { if (user) setOpen(false); }), []);

  if (!open) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setInfo("");
    try {
      if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name.trim()) await updateProfile(cred.user, { displayName: name.trim().slice(0, 80) });
        await sendEmailVerification(cred.user).catch(() => {});
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (e: any) { setError(friendly(e?.code ?? "")); } finally { setBusy(false); }
  }

  async function google() {
    setBusy(true); setError(""); setInfo("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e: any) {
      if (e?.code === "auth/popup-blocked" || e?.code === "auth/operation-not-supported-in-this-environment") {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      setError(friendly(e?.code ?? ""));
    } finally { setBusy(false); }
  }

  async function reset() {
    if (!email.trim()) { setError("Type your email first, then tap “Forgot password”."); return; }
    try { await sendPasswordResetEmail(auth, email.trim()); setInfo("Password reset email sent. Check your inbox."); setError(""); }
    catch (e: any) { setError(friendly(e?.code ?? "")); }
  }

  const input: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,.2)", font: "inherit", marginTop: 4 };

  return (
    <div className="modal-scrim" role="presentation" onMouseDown={e => e.target === e.currentTarget && setOpen(false)}>
      <section role="dialog" aria-modal="true" aria-label="Sign in" style={{ background: "#fffaf2", color: "#2b2118", borderRadius: 18, padding: 24, width: "min(92vw, 400px)", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Kalakaari Corner" style={{ height: 90, margin: "0 auto 8px", display: "block" }} />
        <h2 style={{ fontSize: "1.4rem", marginBottom: 4, textAlign: "center" }}>{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
        <p style={{ opacity: .75, marginBottom: 16 }}>Kalakaari Corner · by Priyanka</p>
        <button type="button" className="button button-ink" style={{ width: "100%" }} onClick={google} disabled={busy}>Continue with Google</button>
        <p style={{ textAlign: "center", margin: "12px 0", opacity: .6 }}>or use your email</p>
        <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
          {mode === "signup" && <label>Your name<input style={input} value={name} onChange={e => setName(e.target.value)} maxLength={80} autoComplete="name" required /></label>}
          <label>Email<input style={input} type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label>
          <label>Password<input style={input} type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={6} required /></label>
          {error && <p role="alert" style={{ color: "#b3261e" }}>{error}</p>}
          {info && <p role="status" style={{ color: "#2e6b3a" }}>{info}</p>}
          <button className="button button-ochre" type="submit" disabled={busy}>{mode === "signin" ? "Sign in" : "Create account"}</button>
        </form>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontSize: ".9rem" }}>
          <button type="button" className="text-link" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}>{mode === "signin" ? "New here? Create an account" : "Have an account? Sign in"}</button>
          {mode === "signin" && <button type="button" className="text-link" onClick={reset}>Forgot password</button>}
        </div>
      </section>
    </div>
  );
}
