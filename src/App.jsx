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
 * - Admin: Login → Add Book (image optional) → Manage Books (edit, toggle available, hide/unhide, delete with confirm)
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
  const [showBackMap, setShowBackMap] = useState({});

  useEffect(() => {
    const qRef = query(collection(db, "books"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(qRef, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setBooks(rows);
    });
    return () => unsub();
  }, []);

  // Hide books that are marked hidden
  const visible = useMemo(() => books.filter((b) => !b.hidden), [books]);

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

  // crude mobile check
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

  function toggleFlip(id) {
    setShowBackMap((m) => ({ ...m, [id]: !m[id] }));
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src="/ppprr.jpeg"
            alt="PRIAM"
            style={{ width: 40, height: 40, borderRadius: 12, objectFit: "cover", border: "1px solid #ddd" }}
          />
          <div>
            <div style={{ fontWeight: 700 }}>പ്രിയം ലൈബ്രറി (PRIAM)</div>
            <div style={{ fontSize: 12, color: "#555" }}>വീട്ടിലെത്തുന്ന വായന  📞7025832552</div>
          </div>
        </div>
       
      </header>

      <main style={styles.main}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 8, marginBottom: 16 }}>
          <input placeholder="തിരയൂ.. പേര്/എഴുത്തുകാരൻ/ISBN…" value={q} onChange={(e) => setQ(e.target.value)} />
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
              {list.map((b) => {
                const showBack = !!showBackMap[b.id];
                const chosenURL = showBack ? (b.backImageURL || b.imageURL) : b.imageURL;
                const isAvailable = b.available !== false;
                const imgStyle = isMobile ? styles.cardImgMobile : styles.cardImg;

                return (
                  <article key={b.id} style={{ ...styles.card, position: "relative" }}>
                    {b.available === false && (
                      <div style={styles.badge}>In circulation</div>
                    )}

                    {/* Image or Title Placeholder */}
                    {chosenURL ? (
                      <img
                        src={chosenURL}
                        alt={b.title}
                        style={imgStyle}
                        onError={(e) => (e.currentTarget.src = "/covers/placeholder.jpg")}
                      />
                    ) : (
                      <div style={{ ...imgStyle, display: "grid", placeItems: "center", background: "#fafafa" }}>
                        <div style={{ padding: 8, textAlign: "center", fontWeight: 700 }}>{b.title}</div>
                      </div>
                    )}

                    {/* Flip button (front/back) */}
                    <button
                      title="Flip cover"
                      onClick={() => toggleFlip(b.id)}
                      style={styles.flipBtn}
                    >
                      🔁
                    </button>

                    <div style={{ padding: "8px 10px" }}>
                      <div style={{ fontWeight: 700 }}>{b.title}</div>
                      <div style={{ color: "#555", fontSize: 13 }}>{b.author || ""}</div>
                      <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {b.year && <span style={styles.pill}>വർഷം: {b.year}</span>}
                        {b.isbn && <span style={styles.pill}>ISBN: {b.isbn}</span>}
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <small>
                          <button
                            onClick={() => alert(b.description ? b.description : "No description yet.")}
                            style={styles.moreLink}
                          >
                            More about the book
                          </button>
                        </small>
                      </div>

                      <div style={{ marginTop: 10 }}>
                        <a
                          href={waLinkFor(b)}
                          target="_blank"
                          rel="noreferrer"
                          style={isAvailable ? styles.waBtn : styles.waBtnDim}
                          title={isAvailable ? "Order this book on WhatsApp" : "Order in advance on WhatsApp"}
                        >
                          {isAvailable ? "Order this Book" : "Order in advance"}
                        </a>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </main>
    </div>
    {/* subtle admin button */}
<Link to="/admin" style={styles.adminFab} title="Admin">🔒</Link>

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

/* ---- Add Book (image is OPTIONAL now) ---- */
function AdminAddBook() {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState("");
  const [year, setYear] = useState("");
  const [isbn, setIsbn] = useState("");
  const [file, setFile] = useState(null);           // front cover (optional)
  const [backFile, setBackFile] = useState(null);   // back cover (optional)
  const [description, setDescription] = useState(""); // optional
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return setMsg("Title is required");
    setMsg(""); setBusy(true);

    try {
      // upload front cover if provided
      let frontURL = "";
      if (file) {
        const frontName = `${Date.now()}_${file.name}`;
        const frontRef = ref(storage, `covers/${frontName}`);
        await uploadBytes(frontRef, file);
        frontURL = await getDownloadURL(frontRef);
      }

      // upload back cover if provided
      let backURL = "";
      if (backFile) {
        const backName = `${Date.now()}_back_${backFile.name}`;
        const backRef = ref(storage, `covers/${backName}`);
        await uploadBytes(backRef, backFile);
        backURL = await getDownloadURL(backRef);
      }

      await addDoc(collection(db, "books"), {
        title: title.trim(),
        author: author.trim(),
        category: category.trim(),
        year: year.trim(),
        isbn: isbn.trim(),
        imageURL: frontURL,        // can be empty
        backImageURL: backURL,     // can be empty
        description: description.trim(),
        available: true,           // default available
        hidden: false,             // default visible to users
        createdAt: serverTimestamp(),
      });

      setTitle(""); setAuthor(""); setCategory(""); setYear(""); setIsbn("");
      setFile(null); setBackFile(null); setDescription("");
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
          <span>Front cover (optional)</span>
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span>Back cover (optional)</span>
          <input type="file" accept="image/*" onChange={(e) => setBackFile(e.target.files?.[0] || null)} />
        </label>
        <label style={{ gridColumn: "1 / -1", display: "grid", gap: 4 }}>
          <span>Description (optional)</span>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
      </div>
      <div style={{ marginTop: 12 }}>
        <button disabled={busy} type="submit">{busy ? "Uploading…" : "Add book"}</button>
        {msg && <div style={{ marginTop: 8, color: msg.startsWith("✅") ? "#0a7d33" : "#b00020" }}>{msg}</div>}
      </div>
    </form>
  );
}

/* ---- Manage Books (edit, toggle availability, hide/unhide, delete) ---- */
function AdminManageBooks() {
  const [books, setBooks] = useState([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null); // holds the book object being edited
  const [saving, setSaving] = useState(false);

  // edit form local state
  const [eTitle, setETitle] = useState("");
  const [eAuthor, setEAuthor] = useState("");
  const [eCategory, setECategory] = useState("");
  const [eYear, setEYear] = useState("");
  const [eIsbn, setEIsbn] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eAvail, setEAvail] = useState(true);
  const [eHidden, setEHidden] = useState(false);
  const [eFrontFile, setEFrontFile] = useState(null);
  const [eBackFile, setEBackFile] = useState(null);

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

  function openEdit(b) {
    setEditing(b);
    setETitle(b.title || "");
    setEAuthor(b.author || "");
    setECategory(b.category || "");
    setEYear(b.year || "");
    setEIsbn(b.isbn || "");
    setEDesc(b.description || "");
    setEAvail(b.available !== false);
    setEHidden(!!b.hidden);
    setEFrontFile(null);
    setEBackFile(null);
  }
  function cancelEdit() {
    setEditing(null);
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    try {
      const updates = {
        title: eTitle.trim(),
        author: eAuthor.trim(),
        category: eCategory.trim(),
        year: eYear.trim(),
        isbn: eIsbn.trim(),
        description: eDesc.trim(),
        available: eAvail,
        hidden: eHidden,
      };

      // upload new front cover if chosen
      if (eFrontFile) {
        const name = `${Date.now()}_${eFrontFile.name}`;
        const r = ref(storage, `covers/${name}`);
        await uploadBytes(r, eFrontFile);
        updates.imageURL = await getDownloadURL(r);
      }
      // upload new back cover if chosen
      if (eBackFile) {
        const name = `${Date.now()}_back_${eBackFile.name}`;
        const r = ref(storage, `covers/${name}`);
        await uploadBytes(r, eBackFile);
        updates.backImageURL = await getDownloadURL(r);
      }

      await updateDoc(doc(db, "books", editing.id), updates);
      setEditing(null);
    } catch (e) {
      alert("Failed to save: " + (e.message || ""));
    } finally {
      setSaving(false);
    }
  }

  // ---- EXPORTS (unchanged) ----
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
    const header = ["title","author","category","year","isbn","imageURL","backImageURL","description","available","hidden","createdAt"];
    const rows = books.map(b => [
      b.title || "",
      b.author || "",
      b.category || "",
      b.year || "",
      b.isbn || "",
      b.imageURL || "",
      b.backImageURL || "",
      (b.description || "").replace(/\r?\n/g, " "),
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
  async function exportPDF() {
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    pdf.setFontSize(14);
    pdf.text("PRIAM Library — Books Export with Covers", 40, 40);
    function imgUrlToDataURL(url) {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            const data = canvas.toDataURL("image/png");
            resolve(data);
          } catch (e) {
            resolve(null);
          }
        };
        img.onerror = () => resolve(null);
        img.src = url;
      });
    }
    const x0 = 40, y0 = 60;
    const imgW = 60, imgH = 80, gap = 14;
    const cols = 3;
    const pageH = pdf.internal.pageSize.getHeight();
    let col = 0, x = x0, y = y0;
    for (const b of books) {
      const url = b.imageURL || "/covers/placeholder.jpg";
      const dataURL = await imgUrlToDataURL(url);
      if (dataURL) {
        pdf.addImage(dataURL, "PNG", x, y, imgW, imgH);
      } else {
        pdf.setFillColor(240);
        pdf.rect(x, y, imgW, imgH, "F");
      }
      pdf.setFontSize(9);
      const title = b.title || "Untitled";
      const author = b.author ? `by ${b.author}` : "";
      const status = b.available === false ? "In circulation" : "";
      pdf.text(title, x, y + imgH + 12, { maxWidth: imgW });
      if (author) pdf.text(author, x, y + imgH + 24, { maxWidth: imgW });
      if (status) pdf.text(status, x, y + imgH + 36, { maxWidth: imgW });
      col++;
      if (col >= cols) {
        col = 0;
        x = x0;
        y += imgH + 60;
        if (y > pageH - 100) {
          pdf.addPage();
          y = y0;
        }
      } else {
        x += imgW + gap;
      }
    }
    pdf.save("priam_books_with_images.pdf");
  }

  return (
    <section style={styles.card}>
      <h3 style={{ marginTop: 0 }}>Manage Books</h3>

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
                  <button onClick={() => openEdit(b)} style={{ marginRight: 8 }}>Edit</button>
                  <button onClick={() => removeBook(b.id, b.title)} style={{ color: "#b00020" }}>
                    Delete
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

      {/* Edit Drawer */}
      {editing && (
        <div style={{ marginTop: 16, padding: 12, border: "1px solid #e5e5e5", borderRadius: 12, background: "#fafafa" }}>
          <h4 style={{ marginTop: 0 }}>Edit: {editing.title || "Untitled"}</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Title" value={eTitle} onChange={setETitle} />
            <Field label="Author" value={eAuthor} onChange={setEAuthor} />
            <Field label="Category" value={eCategory} onChange={setECategory} />
            <Field label="Year" value={eYear} onChange={setEYear} />
            <Field label="ISBN" value={eIsbn} onChange={setEIsbn} />
            <label style={{ display: "grid", gap: 4 }}>
              <span>Replace front cover (optional)</span>
              <input type="file" accept="image/*" onChange={(e) => setEFrontFile(e.target.files?.[0] || null)} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span>Replace back cover (optional)</span>
              <input type="file" accept="image/*" onChange={(e) => setEBackFile(e.target.files?.[0] || null)} />
            </label>
            <label style={{ gridColumn: "1 / -1", display: "grid", gap: 4 }}>
              <span>Description</span>
              <textarea rows={3} value={eDesc} onChange={(e) => setEDesc(e.target.value)} />
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={eAvail} onChange={(e) => setEAvail(e.target.checked)} />
              <span>Available</span>
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={eHidden} onChange={(e) => setEHidden(e.target.checked)} />
              <span>Hidden from users</span>
            </label>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button disabled={saving} onClick={saveEdit}>{saving ? "Saving…" : "Save changes"}</button>
            <button onClick={cancelEdit}>Cancel</button>
          </div>
        </div>
      )}
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
  cardImgMobile: { width: "100%", height: 220, objectFit: "contain", display: "block", background: "#fff" },

  flipBtn: { position: "absolute", top: 8, right: 8, border: "1px solid #ddd", background: "#fff", borderRadius: 8, padding: "2px 6px", cursor: "pointer" },

  pill: { fontSize: 12, border: "1px solid #ddd", borderRadius: 999, padding: "2px 8px", background: "#fff" },

  waBtn: { display: "inline-block", textDecoration: "none", border: "1px solid #25D366", background: "#25D366", color: "#fff", padding: "6px 10px", borderRadius: 8, fontSize: 14 },
  waBtnDim: { display: "inline-block", textDecoration: "none", border: "1px solid #bbb", background: "#bbb", color: "#fff", padding: "6px 10px", borderRadius: 8, fontSize: 14, opacity: 0.95 },
adminFab: {
  position: "fixed",
  right: 14,
  bottom: 14,
  width: 42,
  height: 42,
  borderRadius: 21,
  display: "grid",
  placeItems: "center",
  border: "1px solid #ddd",
  background: "#fff",
  textDecoration: "none",
  fontSize: 20,
  color: "#333",
  boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
  opacity: 0.75,
}

  badge: { position: "absolute", top: 8, left: 8, background: "#b00020", color: "#fff", fontSize: 12, padding: "2px 8px", borderRadius: 999, boxShadow: "0 1px 2px rgba(0,0,0,0.2)" },

  th: { textAlign: "left", padding: 8, background: "#f8f8f8", fontWeight: 600, borderBottom: "1px solid #eee" },
  td: { padding: 8 },

  moreLink: { border: "none", background: "none", color: "#2563eb", cursor: "pointer", fontSize: 12, padding: 0, textDecoration: "underline" },
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
