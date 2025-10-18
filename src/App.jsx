import React, { useEffect, useMemo, useRef, useState } from "react";

/** ---------- Types ----------
 * Book: { id, title, author?, category?, year?, isbn?, available, holder?, dueDate? }
 * Member: { id, name, phone?, address? }
 * RequestItem: { id, bookId, memberName, phone?, address?, status, requestedAt }
 -------------------------------- */

const LS_KEYS = {
  BOOKS: "priam_books_v1",
  MEMBERS: "priam_members_v1",
  REQUESTS: "priam_requests_v1",
};

const starterBooks = [
  mkBook("The Alchemist", "Paulo Coelho", "Fiction", "1988", "9780061122415"),
  mkBook("Wings of Fire", "A. P. J. Abdul Kalam", "Biography", "1999", "8173711461"),
  mkBook("Indian Economy", "Ramesh Singh", "Economics", "2024", "9355649816"),
  mkBook("A Brief History of Time", "Stephen Hawking", "Science", "1988", "0553380168"),
];

function mkBook(title, author, category, year, isbn) {
  return { id: uuid(), title, author, category, year, isbn, available: true };
}

function uuid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

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

function csvToBooks(csv) {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];
  const header = lines[0].split(",").map(x => x.trim().toLowerCase());
  const idx = n => header.indexOf(n);
  const iT = idx("title"),
    iA = idx("author"),
    iC = idx("category"),
    iY = idx("year"),
    iI = idx("isbn");
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (!cols[iT]) continue;
    out.push({
      id: uuid(),
      title: cols[iT]?.trim() ?? "",
      author: cols[iA]?.trim() || "",
      category: cols[iC]?.trim() || "",
      year: cols[iY]?.trim() || "",
      isbn: cols[iI]?.trim() || "",
      available: true,
    });
  }
  return out;
}

function toCSV(books) {
  const header = ["title", "author", "category", "year", "isbn", "available", "holder", "dueDate"];
  const rows = books.map(b => [
    b.title,
    b.author || "",
    b.category || "",
    b.year || "",
    b.isbn || "",
    String(b.available),
    b.holder || "",
    b.dueDate || "",
  ]);
  return [header.join(","), ...rows.map(r => r.join(","))].join("\n");
}

