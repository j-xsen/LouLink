import { useState, useEffect } from "react";
import { authClient } from "./auth-client";

function Home() {
  return (
    <>
      <h1>LouLink</h1>
      <p>
        A free resource for Louisville artists and businesses to compile their
        internet presences in a public repertoire of peers.
      </p>
      <p>
        <a href="#signin">Sign in</a> &middot; <a href="#signup">Sign up</a>
      </p>
    </>
  );
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { error } = await authClient.signIn.email({ email, password });
    if (error) setError(error.message ?? "Sign in failed.");
  }

  return (
    <>
      <h1>Sign in</h1>
      <form onSubmit={handleSubmit}>
        <p>
          <label>
            Email<br />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
        </p>
        <p>
          <label>
            Password<br />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
        </p>
        {error && <p><strong>{error}</strong></p>}
        <p><button type="submit">Sign in</button></p>
      </form>
      <p><a href="#">Back</a> &middot; <a href="#signup">Sign up instead</a></p>
    </>
  );
}

function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const { error } = await authClient.signUp.email({ name, email, password });
    if (error) setError(error.message ?? "Sign up failed.");
  }

  return (
    <>
      <h1>Sign up</h1>
      <form onSubmit={handleSubmit}>
        <p>
          <label>
            Name<br />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
        </p>
        <p>
          <label>
            Email<br />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
        </p>
        <p>
          <label>
            Password<br />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
        </p>
        {error && <p><strong>{error}</strong></p>}
        <p><button type="submit">Sign up</button></p>
      </form>
      <p><a href="#">Back</a> &middot; <a href="#signin">Sign in instead</a></p>
    </>
  );
}

export default function App() {
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const handler = () => setHash(window.location.hash);
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  if (hash === "#signin") return <SignIn />;
  if (hash === "#signup") return <SignUp />;
  return <Home />;
}
