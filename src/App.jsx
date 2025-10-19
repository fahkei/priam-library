import React, { useEffect, useMemo, useRef, useState } from "react";
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
 * - User: gallery (hides 'hidden', shows 'In circulation' badge) + availability tabs
 * - Admin: Login → Add Book (image optional, category dropdown) → Manage Books (edit, toggle, hide, delete)
 * - Splash: after 2s, show a non-fullscreen overlay for 4s with “Skip” button
 * - Book Preview Modal: bigger image, Next view (front/back), Order button
 */

const WHATSAPP_NUMBER = "917025832552"; // change to your number, no '+'
const DEFAULT_CATEGORIES = [
  "Novel", "Story", "Short Story", "Poetry",
  "Biography", "History", "Religion", "Philosophy",
  "Science", "Technology", "Education",
  "Children", "Young Adult", "Comics",
  "Thriller", "Mystery", "Romance",
  "Self-help", "Health", "Travel",
  "General"
];

function waLinkFor(book) {
  const title = book.title || "";
  const author = book.author ? ` by ${book.author}` : "";
  const isbn = book.isbn ? ` (ISBN: ${book.isbn})` : "";
  const msg = `ഹായ് PRIAM,\nഈ പുസ്തകം എനിക്ക് വേണം: “${title}${author}”${isbn}.\n`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
}
function waHelloLink() {
  const msg = "Hi PRIAM";
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
  // Tabs: "all" | "circulation"
  const [availTab, setAvailTab] = useState("all");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalBookId, setModalBookId] = useState(null);
  const [modalShowBack, setModalShowBack] = useState(false);

  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

  useEffect(() => {
    const qRef = query(collection(db, "books"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(qRef, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setBooks(rows);
    });
    return () => unsub();
  }, []);

  // Close on ESC
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") closeModal();
    }
    if (modalOpen) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalOpen]);

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
        cat === "all" || (b.category || "").toLowerCase() === cat.toLowerCase();

      // Show all when "all"; only not available when "circulation"
      const isAvail = b.available !== false;
      const availOK = availTab === "all" ? true : !isAvail;

      if (!t) return catOK && availOK;
      const hay = `${b.title} ${b.author || ""} ${b.isbn || ""}`.toLowerCase();
      return catOK && availOK && hay.includes(t);
    });
  }, [visible, q, cat, availTab]);

  const grouped = useMemo(() => groupBy(filtered, (b) => b.category), [filtered]);

  function moreText(b) {
    const lines = [];
    if (b.description) lines.push(b.description);
    if (b.year) lines.push(`Year: ${b.year}`);
    if (b.isbn) lines.push(`ISBN: ${b.isbn}`);
    return lines.length ? lines.join("\n\n") : "No details yet.";
  }

  function openModal(b) {
    setModalBookId(b.id);
    setModalShowBack(false);
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setModalBookId(null);
    setModalShowBack(false);
  }
  function toggleView() {
    const b = books.find((x) => x.id === modalBookId);
    if (!b) return;
    // Only allow toggle if back image exists
    if (b.backImageURL) setModalShowBack((v) => !v);
  }

  const modalBook = modalBookId ? books.find((x) => x.id === modalBookId) : null;
  const modalImgURL =
    modalBook && modalShowBack && modalBook.backImageURL
      ? modalBook.backImageURL
      : modalBook?.imageURL || "/covers/placeholder.jpg";

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
            <div style={{ fontSize: 12, color: "#555" }}>
              വീട്ടിലെത്തുന്ന വായന&nbsp;
              <a
                href={waHelloLink()}
                target="_blank"
                rel="noreferrer noopener"
                title="WhatsApp PRIAM"
                style={{ color: "#25D366", textDecoration: "none", fontWeight: 600 }}
              >
                📞 7025832552
              </a>
            </div>
          </div>
        </div>

        {/* Small Admin link on top-right */}
        <Link to="/admin" style={styles.adminLink} title="Admin">
          Admin
        </Link>
      </header>

      <main style={{ ...styles.main, padding: isMobile ? 12 : 16, maxWidth: isMobile ? 520 : 1100 }}>
        {/* Search + Category */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 240px",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <input
            placeholder="തിരയൂ.. പേര്/എഴുത്തുകാരൻ/ISBN…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "All categories" : c}
              </option>
            ))}
          </select>
        </div>

        {/* Availability Tabs: All books | In circulation */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button
            onClick={() => setAvailTab("all")}
            style={availTab === "all" ? styles.tabActive : styles.tab}
          >
            All books
          </button>
          <button
            onClick={() => setAvailTab("circulation")}
            style={availTab === "circulation" ? styles.tabActive : styles.tab}
          >
            In circulation
          </button>
        </div>

        {Object.entries(grouped).map(([section, list]) => (
          <section key={section} style={styles.section}>
            <div style={styles.sectionHead}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{section || "വിഭാഗമില്ല"}</h2>
            </div>
            <div
              style={{
                ...styles.galleryGrid,
                gridTemplateColumns: isMobile
                  ? "repeat(auto-fill, minmax(140px, 1fr))"
                  : "repeat(auto-fill, minmax(180px, 1fr))",
              }}
            >
              {list.map((b) => {
                const isAvailable = b.available !== false;
                const imgStyle = isMobile ? styles.cardImgMobile : styles.cardImg;

                return (
                  <article key={b.id} style={{ ...styles.card, position: "relative" }}>
                    {b.available === false && (
                      <div style={styles.badge}>In circulation</div>
                    )}

                    {/* Click image -> open modal */}
                    {b.imageURL ? (
                      <img
                        src={b.imageURL}
                        alt={b.title}
                        style={imgStyle}
                        onClick={() => openModal(b)}
                        onError={(e) => (e.currentTarget.src = "/covers/placeholder.jpg")}
                      />
                    ) : (
                      <div
                        onClick={() => openModal(b)}
                        style={{ ...imgStyle, display: "grid", placeItems: "center", background: "#fafafa", cursor: "pointer" }}
                        title="Preview book"
                      >
                        <div style={{ padding: 8, textAlign: "center", fontWeight: 700 }}>{b.title}</div>
                      </div>
                    )}

                    <div style={{ padding: "8px 10px" }}>
                      <div style={{ fontWeight: 700 }}>{b.title}</div>
                      <div style={{ color: "#555", fontSize: 13 }}>{b.author || ""}</div>

                      <div style={{ marginTop: 8 }}>
                        <small>
                          <button
                            onClick={() => alert(moreText(b))}
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
                          rel="noreferrer noopener"
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

        {/* Footer with phone */}
        <footer style={{ marginTop: 24, textAlign: "center", fontSize: 14, color: "#444" }}>
          Know more: <a href="tel:9746832552" style={{ color: "#2563eb", textDecoration: "none" }}>9746832552</a>
        </footer>
      </main>

      {/* ====== BOOK PREVIEW MODAL ====== */}
      {modalOpen && modalBook && (
        <div style={styles.modalBackdrop} onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <div style={{ fontWeight: 700 }}>{modalBook.title || "Untitled"}</div>
                {modalBook.author && <div style={{ fontSize: 12, color: "#666" }}>by {modalBook.author}</div>}
              </div>
              <button onClick={closeModal} style={styles.modalCloseBtn} title="Close">✕</button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.modalMediaCol}>
                <img
                  src={modalImgURL}
                  alt={modalBook.title}
                  style={styles.modalImg}
                  onError={(e) => (e.currentTarget.src = "/covers/placeholder.jpg")}
                />
                <div style={styles.modalMediaControls}>
                  <button
                    onClick={toggleView}
                    disabled={!modalBook.backImageURL}
                    title={modalBook.backImageURL ? "Show next view" : "No back cover uploaded"}
                    style={styles.modalSecondaryBtn}
                  >
                    {modalShowBack ? "Show front" : "Show back"}
                  </button>
                </div>
              </div>

              <div style={styles.modalInfoCol}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={modalBook.available === false ? styles.statusPillRed : styles.statusPillGreen}>
                    {modalBook.available === false ? "In circulation" : "Available"}
                  </span>
                </div>

                <div style={{ marginTop: 10, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                  {modalBook.description ? modalBook.description : "No details yet."}
                  {modalBook.year && <div style={{ marginTop: 8, color: "#555" }}><b>Year:</b> {modalBook.year}</div>}
                  {modalBook.isbn && <div style={{ color: "#555" }}><b>ISBN:</b> {modalBook.isbn}</div>}
                </div>

                <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <a
                    href={waLinkFor(modalBook)}
                    target="_blank"
                    rel="noreferrer noopener"
                    style={styles.waBtn}
                    title="Order on WhatsApp"
                  >
                    📦 Order on WhatsApp
                  </a>
                  <button onClick={closeModal} style={styles.modalSecondaryBtn}>Close</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ===================== ADMIN SIDE ===================== */
function Admin() {
  const [user, setUser] = useState(null);
  const [adminTab, setAdminTab] = useState("manage"); // "add" | "manage"
  const nav = useNavigate();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

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
      <main style={{ ...styles.main, padding: isMobile ? 12 : 16, maxWidth: isMobile ? 560 : 1100 }}>
        {adminTab === "add" ? <AdminAddBook /> : <AdminManageBooks />}
        <footer style={{ marginTop: 24, textAlign: "center", fontSize: 14, color: "#444" }}>
          Know more: <a href="tel:9746832552" style={{ color: "#2563eb", textDecoration: "none" }}>9746832552</a>
        </footer>
      </main>
    </div>
  );
}

function AdminLogin() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");

  return (
    <div style={{ ...styles.page, display: "grid", placeItems: "center" }}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await signInWithEmailAndPassword(auth, email.trim(), pass);
          } catch (e2) {
            setErr(e2.message || "Login failed");
          }
        }}
        style={{ ...styles.card, width: 360, maxWidth: "95vw" }}
      >
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

/* ---- Add Book (image OPTIONAL; category dropdown) ---- */
function AdminAddBook() {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [categorySel, setCategorySel] = useState(DEFAULT_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [year, setYear] = useState("");
  const [isbn, setIsbn] = useState("");
  const [callNumber, setCallNumber] = useState(""); // optional, not shown to users
  const [file, setFile] = useState(null);         // front cover (optional)
  const [backFile, setBackFile] = useState(null); // back cover (optional)
  const [description, setDescription] = useState(""); // optional
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return setMsg("Title is required");
    if (!author.trim()) return setMsg("Author is required"); // <- Author mandatory
    setMsg(""); setBusy(true);

    try {
      const finalCategory = categorySel === "custom" ? customCategory.trim() : categorySel;

      let frontURL = "";
      if (file) {
        const frontName = `${Date.now()}_${file.name}`;
        const frontRef = ref(storage, `covers/${frontName}`);
        await uploadBytes(frontRef, file);
        frontURL = await getDownloadURL(frontRef);
      }

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
        category: finalCategory,
        year: year.trim(),           // optional
        isbn: isbn.trim(),           // optional
        callNumber: callNumber.trim(), // optional
        imageURL: frontURL,
        backImageURL: backURL,
        description: description.trim(),
        available: true,
        hidden: false,
        createdAt: serverTimestamp(),
      });

      setTitle(""); setAuthor("");
      setCategorySel(DEFAULT_CATEGORIES[0]); setCustomCategory("");
      setYear(""); setIsbn(""); setCallNumber("");
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
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 10,
        }}
      >
        <Field label="Title *" value={title} onChange={setTitle} />
        <Field label="Author *" value={author} onChange={setAuthor} />

        <label style={{ display: "grid", gap: 4 }}>
          <span>Category</span>
          <select value={categorySel} onChange={(e) => setCategorySel(e.target.value)}>
            {DEFAULT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
            <option value="custom">Custom…</option>
          </select>
        </label>
        {categorySel === "custom" && (
          <label style={{ display: "grid", gap: 4 }}>
            <span>Custom category</span>
            <input
              placeholder="Type your category"
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
            />
          </label>
        )}

        <Field label="Year (optional)" value={year} onChange={setYear} />
        <Field label="ISBN (optional)" value={isbn} onChange={setIsbn} />
        <Field label="Call number (optional)" value={callNumber} onChange={setCallNumber} />

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
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  // edit form local state
  const [eTitle, setETitle] = useState("");
  const [eAuthor, setEAuthor] = useState("");
  const [eCategorySel, setECategorySel] = useState(DEFAULT_CATEGORIES[0]);
  const [eCustomCategory, setECustomCategory] = useState("");
  const [eYear, setEYear] = useState("");
  const [eIsbn, setEIsbn] = useState("");
  const [eCallNumber, setECallNumber] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eAvail, setEAvail] = useState(true);
  const [eHidden, setEHidden] = useState(false);
  const [eFrontFile, setEFrontFile] = useState(null);
  const [eBackFile, setEBackFile] = useState(null);

  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

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
    if (b.category && DEFAULT_CATEGORIES.includes(b.category)) {
      setECategorySel(b.category);
      setECustomCategory("");
    } else if (b.category) {
      setECategorySel("custom");
      setECustomCategory(b.category);
    } else {
      setECategorySel(DEFAULT_CATEGORIES[0]);
      setECustomCategory("");
    }
    setEYear(b.year || "");
    setEIsbn(b.isbn || "");
    setECallNumber(b.callNumber || "");
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
      const finalCategory =
        eCategorySel === "custom" ? eCustomCategory.trim() : eCategorySel;

      const updates = {
        title: eTitle.trim(),
        author: eAuthor.trim(),
        category: finalCategory,
        year: eYear.trim(),     // optional
        isbn: eIsbn.trim(),     // optional
        callNumber: eCallNumber.trim(), // optional
        description: eDesc.trim(),
        available: eAvail,
        hidden: eHidden,
      };

      if (eFrontFile) {
        const name = `${Date.now()}_${eFrontFile.name}`;
        const r = ref(storage, `covers/${name}`);
        await uploadBytes(r, eFrontFile);
        updates.imageURL = await getDownloadURL(r);
      }
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
    const header = ["title","author","category","year","isbn","callNumber","imageURL","backImageURL","description","available","hidden","createdAt"];
    const rows = books.map(b => [
      b.title || "",
      b.author || "",
      b.category || "",
      b.year || "",
      b.isbn || "",
      b.callNumber || "",
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
          } catch {
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
      if (dataURL) pdf.addImage(dataURL, "PNG", x, y, imgW, imgH);
      else { pdf.setFillColor(240); pdf.rect(x, y, imgW, imgH, "F"); }
      pdf.setFontSize(9);
      const title = b.title || "Untitled";
      const author = b.author ? `by ${b.author}` : "";
      const status = b.available === false ? "In circulation" : "";
      pdf.text(title, x, y + imgH + 12, { maxWidth: imgW });
      if (author) pdf.text(author, x, y + imgH + 24, { maxWidth: imgW });
      if (status) pdf.text(status, x, y + imgH + 36, { maxWidth: imgW });
      col++;
      if (col >= cols) { col = 0; x = x0; y += imgH + 60;
        if (y > pageH - 100) { pdf.addPage(); y = y0; } }
      else { x += imgW + gap; }
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
              {/* Reordered columns: Title, Author, Availability, Call number, Category, Visibility, Actions */}
              <th style={styles.th}>Title</th>
              <th style={styles.th}>Author</th>
              <th style={styles.th}>Availability</th>
              <th style={styles.th}>Call number</th>
              <th style={styles.th}>Category</th>
              <th style={styles.th}>Visibility</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => (
              <tr key={b.id} style={{ borderTop: "1px solid #eee" }}>
                <td style={styles.td}>{b.title}</td>
                <td style={styles.td}>{b.author || "—"}</td>
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
                <td style={styles.td}>{b.callNumber || "—"}</td>
                <td style={styles.td}>{b.category || "—"}</td>
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
                  {/* Delete disabled
                  <button onClick={() => removeBook(b.id, b.title)} style={{ color: "#b00020" }}>
                    Delete
                  </button>
                  */}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td style={styles.td} colSpan={7}>No books found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Drawer */}
      {editing && (
        <div style={{ marginTop: 16, padding: 12, border: "1px solid #e5e5e5", borderRadius: 12, background: "#fafafa" }}>
          <h4 style={{ marginTop: 0 }}>Edit: {editing.title || "Untitled"}</h4>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              gap: 10,
            }}
          >
            <Field label="Title" value={eTitle} onChange={setETitle} />
            <Field label="Author" value={eAuthor} onChange={setEAuthor} />

            <label style={{ display: "grid", gap: 4 }}>
              <span>Category</span>
              <select value={eCategorySel} onChange={(e) => setECategorySel(e.target.value)}>
                {DEFAULT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
                <option value="custom">Custom…</option>
              </select>
            </label>
            {eCategorySel === "custom" && (
              <label style={{ display: "grid", gap: 4 }}>
                <span>Custom category</span>
                <input
                  placeholder="Type your category"
                  value={eCustomCategory}
                  onChange={(e) => setECustomCategory(e.target.value)}
                />
              </label>
            )}

            <Field label="Year (optional)" value={eYear} onChange={setEYear} />
            <Field label="ISBN (optional)" value={eIsbn} onChange={setEIsbn} />
            <Field label="Call number (optional)" value={eCallNumber} onChange={setECallNumber} />

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

          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
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
  header: {
    position: "sticky", top: 0, zIndex: 10, background: "#fff",
    borderBottom: "1px solid #ddd", padding: "12px 16px",
    display: "flex", justifyContent: "space-between", alignItems: "center"
  },
  logoBox: { width: 40, height: 40, border: "1px solid #ddd", borderRadius: 12, display: "grid", placeItems: "center" },

  adminLink: {
    padding: "4px 10px",
    borderRadius: 8,
    border: "1px solid #ddd",
    background: "#fff",
    textDecoration: "none",
    color: "#333",
    fontSize: 13
  },

  tab: { padding: "6px 10px", background: "#f3f3f3", border: "1px solid #ddd", borderRadius: 8, textDecoration: "none", color: "#222" },
  tabActive: { padding: "6px 10px", background: "#e5f0ff", border: "1px solid #7aa7ff", borderRadius: 8, textDecoration: "none", color: "#222" },

  main: { maxWidth: 1100, margin: "0 auto", padding: 16 },

  section: { border: "1px solid #ddd", borderRadius: 12, background: "#fff", marginBottom: 16 },
  sectionHead: { padding: "10px 14px", borderBottom: "1px solid #eee", background: "#f7f9ff" },

  galleryGrid: { padding: 12, display: "grid", gap: 12 },

  card: { background: "#fff", border: "1px solid #eee", borderRadius: 12, overflow: "hidden", display: "grid" },
  cardImg: { width: "100%", height: 220, objectFit: "cover", display: "block", background: "#fafafa", cursor: "pointer" },
  cardImgMobile: { width: "100%", height: 220, objectFit: "contain", display: "block", background: "#fff", cursor: "pointer" },

  pill: { fontSize: 12, border: "1px solid #ddd", borderRadius: 999, padding: "2px 8px", background: "#fff" },

  waBtn: { display: "inline-block", textDecoration: "none", border: "1px solid #25D366", background: "#25D366", color: "#fff", padding: "6px 10px", borderRadius: 8, fontSize: 14 },
  waBtnDim: { display: "inline-block", textDecoration: "none", border: "1px solid #bbb", background: "#bbb", color: "#fff", padding: "6px 10px", borderRadius: 8, fontSize: 14, opacity: 0.95 },

  badge: { position: "absolute", top: 8, left: 8, background: "#b00020", color: "#fff", fontSize: 12, padding: "2px 8px", borderRadius: 999, boxShadow: "0 1px 2px rgba(0,0,0,0.2)" },

  th: { textAlign: "left", padding: 8, background: "#f8f8f8", fontWeight: 600, borderBottom: "1px solid #eee" },
  td: { padding: 8 },

  moreLink: { border: "none", background: "none", color: "#2563eb", cursor: "pointer", fontSize: 12, padding: 0, textDecoration: "underline" },

  // splash overlay (NOT full-screen content box)
  splashBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.35)",
    display: "grid",
    placeItems: "center",
    zIndex: 1000,
  },
  splashCard: {
    background: "#ffffff",
    borderRadius: 16,
    border: "1px solid #e5e5e5",
    width: "min(90vw, 800px)",
    boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
    overflow: "hidden",
    position: "relative",
  },
  splashHeader: {
    padding: "8px 12px",
    borderBottom: "1px solid #f0f0f0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "#fafafa"
  },
  splashBody: {
    padding: 0,
  },
  splashImgContained: {
    width: "100%",
    height: "60vh",
    maxHeight: 520,
    objectFit: "cover",
    display: "block",
    background: "#000",
  },
  splashSkip: {
    border: "1px solid #ddd",
    background: "#fff",
    borderRadius: 8,
    padding: "4px 10px",
    cursor: "pointer",
    fontSize: 13
  },

  /* ===== Book Preview Modal ===== */
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "grid",
    placeItems: "center",
    zIndex: 1200,
    padding: 12,
  },
  modalCard: {
    background: "#fff",
    width: "min(96vw, 980px)",
    maxHeight: "90vh",
    borderRadius: 16,
    border: "1px solid #e5e5e5",
    boxShadow: "0 16px 50px rgba(0,0,0,0.35)",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    overflow: "hidden",
  },
  modalHeader: {
    padding: "10px 12px",
    borderBottom: "1px solid #eee",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    background: "#fafafa"
  },
  modalCloseBtn: {
    border: "1px solid #ddd",
    background: "#fff",
    borderRadius: 8,
    padding: "4px 10px",
    cursor: "pointer",
    fontSize: 13
  },
  modalBody: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    padding: 12,
  },
  modalMediaCol: {
    display: "grid",
    gridTemplateRows: "1fr auto",
    gap: 8,
    minHeight: 0,
  },
  modalImg: {
    width: "100%",
    height: "60vh",
    maxHeight: 520,
    objectFit: "contain",
    background: "#000",
    borderRadius: 12,
  },
  modalMediaControls: {
    display: "flex",
    gap: 8,
    justifyContent: "flex-start",
  },
  modalInfoCol: {
    minHeight: 0,
    overflowY: "auto",
    paddingRight: 4,
  },
  modalSecondaryBtn: {
    border: "1px solid #ddd",
    background: "#fff",
    borderRadius: 8,
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: 14
  },
  statusPillGreen: {
    display: "inline-block",
    background: "#e8fff0",
    border: "1px solid #7bd6a7",
    color: "#0a7d33",
    fontSize: 12,
    padding: "2px 8px",
    borderRadius: 999,
  },
  statusPillRed: {
    display: "inline-block",
    background: "#ffeff0",
    border: "1px solid #ff9aa6",
    color: "#b00020",
    fontSize: 12,
    padding: "2px 8px",
    borderRadius: 999,
  },
};

/* ---- Router + Splash ---- */
export default function App() {
  // Splash logic: start hidden, show after 2s, auto-hide after 4s (or on Skip)
  const [showSplash, setShowSplash] = useState(false);
  const showTimerRef = useRef(null);
  const hideTimerRef = useRef(null);

  useEffect(() => {
    // After 2 seconds, show
    showTimerRef.current = setTimeout(() => {
      setShowSplash(true);
      // After 4 seconds of being shown, hide
      hideTimerRef.current = setTimeout(() => {
        setShowSplash(false);
      }, 4000);
    }, 2000);

    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const skipSplash = () => {
    setShowSplash(false);
    if (showTimerRef.current) clearTimeout(showTimerRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  };

  return (
    <BrowserRouter>
      {/* Non-fullscreen splash overlay (appears after 2s, lasts 4s, skippable) */}
      {showSplash && (
        <div style={styles.splashBackdrop}>
          <div style={styles.splashCard}>
            <div style={styles.splashHeader}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Welcome to PRIAM</div>
              <button onClick={skipSplash} style={styles.splashSkip} title="Close">✕</button>
            </div>
            <div style={styles.splashBody}>
              {/* change to /flash.png or /flash.webp if your file has a different extension */}
              <img
                src="/flash.jpeg"
                alt="PRIAM"
                style={styles.splashImgContained}
                onError={(e)=>{ e.currentTarget.src="/flash.png"; }}
              />
            </div>
          </div>
        </div>
      )}

      <Routes>
        <Route path="/" element={<Gallery />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
