const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;

if (!process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_USER || !process.env.DB_PASSWORD || !JWT_SECRET)  {
  console.warn("Missing DATABASE_URL or JWT_SECRET. Copy .env.example to .env and configure it.");
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Sign in required." });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Session expired. Please sign in again." });
  }
}

function tokenFor(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
}

function validId(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

app.post("/api/auth/register", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!email || !email.includes("@")) return res.status(400).json({ error: "Enter a valid email address." });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });

    const exists = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
    if (exists.rowCount) return res.status(409).json({ error: "An account with that email already exists." });

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      "INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id,email,created_at",
      [email, hash]
    );
    const user = result.rows[0];
    res.status(201).json({ token: tokenFor(user), user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to create the account." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const result = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }
    res.json({
      token: tokenFor(user),
      user: { id: user.id, email: user.email, created_at: user.created_at }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Unable to sign in." });
  }
});

app.get("/api/me", auth, async (req, res) => {
  const result = await pool.query("SELECT id,email,created_at FROM users WHERE id=$1", [req.user.id]);
  if (!result.rowCount) return res.status(401).json({ error: "Account not found." });
  res.json(result.rows[0]);
});

app.get("/api/summary", auth, async (req, res) => {
  const [a, at, g] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE completed)::int AS completed, COUNT(*) FILTER (WHERE NOT completed AND due_date < CURRENT_DATE)::int AS overdue, COUNT(*) FILTER (WHERE NOT completed AND due_date >= CURRENT_DATE AND due_date <= CURRENT_DATE + 7)::int AS due_soon FROM assignments WHERE user_id=$1", [req.user.id]),
    pool.query("SELECT COUNT(*)::int AS subjects, COALESCE(ROUND(AVG(CASE WHEN total > 0 THEN attended::numeric/total*100 END)),0)::int AS average, COUNT(*) FILTER (WHERE total > 0 AND attended::numeric/total < 0.75)::int AS at_risk FROM attendance WHERE user_id=$1", [req.user.id]),
    pool.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE completed OR current >= target)::int AS completed FROM goals WHERE user_id=$1", [req.user.id])
  ]);
  res.json({ assignments: a.rows[0], attendance: at.rows[0], goals: g.rows[0] });
});

app.get("/api/assignments", auth, async (req, res) => {
  const result = await pool.query(
    "SELECT id,title,subject,due_date,completed,created_at,updated_at FROM assignments WHERE user_id=$1 ORDER BY completed ASC, due_date ASC NULLS LAST, created_at DESC",
    [req.user.id]
  );
  res.json(result.rows);
});

app.post("/api/assignments", auth, async (req, res) => {
  const title = String(req.body.title || "").trim();
  const subject = String(req.body.subject || "").trim() || null;
  const dueDate = req.body.due_date || null;
  if (!title) return res.status(400).json({ error: "Assignment title is required." });
  const result = await pool.query(
    "INSERT INTO assignments(user_id,title,subject,due_date) VALUES($1,$2,$3,$4) RETURNING *",
    [req.user.id, title, subject, dueDate]
  );
  res.status(201).json(result.rows[0]);
});

app.patch("/api/assignments/:id", auth, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid assignment." });
  const fields = [];
  const values = [];
  let i = 1;
  if (req.body.title !== undefined) { fields.push(`title=$${i++}`); values.push(String(req.body.title).trim()); }
  if (req.body.subject !== undefined) { fields.push(`subject=$${i++}`); values.push(String(req.body.subject).trim() || null); }
  if (req.body.due_date !== undefined) { fields.push(`due_date=$${i++}`); values.push(req.body.due_date || null); }
  if (req.body.completed !== undefined) { fields.push(`completed=$${i++}`); values.push(Boolean(req.body.completed)); }
  if (!fields.length) return res.status(400).json({ error: "Nothing to update." });
  fields.push("updated_at=NOW()");
  values.push(req.params.id, req.user.id);
  const result = await pool.query(
    `UPDATE assignments SET ${fields.join(",")} WHERE id=$${i} AND user_id=$${i+1} RETURNING *`,
    values
  );
  if (!result.rowCount) return res.status(404).json({ error: "Assignment not found." });
  res.json(result.rows[0]);
});

app.delete("/api/assignments/:id", auth, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid assignment." });
  const result = await pool.query("DELETE FROM assignments WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Assignment not found." });
  res.status(204).end();
});

app.get("/api/attendance", auth, async (req, res) => {
  const result = await pool.query(
    "SELECT id,subject,attended,total,created_at,updated_at FROM attendance WHERE user_id=$1 ORDER BY subject ASC",
    [req.user.id]
  );
  res.json(result.rows);
});

