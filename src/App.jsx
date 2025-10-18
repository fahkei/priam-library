import React, { useEffect, useMemo, useRef, useState } from "react";

/** PRIAM — Gallery UI with WhatsApp action **/

// 👉 Set your WhatsApp number here (country code + number, no + or spaces)
const WHATSAPP_NUMBER = "919746832552"; // e.g., 91 98xxxxxxx → "9198xxxxxxx"

// LocalStorage keys
const LS_KEYS = {
  BOOKS: "priam_books_v2",
};

// Tiny helpers
const uuid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)) +
  Date.now().toString(36);

function useLocalStorage(key, initialValue) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initialValue;
    } catch {
      return initialValue;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);
  return [state, setState];
}

function groupBy(list, keyFn) {
  const out = {};
  list.forEach((x) => {
    const k = keyFn(x) || "മറ്റുള്ളവ";
    (out[k] ||= []).push(x);
  });
  return out;
}

function waLinkFor(book) {
  const title = book.title || "";
  const author = book.author ? ` by ${book.author}` : "";
  const isbn = book.isbn ? ` (ISBN: ${book.isbn})` : "";
  const msg =
    `ഹായ് PRIAM,\n` +
    `ഈ പുസ്തകം എനിക്ക് വേണം: “${title}${author}”${isbn}.\n` +
    `എന്റെ പേര്: ________\n` +
    `വിലാസം: ________\n` +
    `സൗകര്യമുള്ള സമയം: ________`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
}

function toCSV(books) {
  const header = ["title","author","category","year","isbn","image"];
  const rows = books.map(b => [
    b.title || "", b.author || "", b.category || "", b.year || "", b.isbn || "", b.image || ""
  ]);
  return [header.join(","), ...rows.map(r => r.join(","))].join("\n");
}

function download(filename, text, type="text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
}

