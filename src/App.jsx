import React, { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate } from "react-router-dom";
import { auth, db, storage } from "./firebase";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

/** PRIAM LIBRARY APP
 * - User side (gallery with WhatsApp)
 * - Admin side (login + upload book + image)
 */

const WHATSAPP_NUMBER = "919746832552"; // change this to your number, no '+'

function waLinkFor(book) {
  const title = book.title || "";
  const author = book.author ? ` by ${book.author}` : "";
  const isbn = book.isbn ? ` (ISBN: ${book.isbn})` : "";
  const msg =
    `ഹായ് PRIAM,\n` +
    `ഈ പുസ്തകം എനിക്ക് വേണം: “${title}${author}”${isbn}.\n`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
}

function groupBy(list, keyFn) {
  const out = {};
  list.forEach((x) => {
    const k = keyFn(x) || "മറ്റുള്ളവ";
    (out[k] ||= []).push(x);
  });
  return out;
}

/* ---------- USER SIDE ---------- */
function Gallery() {
  const [books, setBooks] = useState([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");

  useEffect(() => {
    const qRef = query(collection(db, "books"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(qRef, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setBooks(rows);
    });
    return () => unsub();
  }, []);

  const categories = useMemo(() => {
    const s = new Set();
    books.forEach((b) => b.category && s.add(b.category));
    return ["all", ...Array.from(s).sort()];
  }, [books]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return books.filter((b) => {
      const catOK =
        cat === "all" ||
        (b.category || "").toLowerCase() === cat.toLowerCase();
      if (!t) return catOK;
      const hay = `${b.title} ${b.author || ""} ${b.isbn || ""}`.toLowerCase();
      return catOK && hay.includes(t);
    });
  }, [books, q, cat]);

  const grouped = useMemo(() => groupBy(filtered, (b) => b.category), [filtered]);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={styles.logoBox}>📚</div>
          <div>
            <div style={{ fontWeight: 700 }}>പ്രിയം ലൈബ്രറി (PRIAM)</div>
            <div style={{ fontSize: 12, color: "#555" }}>വീട്ടിലെത്തുന്ന വായന</div>
          </div>
        </div>
        <nav style={{ display: "flex", gap: 8 }}>
          <Link to="/" style={styles.tabActive}>User</Link>
          <Link to="/admin" style={styles.tab}>Admin</Link>
        </nav>
      </header>

      <main style={styles.main}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 8, marginBottom: 16 }}>
          <input placeholder="Search title/author/ISBN…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            {categories.map((c) => (
              <option key={c} value={c}>{c === "all" ? "All categories" : c}</option>
            ))}
          </select>
        </div>

        {Object.entries(grouped).map(([section, list]) => (
          <section key={section} style={styles.section}>
            <div style={styles.sectionHead}><h2 style={{ margin: 0, fontSize: 20 }}>{section || "വിഭാഗമില്ല"}</h2></div>
            <div style={styles.galleryGrid}>
              {list.map((b) => (
                <article key={b.id} style={styles.card}>
                  <a href={waLinkFor(b)} target="_blank" rel="noreferrer" title="Order this book">
                    <img src={b.imageURL || "/covers/placeholder.jpg"} alt={b.title} style={styles.cardImg}
                      onError={(e) => (e.currentTarget.src = "/covers/placeholder.jpg")} />
                  </a>
                  <div style={{ padding: "8px 10px" }}>
                    <div style={{ fontWeight: 700 }}>{b.title}</div>
                    <div style={{ color: "#555", fontSize: 13 }}>{b.author || ""}</div>
                    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {b.year && <span style={styles.pill}>വർഷം: {b.year}</span>}
                      {b.isbn && <span style={styles.pill}>ISBN: {b.isbn}</span>}
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <a href={waLinkFor(b)} target="_blank" rel="noreferrer" style={styles.waBtn}>
                        Take this book on WhatsApp
                      </a>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

/* ---------- ADMIN SIDE ---------- */
function Admin() {
  const [user, setUser] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  if (!user) return <AdminLogin />;

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={styles.logoBox}>🛠️</div>
          <div>
            <div style={{ fontWeight: 700 }}>Admin — PRIAM</div>
            <div style={{ fontSize: 12, color: "#555" }}>Add books + upload images</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={async () => { await signOut(auth); nav("/"); }}>Logout</button>
        </div>
      </header>
      <main style={styles.main}>
        <AdminAddBook />
      </main>
    </div>
  );
}

function AdminLogin() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");

  async function doLogin(e) {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
    } catch (e) {
      setErr(e.message || "Login failed");
    }
  }

  return (
    <div style={{ ...styles.page, display: "grid", placeItems: "center" }}>
      <form onSubmit={doLogin} style={{ ...styles.card, width: 360 }}>
        <h3 style={{ marginTop: 0 }}>Admin Login</h3>
        <label style={{ display: "grid", gap: 4 }}>
          <span>Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span>Password</span>
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
        </label>
        {err && <div style={{ color: "#b00020", fontSize: 12 }}>{err}</div>}
        <button type="submit" style={{ marginTop: 8 }}>Login</button>
        <div style={{ marginTop: 8 }}><Link to="/">← Back to site</Link></div>
      </form>
    </div>
  );
}

function AdminAddBook() {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState("");
  const [year, setYear] = useState("");
  const [isbn, setIsbn] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return setMsg("Title is required");
    if (!file) return setMsg("Please choose a cover image");
    setMsg(""); setBusy(true);

    try {
      const fileName = `${Date.now()}_${file.name}`;
      const fileRef = ref(storage, `covers/${fileName}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);

      await addDoc(collection(db, "books"), {
        title: title.trim(),
        author: author.trim(),
        category: category.trim(),
        year: year.trim(),
        isbn: isbn.trim(),
        imageURL: url,
        createdAt: serverTimestamp(),
      });

      setTitle(""); setAuthor(""); setCategory(""); setYear(""); setIsbn(""); setFile(null);
      setMsg("✅ Book added successfully");
    } catch (e) {
      console.error(e);
      setMsg("Upload failed: " + (e.message || ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={styles.card}>
      <h3 style={{ marginTop: 0 }}>Add Book</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Title" value={title} onChange={setTitle} />
        <Field label="Author" value={author} onChange={setAuthor} />
        <Field label="Category" value={category} onChange={setCategory} />
        <Field label="Year" value={year} onChange={setYear} />
        <Field label="ISBN" value={isbn} onChange={setIsbn} />
        <label style={{ display: "grid", gap: 4 }}>
          <span>Cover image</span>
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
      </div>
      <div style={{ marginTop: 12 }}>
        <button disabled={busy} type="submit">{busy ? "Uploading…" : "Add book"}</button>
        {msg && <div style={{ marginTop: 8, color: msg.startsWith("✅") ? "#0a7d33" : "#b00020" }}>{msg}</div>}
      </div>
    </form>
  );
}

function Field({ label, value, onChange }) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 12, color: "#333" }}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

const styles = {
  page: { fontFamily: "system-ui, Arial, sans-serif", background: "#f7f7fb", minHeight: "100vh" },
  header: { position: "sticky", top: 0, zIndex: 10, background: "#fff", borderBottom: "1px solid #ddd", padding: "12px 16px",
            display: "flex", justifyContent: "space-between", alignItems: "center" },
  logoBox: { width: 40, height: 40, border: "1px solid #ddd", borderRadius: 12, display: "grid", placeItems: "center" },
  tab: { padding: "6px 10px", background: "#f3f3f3", border: "1px solid #ddd", borderRadius: 8, textDecoration: "none", color: "#222" },
  tabActive: { padding: "6px 10px", background: "#e5f0ff", border: "1px solid #7aa7ff", borderRadius: 8, textDecoration: "none", color: "#222" },
  main: { maxWidth: 1100, margin: "0 auto", padding: 16 },
  section: { border: "1px solid #ddd", borderRadius: 12, background: "#fff", marginBottom: 16 },
  sectionHead: { padding: "10px 14px", borderBottom: "1px solid #eee", background: "#f7f9ff" },
  galleryGrid: { padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 },
  card: { background: "#fff", border: "1px solid #eee", borderRadius: 12, overflow: "hidden", display: "grid" },
  cardImg: { width: "100%", height: 220, objectFit: "cover", display: "block", background: "#fafafa" },
  pill: { fontSize: 12, border: "1px solid #ddd", borderRadius: 999, padding: "2px 8px", background: "#fff" },
  waBtn: { display: "inline-block", textDecoration: "none", border: "1px solid #25D366", background: "#25D366", color: "#fff", padding: "6px 10px", borderRadius: 8, fontSize: 14 },
};

/* Router */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Gallery />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