function download(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [tab, setTab] = useState("catalog");
  const [books, setBooks] = useLocalStorage(LS_KEYS.BOOKS, starterBooks);
  const [members, setMembers] = useLocalStorage(LS_KEYS.MEMBERS, []);
  const [requests, setReqs] = useLocalStorage(LS_KEYS.REQUESTS, []);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const fileRef = useRef(null);

  const categories = useMemo(() => {
    const s = new Set();
    books.forEach(b => b.category && s.add(b.category));
    return ["all", ...Array.from(s).sort()];
  }, [books]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return books.filter(b => {
      const catOK = cat === "all" || (b.category || "").toLowerCase() === cat.toLowerCase();
      const text = `${b.title} ${b.author || ""} ${b.isbn || ""}`.toLowerCase();
      return catOK && (!qq || text.includes(qq));
    });
  }, [books, q, cat]);

  const overdue = useMemo(() => {
    const now = Date.now();
    return books.filter(b => !b.available && b.dueDate && new Date(b.dueDate).getTime() < now);
  }, [books]);

  function addBook(form) {
    setBooks(v => [{ id: uuid(), available: true, ...form }, ...v]);
    alert("Book added to PRIAM catalog");
  }

  function importCSV(file) {
    if (!file) return;
    file.text().then(text => {
      const items = csvToBooks(text);
      if (!items.length)
        alert("No rows found. CSV must have header: title,author,category,year,isbn");
      else {
        setBooks(prev => [...items, ...prev]);
        alert(`Imported ${items.length} books`);
      }
    });
  }

  function requestBook(book, payload) {
    const item = {
      id: uuid(),
      bookId: book.id,
      memberName: payload.name,
      phone: payload.phone || "",
      address: payload.address || "",
      status: "pending",
      requestedAt: new Date().toISOString(),
    };
    setReqs(v => [item, ...v]);
    alert(`Request created: ${payload.name} → “${book.title}”`);
  }

  function approve(req) {
    const book = books.find(b => b.id === req.bookId);
    if (!book) return;
    const due = new Date();
    due.setDate(due.getDate() + 14);
    setBooks(arr =>
      arr.map(b =>
        b.id === book.id
          ? { ...b, available: false, holder: req.memberName, dueDate: due.toISOString() }
          : b
      )
    );
    setReqs(arr => arr.map(r => (r.id === req.id ? { ...r, status: "approved" } : r)));
  }

  const markDelivered = req =>
    setReqs(a => a.map(r => (r.id === req.id ? { ...r, status: "delivered" } : r)));

  function markReturned(req) {
    const book = books.find(b => b.id === req.bookId);
    if (book)
      setBooks(a =>
        a.map(b =>
          b.id === book.id ? { ...b, available: true, holder: "", dueDate: "" } : b
        )
      );
    setReqs(a => a.map(r => (r.id === req.id ? { ...r, status: "returned" } : r)));
  }

  const cancelReq = req =>
    setReqs(a => a.map(r => (r.id === req.id ? { ...r, status: "cancelled" } : r)));

  function backupAll() {
    download(
      "priam_backup.json",
      JSON.stringify({ books, members, requests }, null, 2),
      "application/json"
    );
  }

  function downloadCSV() {
    download("priam_books.csv", toCSV(books), "text/csv");
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={styles.logoBox}>📚</div>
          <div>
            <div style={{ fontWeight: 700 }}>PRIAM Mobile Library</div>
            <div style={{ fontSize: 12, color: "#555" }}>
              Browse · Request · Deliver
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={backupAll}>Backup</button>
          <button onClick={downloadCSV}>Export CSV</button>
          <button onClick={() => fileRef.current?.click()}>Import CSV</button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={e => importCSV(e.target.files?.[0])}
          />
        </div>
      </header>

      <nav style={styles.tabs}>
        {["catalog", "requests", "members", "settings"].map(k => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={tab === k ? styles.tabActive : styles.tab}
          >
            {k[0].toUpperCase() + k.slice(1)}
          </button>
        ))}
      </nav>

      <main style={styles.main}>
        {/* Catalog tab */}
        {tab === "catalog" && (
          <section>
            <Card title="Books" action={<AddBook onSave={addBook} />}>
              <div style={styles.filters}>
                <input
                  placeholder="Search by title, author, ISBN…"
                  value={q}
                  onChange={e => setQ(e.target.value)}
                />
                <select value={cat} onChange={e => setCat(e.target.value)}>
                  {categories.map(c => (
                    <option key={c} value={c}>
                      {c === "all" ? "All categories" : c}
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ width: "40%" }}>Title</th>
                      <th>Author</th>
                      <th>Category</th>
                      <th>Year</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(b => (
                      <tr key={b.id} style={!b.available ? { opacity: 0.8 } : undefined}>
                        <td>
                          <b>{b.title}</b>
                        </td>
                        <td>{b.author || "—"}</td>
                        <td>{b.category || "—"}</td>
                        <td>{b.year || "—"}</td>
                        <td>
                          {b.available
                            ? "Available"
                            : `Issued${
                                b.dueDate
                                  ? " (Due " + new Date(b.dueDate).toLocaleDateString() + ")"
                                  : ""
                              }`}
                        </td>
                        <td>
                          <RequestButton
                            book={b}
                            onRequest={requestBook}
                            disabled={!b.available}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {overdue.length > 0 && (
                <div style={{ color: "#b00020", marginTop: 8 }}>
                  {overdue.length} book(s) overdue.
                </div>
              )}
            </Card>
          </section>
        )}

        {/* Requests tab */}
        {tab === "requests" && (
          <Card title="Borrow Requests">
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th>Book</th>
                    <th>Member</th>
                    <th>Requested</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map(r => {
                    const b = books.find(x => x.id === r.bookId);
                    return (
                      <tr key={r.id}>
                        <td>
                          <b>{b?.title || "Unknown"}</b>
                        </td>
                        <td>
                          {r.memberName}
                          {r.phone ? ` · ${r.phone}` : ""}
                          {r.address ? ` · ${r.address}` : ""}
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {new Date(r.requestedAt).toLocaleString()}
                        </td>
                        <td style={{ textTransform: "capitalize" }}>{r.status}</td>
                        <td>
                          {r.status === "pending" && (
                            <button onClick={() => approve(r)}>Approve</button>
                          )}
                          {r.status === "approved" && (
                            <button onClick={() => markDelivered(r)}>Delivered</button>
                          )}
                          {(r.status === "approved" || r.status === "delivered") && (
                            <button onClick={() => markReturned(r)}>Returned</button>
                          )}
                          {r.status === "pending" && (
                            <button onClick={() => cancelReq(r)}>Cancel</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Members tab */}
        {tab === "members" && (
          <MembersCard members={members} setMembers={setMembers} />
        )}

        {/* Settings tab */}
        {tab === "settings" && (
          <Card title="Settings & Help">
            <ul style={{ lineHeight: 1.7 }}>
              <li>
                Export the catalog as CSV and share via WhatsApp so members can search.
              </li>
              <li>
                CSV header format: <code>title,author,category,year,isbn</code>
              </li>
              <li>
                Use Backup to download <code>priam_backup.json</code> (books, members,
                requests).
              </li>
            </ul>
          </Card>
        )}
      </main>
    </div>
  );
}

/* ---------- Supporting Components ---------- */
function AddBook({ onSave }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    title: "",
    author: "",
    category: "",
    year: "",
    isbn: "",
  });
  return (
    <>
      <button onClick={() => setOpen(true)}>Add book</button>
      {open && (
        <Modal
          title="Add a new book"
          onClose={() => setOpen(false)}
          onPrimary={() => {
            onSave(f);
            setOpen(false);
            setF({ title: "", author: "", category: "", year: "", isbn: "" });
          }}
        >
          <Field label="Title" value={f.title} onChange={v => setF({ ...f, title: v })} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field
              label="Author"
              value={f.author}
              onChange={v => setF({ ...f, author: v })}
            />
            <Field
              label="Category"
              value={f.category}
              onChange={v => setF({ ...f, category: v })}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="Year" value={f.year} onChange={v => setF({ ...f, year: v })} />
            <Field label="ISBN" value={f.isbn} onChange={v => setF({ ...f, isbn: v })} />
          </div>
        </Modal>
      )}
    </>
  );
}

function RequestButton({ book, onRequest, disabled }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  if (disabled) return <button disabled>Request</button>;

  return (
    <>
      <button onClick={() => setOpen(true)}>Request</button>
      {open && (
        <Modal
          title={`Request: ${book.title}`}
          onClose={() => setOpen(false)}
          onPrimary={() => {
            if (!name.trim()) {
              alert("Member name required");
              return;
            }
            onRequest(book, {
              name: name.trim(),
              phone: phone.trim(),
              address: address.trim(),
            });
            setOpen(false);
            setName("");
            setPhone("");
            setAddress("");
          }}
        >
          <Field label="Member name" value={name} onChange={setName} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="Phone (optional)" value={phone} onChange={setPhone} />
            <Field label="Address (optional)" value={address} onChange={setAddress} />
          </div>
          <p style={{ fontSize: 12, color: "#555" }}>
            You can call to confirm delivery after approving.
          </p>
        </Modal>
      )}
    </>
  );
}

function MembersCard({ members, setMembers }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [f, setF] = useState({ name: "", phone: "", address: "" });

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return members.filter(
      m =>
        !t ||
        `${m.name} ${m.phone || ""} ${m.address || ""}`.toLowerCase().includes(t)
    );
  }, [members, q]);

  function add() {
    if (!f.name.trim()) {
      alert("Name required");
      return;
    }
    setMembers(v => [
      { id: uuid(), name: f.name.trim(), phone: f.phone.trim(), address: f.address.trim() },
      ...v,
    ]);
    setOpen(false);
    setF({ name: "", phone: "", address: "" });
  }

  return (
    <Card title="Members" action={<button onClick={() => setOpen(true)}>Add member</button>}>
      <input
        placeholder="Search members..."
        value={q}
        onChange={e => setQ(e.target.value)}
        style={{ marginBottom: 8, width: "100%" }}
      />
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Address</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>{m.phone || "—"}</td>
                <td>{m.address || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal title="Add Member" onClose={() => setOpen(false)} onPrimary={add}>
          <Field label="Name" value={f.name} onChange={v => setF({ ...f, name: v })} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="Phone" value={f.phone} onChange={v => setF({ ...f, phone: v })} />
            <Field
              label="Address"
              value={f.address}
              onChange={v => setF({ ...f, address: v })}
            />
          </div>
        </Modal>
      )}
    </Card>
  );
}

/* ---------- Reusable UI components ---------- */
function Card({ title, action, children }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHead}>
        <h3>{title}</h3>
        {action}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Modal({ title, children, onClose, onPrimary }) {
  return (
    <div style={styles.modalBack}>
      <div style={styles.modalBox}>
        <h3>{title}</h3>
        <div style={{ margin: "12px 0" }}>{children}</div>
        <div style={{ textAlign: "right", marginTop: 8 }}>
          <button onClick={onClose} style={{ marginRight: 8 }}>
            Cancel
          </button>
          <button onClick={onPrimary}>Save</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <label style={{ display: "block", marginBottom: 8 }}>
      <div style={{ fontSize: 13, marginBottom: 2 }}>{label}</div>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "6px 8px",
          borderRadius: 6,
          border: "1px solid #ccc",
        }}
      />
    </label>
  );
}

/* ---------- Styles ---------- */
const styles = {
  page: { fontFamily: "system-ui, sans-serif", padding: 16, background: "#fafafa" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  logoBox: {
    background: "#0078d4",
    color: "white",
    fontSize: 24,
    width: 40,
    height: 40,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  tabs: { display: "flex", gap: 8, marginBottom: 16 },
  tab: { padding: "6px 10px", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer" },
  tabActive: { padding: "6px 10px", background: "#e5f0ff", border: "1px solid #7aa7ff", borderRadius: 8 },
  main: { maxWidth: 980, margin: "0 auto", padding: 16 },
  card: {
    border: "1px solid #ddd",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },
  cardHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  filters: { display: "grid", gridTemplateColumns: "1fr 240px", gap: 8, marginBottom: 12 },
  tableWrap: { border: "1px solid #ddd", borderRadius: 12, overflow: "hidden" },
  table: { width: "100%", borderCollapse: "collapse" },
  modalBack: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.3)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBox: { background: "white", padding: 20, borderRadius: 12, width: 400, maxWidth: "90%" },
};