export default function App() {
  // Default tab: gallery (new PDF-like view)
  const [tab, setTab] = useState("gallery");

  // Books live in localStorage; we load shared catalog.json on first visit
  const [books, setBooks] = useLocalStorage(LS_KEYS.BOOKS, []);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");

  const fileRef = useRef(null);

  // One-time fetch from /catalog.json on empty state
  useEffect(() => {
    if (books.length === 0) {
      fetch("/catalog.json")
        .then((r) => (r.ok ? r.json() : []))
        .then((list) => {
          if (Array.isArray(list) && list.length) {
            const normalized = list.map((b) => ({
              id: uuid(),
              title: b.title || "",
              author: b.author || "",
              category: b.category || "",
              year: b.year || "",
              isbn: b.isbn || "",
              image: b.image || "/covers/placeholder.jpg",
            }));
            setBooks(normalized);
          }
        })
        .catch(() => {});
    }
  }, []); // run once

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

  const byCategory = useMemo(
    () => groupBy(filtered, (b) => b.category),
    [filtered]
  );

  function exportCSV() {
    download("priam_books.csv", toCSV(books), "text/csv");
  }

  function importCSV(file) {
    if (!file) return;
    file.text().then((text) => {
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length <= 1) return alert("CSV must have header: title,author,category,year,isbn,image");
      const header = lines[0].split(",").map((x) => x.trim().toLowerCase());
      const idx = (n) => header.indexOf(n);
      const iT = idx("title"), iA = idx("author"), iC = idx("category"),
            iY = idx("year"), iI = idx("isbn"), iM = idx("image");
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        if (!cols[iT]) continue;
        rows.push({
          id: uuid(),
          title: (cols[iT] || "").trim(),
          author: (cols[iA] || "").trim(),
          category: (cols[iC] || "").trim(),
          year: (cols[iY] || "").trim(),
          isbn: (cols[iI] || "").trim(),
          image: (cols[iM] || "/covers/placeholder.jpg").trim(),
        });
      }
      if (!rows.length) return alert("No rows found.");
      setBooks((prev) => [...rows, ...prev]);
      alert(`Imported ${rows.length} book(s).`);
    });
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={styles.logoBox}>📚</div>
          <div>
            <div style={{ fontWeight: 700 }}>പ്രിയം ലൈബ്രറി (PRIAM)</div>
            <div style={{ fontSize: 12, color: "#555" }}>
              വീട്ടിലെത്തുന്ന വായന · Browse · Request · Deliver
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={exportCSV}>Export CSV</button>
          <button onClick={() => fileRef.current?.click()}>Import CSV</button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={(e) => importCSV(e.target.files?.[0])}
          />
        </div>
      </header>

      {/* Tabs */}
      <nav style={styles.tabs}>
        {["gallery", "settings"].map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={tab === k ? styles.tabActive : styles.tab}
          >
            {k === "gallery" ? "📖 Gallery (PDF-style)" : "Settings"}
          </button>
        ))}
      </nav>

      <main style={styles.main}>
        {/* GALLERY (PDF-like with images + WhatsApp) */}
        {tab === "gallery" && (
          <section style={{ display: "grid", gap: 16 }}>
            {/* Search + Filter */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 8 }}>
              <input
                placeholder="പുസ്തകം / Author / ISBN search…"
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

            {/* Big Malayalam Welcome like PDF */}
            <div style={{ padding: 14, border: "1px solid #ddd", borderRadius: 12, background: "#fff" }}>
              <h1 style={{ margin: "0 0 6px 0", fontSize: 28, textAlign: "center" }}>
                പ്രിയം ലൈബ്രറിയിലേക്ക് സ്വാഗതം!
              </h1>
              <p style={{ margin: 0, textAlign: "center", color: "#666" }}>
                നിങ്ങളുടെ വീടിലേക്ക് പുസ്തകം എത്തിക്കും — “Take this book on WhatsApp” അമർത്തൂ
              </p>
            </div>

            {/* Sectioned blocks like your PDF */}
            {Object.entries(byCategory).map(([section, list]) => (
              <div key={section} style={styles.section}>
                <div style={styles.sectionHead}>
                  <h2 style={{ margin: 0, fontSize: 20 }}>{section || "വിഭാഗമില്ല"}</h2>
                </div>

                <div style={styles.galleryGrid}>
                  {list.map((b) => (
                    <article key={b.id} style={styles.card}>
                      <img
                        src={b.image || "/covers/placeholder.jpg"}
                        alt={b.title}
                        style={styles.cardImg}
                        onError={(e) => (e.currentTarget.src = "/covers/placeholder.jpg")}
                      />
                      <div style={{ padding: "8px 10px" }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>{b.title}</div>
                        <div style={{ color: "#555", fontSize: 13 }}>
                          {b.author || ""}
                        </div>
                        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {b.year ? <span style={styles.pill}>വർഷം: {b.year}</span> : null}
                          {b.isbn ? <span style={styles.pill}>ISBN: {b.isbn}</span> : null}
                        </div>
                        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                          <a
                            href={waLinkFor(b)}
                            target="_blank"
                            rel="noreferrer"
                            style={styles.waBtn}
                            title="Open WhatsApp"
                          >
                            Take this book on WhatsApp
                          </a>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* SETTINGS */}
        {tab === "settings" && (
          <section style={styles.card}>
            <h3 style={{ marginTop: 0 }}>Settings & Help</h3>
            <ul>
              <li>
                Place images in <code>public/covers/</code>, and set each book’s{" "}
                <code>image</code> to <code>/covers/filename.jpg</code>.
              </li>
              <li>
                Shared catalogue file lives at <code>public/catalog.json</code>.
              </li>
              <li>
                WhatsApp number (with country code) is set at the top of{" "}
                <code>App.jsx</code> in <code>WHATSAPP_NUMBER</code>.
              </li>
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

/* -------------- Styles -------------- */
const styles = {
  page: { fontFamily: "system-ui, Arial, sans-serif", background: "#f7f7fb", minHeight: "100vh" },
  header: { position: "sticky", top: 0, zIndex: 10, background: "#fff", borderBottom: "1px solid #ddd", padding: "12px 16px",
            display: "flex", justifyContent: "space-between", alignItems: "center" },
  logoBox: { width: 40, height: 40, border: "1px solid #ddd", borderRadius: 12, display: "grid", placeItems: "center" },
  tabs: { display: "flex", gap: 8, padding: "12px 16px", borderBottom: "1px solid #eee", background: "#fff" },
  tab: { padding: "6px 10px", background: "#f3f3f3", border: "1px solid #ddd", borderRadius: 8 },
  tabActive: { padding: "6px 10px", background: "#e5f0ff", border: "1px solid #7aa7ff", borderRadius: 8 },
  main: { maxWidth: 1100, margin: "0 auto", padding: 16 },

  section: { border: "1px solid #ddd", borderRadius: 12, background: "#fff" },
  sectionHead: { padding: "10px 14px", borderBottom: "1px solid #eee", background: "#f7f9ff" },

  galleryGrid: {
    padding: 12,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: 12,
  },

  card: { background: "#fff", border: "1px solid #eee", borderRadius: 12, overflow: "hidden", display: "grid" },
  cardImg: { width: "100%", height: 220, objectFit: "cover", display: "block", background: "#fafafa" },

  pill: { fontSize: 12, border: "1px solid #ddd", borderRadius: 999, padding: "2px 8px", background: "#fff" },

  waBtn: {
    display: "inline-block",
    textDecoration: "none",
    border: "1px solid #25D366",
    background: "#25D366",
    color: "#fff",
    padding: "6px 10px",
    borderRadius: 8,
    fontSize: 14,
  },
};
