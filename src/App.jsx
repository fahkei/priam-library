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
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import jsPDF from "jspdf";
import "jspdf-autotable";

/** PRIAM LIBRARY APP
 * - User: gallery (hides 'hidden' books, shows 'In circulation' badge when not available)
 * - Admin: Login → Add Book → Manage Books (toggle available, hide/unhide, delete)
 */

const WHATSAPP_NUMBER = "917025832552"; // change to your number, no '+'

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

/* ===================== USER SIDE ===================== */
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

  // Hide books that are marked hidden
  const visible = useMemo(() => books.filter(b => !b.hidden), [books]);

  const categories = useMemo(() => {
    const s = new Set();
    visible.forEach((b) => b.category && s.add(b.category));
    return ["all", ...Array.from(s).sort()];
  }, [visible]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return visible.filter((b) => {
      const catOK =
        cat === "all" ||
        (b.category || "").toLowerCase() === cat.toLowerCase();
      if (!t) return catOK;
      const hay = `${b.title} ${b.author || ""} ${b.isbn || ""}`.toLowerCase();
      return catOK && hay.includes(t);
    });
  }, [visible, q, cat]);

  const grouped = useMemo(() => groupBy(filtered, (b) => b.category), [filtered]);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/ppprr.jpeg" alt="PRIAM" style={{ width: 40, height: 40, borderRadius: 12, objectFit: "cover", border: "1px solid #ddd" }} />

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
                <article key={b.id} style={{ ...styles.card, position: "relative" }}>
                  {b.available === false && (
                    <div style={styles.badge}>In circulation</div>
                  )}
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
                        Order this Book
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

/* ===================== ADMIN SIDE ===================== */
function Admin() {
  const [user, setUser] = useState(null);
  const [adminTab, setAdminTab] = useState("add"); // "add" | "manage"
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
            <div style={{ fontSize: 12, color: "#555" }}>Add / Manage books</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setAdminTab("add")}>➕ Add Book</button>
          <button onClick={() => setAdminTab("manage")}>🗂 Manage Books</button>
          <button onClick={async () => { await signOut(auth); nav("/"); }}>Logout</button>
        </div>
      </header>
      <main style={styles.main}>
        {adminTab === "add" ? <AdminAddBook /> : <AdminManageBooks />}
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

/* ---- Add Book ---- */
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
        available: true,  // default available
        hidden: false,    // default visible to users
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

/* ---- Manage Books (toggle available, hide/unhide, delete) ---- */
function AdminManageBooks() {
  const [books, setBooks] = useState([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    const qRef = query(collection(db, "books"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(qRef, (snap) => {
      setBooks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return books.filter(b =>
      !t || `${b.title} ${b.author || ""} ${b.isbn || ""}`.toLowerCase().includes(t)
    );
  }, [books, q]);

  async function setAvailability(id, nextVal) {
    try {
      await updateDoc(doc(db, "books", id), { available: nextVal });
    } catch (e) {
      alert("Failed to update availability: " + (e.message || ""));
    }
  }
  // ---- EXPORTS ----
  function exportJSON() {
    const plain = books.map(({ id, ...rest }) => rest);
    const blob = new Blob([JSON.stringify(plain, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "priam_books.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCSV() {
    const header = ["title","author","category","year","isbn","imageURL","available","hidden","createdAt"];
    const rows = books.map(b => [
      b.title || "",
      b.author || "",
      b.category || "",
      b.year || "",
      b.isbn || "",
      b.imageURL || "",
      b.available === false ? "false" : "true",
      b.hidden ? "true" : "false",
      b.createdAt?.toDate ? b.createdAt.toDate().toISOString() : ""
    ]);
    const csv = [header.join(","), ...rows.map(r => r.map(val => `"${String(val).replace(/"/g,'""')}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "priam_books.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    doc.setFontSize(14);
    doc.text("PRIAM Library — Books Export", 40, 40);

    const rows = books.map(b => ([
      b.title || "",
      b.author || "",
      b.category || "",
      b.year || "",
      b.isbn || "",
      b.available === false ? "No" : "Yes",
      b.hidden ? "Hidden" : "Visible",
    ]));

    doc.autoTable({
      startY: 60,
      head: [["Title", "Author", "Category", "Year", "ISBN", "Available", "Visibility"]],
      body: rows,
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [33, 150, 243] },
      margin: { left: 40, right: 40 },
    });

    doc.save("priam_books.pdf");
  }

  async function setHidden(id, nextVal) {
    try {
      await updateDoc(doc(db, "books", id), { hidden: nextVal });
    } catch (e) {
      alert("Failed to update visibility: " + (e.message || ""));
    }
  }

  async function removeBook(id, title) {
    const ok = window.confirm(`Delete “${title}” permanently? This cannot be undone.`);
    if (!ok) return;
    try {
      await deleteDoc(doc(db, "books", id));
    } catch (e) {
      alert("Failed to delete: " + (e.message || ""));
    }
  }

  return (
    <section style={styles.card}>
      <h3 style={{ marginTop: 0 }}>Manage Books</h3>
      {/* ---- Export Buttons ---- */}
<div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
  <button onClick={exportJSON}>Export JSON</button>
  <button onClick={exportCSV}>Export CSV</button>
  <button onClick={exportPDF}>Export PDF</button>
</div>


      <input
        placeholder="Search by title/author/ISBN"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 10, width: "100%" }}
      />

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={styles.th}>Title</th>
              <th style={styles.th}>Author</th>
              <th style={styles.th}>Category</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Visibility</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => (
              <tr key={b.id} style={{ borderTop: "1px solid #eee" }}>
                <td style={styles.td}>{b.title}</td>
                <td style={styles.td}>{b.author || "—"}</td>
                <td style={styles.td}>{b.category || "—"}</td>
                <td style={styles.td}>
                  <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={b.available !== false}
                      onChange={(e) => setAvailability(b.id, e.target.checked)}
                    />
                    <span>{b.available !== false ? "Available" : "In circulation"}</span>
                  </label>
                </td>
                <td style={styles.td}>
                  <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={!!b.hidden}
                      onChange={(e) => setHidden(b.id, e.target.checked)}
                    />
                    <span>{b.hidden ? "Hidden from users" : "Visible to users"}</span>
                  </label>
                </td>
                <td style={styles.td}>
                  <button onClick={() => removeBook(b.id, b.title)} style={{ color: "#b00020" }}>
                    Delete permanently
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td style={styles.td} colSpan={6}>No books found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---- Reusable Field ---- */
function Field({ label, value, onChange }) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 12, color: "#333" }}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/* ---- Styles ---- */
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

  badge: { position: "absolute", top: 8, left: 8, background: "#b00020", color: "#fff", fontSize: 12, padding: "2px 8px", borderRadius: 999, boxShadow: "0 1px 2px rgba(0,0,0,0.2)" },

  th: { textAlign: "left", padding: 8, background: "#f8f8f8", fontWeight: 600, borderBottom: "1px solid #eee" },
  td: { padding: 8 },
};

/* ---- Router ---- */
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