app.post("/api/attendance", auth, async (req, res) => {
  const subject = String(req.body.subject || "").trim();
  const attended = Number(req.body.attended ?? 0);
  const total = Number(req.body.total ?? 0);
  if (!subject) return res.status(400).json({ error: "Subject name is required." });
  if (!Number.isInteger(attended) || !Number.isInteger(total) || attended < 0 || total < attended) {
    return res.status(400).json({ error: "Attendance numbers are invalid." });
  }
  const result = await pool.query(
    "INSERT INTO attendance(user_id,subject,attended,total) VALUES($1,$2,$3,$4) RETURNING *",
    [req.user.id, subject, attended, total]
  );
  res.status(201).json(result.rows[0]);
});

app.patch("/api/attendance/:id", auth, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid subject." });
  const subject = String(req.body.subject || "").trim();
  const attended = Number(req.body.attended);
  const total = Number(req.body.total);
  if (!subject || !Number.isInteger(attended) || !Number.isInteger(total) || attended < 0 || total < attended) {
    return res.status(400).json({ error: "Attendance values are invalid." });
  }
  const result = await pool.query(
    "UPDATE attendance SET subject=$1,attended=$2,total=$3,updated_at=NOW() WHERE id=$4 AND user_id=$5 RETURNING *",
    [subject, attended, total, req.params.id, req.user.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: "Subject not found." });
  res.json(result.rows[0]);
});

app.post("/api/attendance/:id/attend", auth, async (req, res) => {
  const result = await pool.query(
    "UPDATE attendance SET attended=attended+1,total=total+1,updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *",
    [req.params.id, req.user.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: "Subject not found." });
  res.json(result.rows[0]);
});

app.post("/api/attendance/:id/absent", auth, async (req, res) => {
  const result = await pool.query(
    "UPDATE attendance SET total=total+1,updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *",
    [req.params.id, req.user.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: "Subject not found." });
  res.json(result.rows[0]);
});

app.delete("/api/attendance/:id", auth, async (req, res) => {
  const result = await pool.query("DELETE FROM attendance WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Subject not found." });
  res.status(204).end();
});

app.get("/api/goals", auth, async (req, res) => {
  const result = await pool.query(
    "SELECT id,title,category,unit,target,current,deadline,completed,created_at,updated_at FROM goals WHERE user_id=$1 ORDER BY completed ASC, deadline ASC NULLS LAST, created_at DESC",
    [req.user.id]
  );
  res.json(result.rows);
});

app.post("/api/goals", auth, async (req, res) => {
  const title = String(req.body.title || "").trim();
  const category = String(req.body.category || "").trim() || null;
  const unit = String(req.body.unit || "").trim() || null;
  const target = Number(req.body.target);
  const current = Number(req.body.current ?? 0);
  const deadline = req.body.deadline || null;
  if (!title || !Number.isFinite(target) || target <= 0 || !Number.isFinite(current) || current < 0 || current > target) {
    return res.status(400).json({ error: "Enter a valid goal and progress." });
  }
  const result = await pool.query(
    "INSERT INTO goals(user_id,title,category,unit,target,current,deadline,completed) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
    [req.user.id,title,category,unit,target,current,deadline,current >= target]
  );
  res.status(201).json(result.rows[0]);
});

app.patch("/api/goals/:id", auth, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ error: "Invalid goal." });
  const title = String(req.body.title || "").trim();
  const category = String(req.body.category || "").trim() || null;
  const unit = String(req.body.unit || "").trim() || null;
  const target = Number(req.body.target);
  const current = Number(req.body.current);
  const deadline = req.body.deadline || null;
  const completed = Boolean(req.body.completed) || current >= target;
  if (!title || !Number.isFinite(target) || target <= 0 || !Number.isFinite(current) || current < 0 || current > target) {
    return res.status(400).json({ error: "Enter valid goal values." });
  }
  const result = await pool.query(
    "UPDATE goals SET title=$1,category=$2,unit=$3,target=$4,current=$5,deadline=$6,completed=$7,updated_at=NOW() WHERE id=$8 AND user_id=$9 RETURNING *",
    [title,category,unit,target,current,deadline,completed,req.params.id,req.user.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: "Goal not found." });
  res.json(result.rows[0]);
});

app.delete("/api/goals/:id", auth, async (req, res) => {
  const result = await pool.query("DELETE FROM goals WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Goal not found." });
  res.status(204).end();
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`StudentOnTrack running at http://localhost:${PORT}`));
