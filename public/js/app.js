(() => {
  const tokenKey = "studentOnTrack.token";
  const page = document.body.dataset.page;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const token = () => localStorage.getItem(tokenKey);

  async function api(url, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    if (token()) headers.Authorization = `Bearer ${token()}`;
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      localStorage.removeItem(tokenKey);
      if (page !== "signin" && page !== "home") location.href = "signin.html";
      throw new Error("Please sign in again.");
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  function toast(message) {
    let el = $("#toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      Object.assign(el.style, {
        position: "fixed",
        right: "20px",
        bottom: "20px",
        background: "#202124",
        color: "#fff",
        padding: "11px 14px",
        borderRadius: "8px",
        zIndex: "99",
        fontSize: "14px",
        boxShadow: "0 8px 25px rgba(0,0,0,.18)",
      });
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.hidden = false;
    clearTimeout(window.__toast);
    window.__toast = setTimeout(() => (el.hidden = true), 2200);
  }
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        })[c],
    );
function date(value) {
  if (!value) return "—";

  const raw = String(value);

  // Plain PostgreSQL date: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);

    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    return `${months[month - 1]} ${day}, ${year}`;
  }

  // PostgreSQL DATE serialized by Node as an ISO timestamp.
  // Convert it back to the user's local calendar date.
  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    return "Invalid date";
  }

  return parsed.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

  function days(value) {
  if (!value) return null;

  const raw = String(value);

  let target;

  // Plain YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);
    target = new Date(year, month - 1, day);
  } else {
    // ISO timestamp returned by the API
    target = new Date(raw);

    if (Number.isNaN(target.getTime())) {
      return null;
    }
  }

  const today = new Date();

  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  return Math.round(
    (target.getTime() - today.getTime()) / 86400000
  );
}

  function guard() {
    const publicPage = page === "home" || page === "signin";
    if (!publicPage && !token()) {
      location.replace("signin.html");
      return false;
    }
    if (page === "signin" && token()) {
      location.replace("dashboard.html");
      return false;
    }
    return true;
  }

  function nav() {
    $$("[data-nav]").forEach((a) =>
      a.classList.toggle("active", a.dataset.nav === page),
    );
    $("#signout")?.addEventListener("click", () => {
      localStorage.removeItem(tokenKey);
      location.href = "signin.html";
    });
  }

  async function authPage() {
    const signForm = $("#signForm"),
      registerForm = $("#registerForm");
    if (!signForm) return;
    const signTab = $("#signTab"),
      registerTab = $("#registerTab");
    const setMode = (register) => {
      signForm.hidden = register;
      registerForm.hidden = !register;
      signTab.classList.toggle("active", !register);
      registerTab.classList.toggle("active", register);
    };
    signTab.onclick = () => setMode(false);
    registerTab.onclick = () => setMode(true);
    signForm.onsubmit = async (e) => {
      e.preventDefault();
      $("#signError").textContent = "";
      try {
        const data = await api("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: $("#signEmail").value.trim(),
            password: $("#signPassword").value,
          }),
        });
        localStorage.setItem(tokenKey, data.token);
        location.href = "dashboard.html";
      } catch (err) {
        $("#signError").textContent = err.message;
      }
    };
    registerForm.onsubmit = async (e) => {
      e.preventDefault();
      $("#registerError").textContent = "";
      if ($("#regPassword").value !== $("#regConfirm").value) {
        $("#registerError").textContent = "Passwords do not match.";
        return;
      }
      try {
        const data = await api("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({
            email: $("#regEmail").value.trim(),
            password: $("#regPassword").value,
          }),
        });
        localStorage.setItem(tokenKey, data.token);
        location.href = "dashboard.html";
      } catch (err) {
        $("#registerError").textContent = err.message;
      }
    };
  }

  async function dashboard() {
    if (!$("#dashboard")) return;

    try {
      const [me, summary, assignments, goals, attendance] = await Promise.all([
        api("/api/me"),
        api("/api/summary"),
        api("/api/assignments"),
        api("/api/goals"),
        api("/api/attendance"),
      ]);

      /* --------------------------------
           ACCOUNT
        -------------------------------- */

      $("#accountEmail").textContent = me.email;

      /* --------------------------------
           DATE
        -------------------------------- */

      const today = new Date();

      $("#dashboardDate").textContent = today.toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
      });

      /* --------------------------------
           GREETING
        -------------------------------- */

      const hour = today.getHours();

      let greeting = "Good evening";

      if (hour < 12) {
        greeting = "Good morning";
      } else if (hour < 18) {
        greeting = "Good afternoon";
      }

      $("#dashboardGreeting").textContent = greeting;

      /* --------------------------------
           ASSIGNMENT STATISTICS
        -------------------------------- */

      const totalAssignments = assignments.length;

      const completedAssignments = assignments.filter(
        (a) => a.completed,
      ).length;

      const overdueAssignments = assignments.filter(
        (a) => !a.completed && a.due_date && days(a.due_date) < 0,
      ).length;

      const dueSoonAssignments = assignments.filter(
        (a) =>
          !a.completed &&
          a.due_date &&
          days(a.due_date) >= 0 &&
          days(a.due_date) <= 7,
      ).length;

      const openAssignments = totalAssignments - completedAssignments;

      $("#aTotal").textContent = totalAssignments;

      $("#aDone").textContent = completedAssignments;

      $("#aDue").textContent = dueSoonAssignments;

      $("#aOver").textContent = overdueAssignments;

      /* --------------------------------
           ACCOUNTABILITY
        -------------------------------- */

      const completionPercentage =
        totalAssignments > 0
          ? Math.round((completedAssignments / totalAssignments) * 100)
          : 0;

      $("#accountabilityPercentage").textContent = `${completionPercentage}%`;

      $("#accountabilityBar").style.width = `${completionPercentage}%`;

      if (totalAssignments === 0) {
        $("#accountabilityText").textContent = "No assignments tracked yet.";
      } else {
        $("#accountabilityText").textContent =
          `${completedAssignments} of ${totalAssignments} assignments completed.`;
      }

      $("#breakdownCompleted").textContent = completedAssignments;

      $("#breakdownOpen").textContent = openAssignments;

      $("#breakdownOverdue").textContent = overdueAssignments;

      /* --------------------------------
           ATTENDANCE
        -------------------------------- */

      const subjectCount = attendance.length;

      let attendanceAverage = 0;

      if (subjectCount > 0) {
        const percentages = attendance.map((subject) => {
          if (!subject.total) {
            return 0;
          }

          return (Number(subject.attended) / Number(subject.total)) * 100;
        });

        attendanceAverage = Math.round(
          percentages.reduce((sum, value) => sum + value, 0) /
            percentages.length,
        );
      }

      const atRisk = attendance.filter(
        (subject) =>
          subject.total > 0 &&
          Number(subject.attended) / Number(subject.total) < 0.75,
      ).length;

      $("#attAvg").textContent = `${attendanceAverage}%`;

      $("#attSubjects").textContent = subjectCount;

      $("#attRisk").textContent = atRisk;

      const attendanceStatus = $("#attendanceStatus");

      const attendanceMessage = $("#attendanceMessage");

      attendanceStatus.className = "badge";

      if (subjectCount === 0) {
        attendanceStatus.classList.add("badge-neutral");

        attendanceStatus.textContent = "No data";

        attendanceMessage.textContent =
          "Add your subjects to start tracking attendance.";
      } else if (attendanceAverage < 75) {
        attendanceStatus.classList.add("badge-danger");

        attendanceStatus.textContent = "Needs attention";

        attendanceMessage.textContent = `${atRisk} subject${atRisk === 1 ? "" : "s"} currently below 75%.`;
      } else {
        attendanceStatus.classList.add("badge-success");

        attendanceStatus.textContent = "On track";

        attendanceMessage.textContent =
          "Your average attendance is currently above 75%.";
      }

      /* --------------------------------
           NEXT COMMITMENTS
        -------------------------------- */

      const commitmentContainer = $("#nextCommitments");

      const upcoming = assignments
        .filter((a) => !a.completed)
        .sort((a, b) => {
          if (!a.due_date) return 1;

          if (!b.due_date) return -1;

          return new Date(a.due_date) - new Date(b.due_date);
        })
        .slice(0, 5);

      if (!upcoming.length) {
        commitmentContainer.innerHTML = `
                <div class="empty">
                    ${
                      totalAssignments === 0
                        ? `
                            No upcoming commitments yet.
                            <br>
                            Add your first assignment to start building your tracker.
                          `
                        : `
                            All your assignments are complete.
                            <br>
                            Nice work — nothing is currently waiting on you.
                          `
                    }
                </div>
            `;
      } else {
        commitmentContainer.innerHTML = `<div class="commitment-list">
                    ${upcoming
                      .map((assignment) => {
                        const d = days(assignment.due_date);

                        let statusText = "Open";

                        let statusClass = "badge-neutral";

                        if (d === null) {
                          statusText = "No deadline";
                        } else if (d < 0) {
                          statusText = "Overdue";

                          statusClass = "badge-danger";
                        } else if (d === 0) {
                          statusText = "Due today";

                          statusClass = "badge-warning";
                        } else if (d <= 7) {
                          statusText = "Due soon";

                          statusClass = "badge-warning";
                        }

                        return `
                                <div class="commitment-row">

                                    <div class="commitment-info">

                                        <div class="commitment-title">
                                            ${esc(assignment.title)}
                                        </div>

                                        <div class="subtle">
                                            ${
                                              esc(assignment.subject) ||
                                              "No subject"
                                            }
                                            ${
                                              assignment.due_date
                                                ? ` · Due ${date(
                                                    assignment.due_date,
                                                  )}`
                                                : ""
                                            }
                                        </div>

                                    </div>


                                    <div class="commitment-actions">

                                        <span
                                            class="badge ${statusClass}"
                                        >
                                            ${statusText}
                                        </span>

                                        <button
                                            class="btn btn-small"
                                            data-dashboard-complete="${assignment.id}"
                                        >
                                            Mark done
                                        </button>

                                    </div>

                                </div>
                            `;
                      })
                      .join("")}
                </div>`;
      }

      /* --------------------------------
           COMMITMENT BUTTONS
        -------------------------------- */

      $$("[data-dashboard-complete]").forEach((button) => {
        button.addEventListener("click", async () => {
          try {
            await api(`/api/assignments/${button.dataset.dashboardComplete}`, {
              method: "PATCH",
              body: JSON.stringify({
                completed: true,
              }),
            });

            toast("Assignment marked complete");

            await dashboard();
          } catch (error) {
            toast(error.message);
          }
        });
      });

      /* --------------------------------
           GOALS
        -------------------------------- */

      const goalContainer = $("#dashboardGoals");

      const activeGoals = goals.filter((goal) => !goal.completed).slice(0, 3);

      if (!activeGoals.length) {
        goalContainer.innerHTML = `
                <div class="empty">
                    ${
                      goals.length
                        ? `
                                All your current goals are complete.
                                <br>
                                Excellent work.
                              `
                        : `
                                No goals yet.
                                <br>
                                Create your first goal to start tracking progress.
                              `
                    }
                </div>
            `;
      } else {
        goalContainer.innerHTML = `<div class="goal-dashboard-list">
                    ${activeGoals
                      .map((goal) => {
                        const target = Number(goal.target);

                        const current = Number(goal.current);

                        const percentage =
                          target > 0
                            ? Math.min(
                                100,
                                Math.round((current / target) * 100),
                              )
                            : 0;

                        return `
                                <div class="goal-dashboard-row">

                                    <div class="goal-dashboard-top">

                                        <div>
                                            <strong>
                                                ${esc(goal.title)}
                                            </strong>

                                            <div class="subtle">
                                                ${current}
                                                /
                                                ${target}
                                                ${esc(goal.unit) || ""}
                                            </div>
                                        </div>

                                        <strong>
                                            ${percentage}%
                                        </strong>

                                    </div>


                                    <div class="progress">
                                        <span
                                            style="width:${percentage}%"
                                        ></span>
                                    </div>

                                </div>
                            `;
                      })
                      .join("")}
                </div>`;
      }
    } catch (error) {
      toast(error.message);
    }
  }

  async function assignments() {
    const form = $("#assignmentForm");
    if (!form) return;
    let items = [];
    const render = () => {
      $("#aTotal").textContent = items.length;
      $("#aDone").textContent = items.filter((x) => x.completed).length;
      $("#aDue").textContent = items.filter(
        (x) => !x.completed && days(x.due_date) >= 0 && days(x.due_date) <= 7,
      ).length;
      $("#aOver").textContent = items.filter(
        (x) => !x.completed && days(x.due_date) < 0,
      ).length;
      const list = $("#assignmentList");
      if (!items.length) {
        list.innerHTML =
          '<div class="empty">No assignments yet. Add your first one above.</div>';
        return;
      }
      list.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Done</th><th>Assignment</th><th>Subject</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead><tbody>${items
        .map((x) => {
          const d = days(x.due_date);
          let badge = x.completed
            ? '<span class="badge badge-success">Completed</span>'
            : d === null
              ? '<span class="badge badge-neutral">No deadline</span>'
              : d < 0
                ? '<span class="badge badge-danger">Overdue</span>'
                : d === 0
                  ? '<span class="badge badge-warning">Due today</span>'
                  : d <= 7
                    ? '<span class="badge badge-warning">Due soon</span>'
                    : '<span class="badge badge-neutral">Open</span>';
          return `<tr>
  <td>
    ${
      x.completed
        ? '<span class="badge badge-success">Completed</span>'
        : `<input class="checkbox" type="checkbox" data-toggle="${x.id}">`
    }
  </td>

  <td><strong>${esc(x.title)}</strong></td>

  <td>${esc(x.subject) || "—"}</td>

  <td>${date(x.due_date)}</td>

  <td>${badge}</td>

  <td>
    <div class="actions">
      ${
        x.completed
          ? ""
          : `<button class="btn btn-small" data-edit="${x.id}">Edit</button>`
      }

      <button
        class="btn btn-small btn-danger"
        data-delete="${x.id}"
      >
        Delete
      </button>
    </div>
  </td>
</tr>`;
        })
        .join("")}</tbody></table></div>`;
$$("[data-toggle]").forEach((b) => {
  b.addEventListener("change", async () => {
    const assignmentId = b.dataset.toggle;
    const completed = b.checked;

    try {
      await api(`/api/assignments/${assignmentId}`, {
        method: "PATCH",
        body: JSON.stringify({
          completed: completed,
        }),
      });

      await load();

      toast(
        completed
          ? "Assignment completed"
          : "Assignment marked as incomplete",
      );
    } catch (err) {
      console.error("Assignment completion error:", err);

      // Put checkbox back if server update failed
      b.checked = !completed;

      toast(err.message || "Could not update assignment.");
    }
  });
});
      $$("[data-delete]").forEach(
        (b) =>
          (b.onclick = async () => {
            if (confirm("Delete this assignment?")) {
              await api(`/api/assignments/${b.dataset.delete}`, {
                method: "DELETE",
              });
              await load();
              toast("Assignment deleted");
            }
          }),
      );
      $$("[data-edit]").forEach(
        (b) =>
          (b.onclick = async () => {
            const x = items.find(
              (v) => String(v.id) === String(b.dataset.edit),
            );
            if (!x) return;
            const title = prompt("Assignment title", x.title);
            if (title === null) return;
            const subject = prompt("Subject", x.subject || "");
            if (subject === null) return;
            const due = prompt(
              "Due date (YYYY-MM-DD, leave blank for none)",
              x.due_date || "",
            );
            if (due === null) return;
            await update(x.id, { title, subject, due_date: due });
          }),
      );
    };
    const load = async () => {
      items = await api("/api/assignments");
      render();
    };
    const update = async (id, body) => {
      await api(`/api/assignments/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await load();
      toast("Assignment updated");
    };
    form.onsubmit = async (e) => {
      e.preventDefault();

      try {
        const title = $("#title").value.trim();
        const subject = $("#subject").value.trim();
        const due = $("#due").value;

        if (!title) {
          toast("Please enter an assignment title.");
          return;
        }

        await api("/api/assignments", {
          method: "POST",
          body: JSON.stringify({
            title: title,
            subject: subject || null,
            due_date: due || null,
          }),
        });

        form.reset();

        await load();

        toast("Assignment added");
      } catch (err) {
        console.error("Assignment error:", err);
        toast(err.message || "Could not add assignment.");
      }
    };
    $("#due").min = new Date().toISOString().slice(0, 10);
    await load();
  }

  async function attendance() {
    const form = $("#attendanceForm");
    if (!form) return;
    let items = [];
    const render = () => {
      $("#subjects").textContent = items.length;
      const avg = items.length
        ? Math.round(
            items.reduce(
              (s, x) => s + (x.total ? (x.attended / x.total) * 100 : 0),
              0,
            ) / items.length,
          )
        : 0;
      $("#average").textContent = avg + "%";
      $("#risk").textContent = items.filter(
        (x) => x.total && x.attended / x.total < 0.75,
      ).length;
      const list = $("#attendanceList");
      if (!items.length) {
        list.innerHTML =
          '<div class="empty">No subjects yet. Add one to start tracking attendance.</div>';
        return;
      }
      list.innerHTML = items
        .map((x) => {
          const p = x.total ? Math.round((x.attended / x.total) * 100) : 0,
            risk = p < 75;
          return `<div class="list-row"><div class="kpi-line"><div><strong>${esc(x.subject)}</strong><div class="subtle">${x.attended} attended · ${x.total} total</div></div><span class="badge ${risk ? "badge-danger" : "badge-success"}">${risk ? "At risk" : "Safe"}</span></div><div class="progress ${risk ? "" : "success"}"><span style="width:${Math.min(p, 100)}%"></span></div><div class="kpi-line"><span class="subtle">${p}% attendance</span><div class="actions"><button class="btn btn-small" data-attend="${x.id}">Attend +1</button><button class="btn btn-small" data-absent="${x.id}">Absent +1</button><button class="btn btn-small" data-edit="${x.id}">Edit</button><button class="btn btn-small btn-danger" data-delete="${x.id}">Delete</button></div></div></div>`;
        })
        .join("");
      $$("[data-attend]").forEach(
        (b) =>
          (b.onclick = async () => {
            await api(`/api/attendance/${b.dataset.attend}/attend`, {
              method: "POST",
            });
            await load();
            toast("Attendance recorded");
          }),
      );
      $$("[data-absent]").forEach(
        (b) =>
          (b.onclick = async () => {
            await api(`/api/attendance/${b.dataset.absent}/absent`, {
              method: "POST",
            });
            await load();
            toast("Absence recorded");
          }),
      );
      $$("[data-delete]").forEach(
        (b) =>
          (b.onclick = async () => {
            if (confirm("Delete this subject?")) {
              await api(`/api/attendance/${b.dataset.delete}`, {
                method: "DELETE",
              });
              await load();
              toast("Subject deleted");
            }
          }),
      );
      $$("[data-edit]").forEach(
        (b) =>
          (b.onclick = async () => {
            const x = items.find(
              (v) => String(v.id) === String(b.dataset.edit),
            );
            const subject = prompt("Subject", x.subject);
            if (subject === null) return;
            const attended = prompt("Classes attended", x.attended);
            if (attended === null) return;
            const total = prompt("Total classes", x.total);
            if (total === null) return;
            await api(`/api/attendance/${x.id}`, {
              method: "PATCH",
              body: JSON.stringify({
                subject,
                attended: Number(attended),
                total: Number(total),
              }),
            });
            await load();
            toast("Attendance updated");
          }),
      );
    };
    const load = async () => {
      items = await api("/api/attendance");
      render();
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api("/api/attendance", {
          method: "POST",
          body: JSON.stringify({
            subject: $("#attSubject").value,
            attended: Number($("#attended").value || 0),
            total: Number($("#total").value || 0),
          }),
        });
        form.reset();
        await load();
        toast("Subject added");
      } catch (err) {
        toast(err.message);
      }
    };
    await load();
  }

  async function goals() {
    const form = $("#goalForm");
    if (!form) return;
    let items = [];
    const render = () => {
      $("#goalCount").textContent = items.filter((x) => !x.completed).length;
      const done = items.filter((x) => x.completed).length;
      $("#goalDone").textContent = done;
      const list = $("#goalList");
      if (!items.length) {
        list.innerHTML =
          '<div class="empty">No goals yet. Add a goal and start making progress.</div>';
        return;
      }
      list.innerHTML = items
        .map((x) => {
          const p = Math.min(
            100,
            Math.round((Number(x.current) / Number(x.target)) * 100),
          );
          return `<div class="list-row"><div class="kpi-line"><div><strong>${esc(x.title)}</strong><div class="subtle">${esc(x.category) || "Personal"} · ${x.current}/${x.target} ${esc(x.unit) || ""}${x.deadline ? " · Due " + date(x.deadline) : ""}</div></div><span class="badge ${
  x.completed
    ? "badge-success"
    : days(x.deadline) !== null && days(x.deadline) < 0
      ? "badge-danger"
      : "badge-neutral"
}">
  ${
    x.completed
      ? "Completed"
      : days(x.deadline) !== null && days(x.deadline) < 0
        ? "Overdue"
        : p + "%"
  }
</span></div><div class="progress ${x.completed ? "success" : ""}"><span style="width:${p}%"></span></div><div class="actions">
  ${
    x.completed
      ? ""
      : `
        <button class="btn btn-small" data-plus="${x.id}">
          +1
        </button>

        <button class="btn btn-small" data-complete="${x.id}">
          Complete
        </button>

        <button class="btn btn-small" data-edit="${x.id}">
          Edit
        </button>
      `
  }

  <button
    class="btn btn-small btn-danger"
    data-delete="${x.id}"
  >
    Delete
  </button>
</div></div>`;
        })
        .join("");
      $$("[data-plus]").forEach(
        (b) =>
          (b.onclick = async () => {
            try {
              const x = items.find(
                (v) => String(v.id) === String(b.dataset.plus),
              );

              if (!x) return;

              const current = Math.min(Number(x.target), Number(x.current) + 1);

              await api(`/api/goals/${x.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                  current: current,
                  completed: current >= Number(x.target),
                }),
              });

              await load();

              toast("Progress updated");
            } catch (err) {
              console.error(err);
              toast(err.message || "Could not update progress.");
            }
          }),
      );
      $$("[data-complete]").forEach(
  (b) =>
    (b.onclick = async () => {
      try {
        const x = items.find(
          (v) => String(v.id) === String(b.dataset.complete),
        );

        if (!x) return;

        await api(`/api/goals/${x.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            current: Number(x.target),
            completed: true,
          }),
        });

        await load();

        toast("Goal completed");
      } catch (err) {
        console.error(err);
        toast(err.message || "Could not complete goal.");
      }
    }),
);
      $$("[data-delete]").forEach(
        (b) =>
          (b.onclick = async () => {
            if (confirm("Delete this goal?")) {
              await api(`/api/goals/${b.dataset.delete}`, { method: "DELETE" });
              await load();
              toast("Goal deleted");
            }
          }),
      );
      $$("[data-edit]").forEach(
        (b) =>
          (b.onclick = async () => {
            const x = items.find(
              (v) => String(v.id) === String(b.dataset.edit),
            );
            if (!x) return;
            const title = prompt("Goal title", x.title);
            if (title === null) return;
            const target = prompt("Target", x.target);
            if (target === null) return;
            const current = prompt("Current progress", x.current);
            if (current === null) return;
            await saveGoal({
              ...x,
              title,
              target: Number(target),
              current: Number(current),
              completed: Number(current) >= Number(target),
            });
            toast("Goal updated");
          }),
      );
    };
    const load = async () => {
      items = await api("/api/goals");
      render();
    };
const saveGoal = async (x) => {
  let deadline = null;

  if (x.deadline) {
    const parsed = new Date(x.deadline);

    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, "0");
      const day = String(parsed.getDate()).padStart(2, "0");

      deadline = `${year}-${month}-${day}`;
    }
  }

  await api(`/api/goals/${x.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: x.title,
      category: x.category,
      unit: x.unit,
      target: Number(x.target),
      current: Number(x.current),
      deadline: deadline,
      completed: Boolean(x.completed),
    }),
  });

  await load();
};
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api("/api/goals", {
          method: "POST",
          body: JSON.stringify({
            title: $("#goalTitle").value,
            category: $("#goalCategory").value,
            unit: $("#goalUnit").value,
            target: Number($("#goalTarget").value),
            current: Number($("#goalCurrent").value || 0),
            deadline: $("#goalDeadline").value || null,
          }),
        });
        form.reset();
        await load();
        toast("Goal added");
      } catch (err) {
        toast(err.message);
      }
    };
    await load();
  }

  if (!guard()) return;
  nav();
  if (page === "signin") authPage();
  if (page === "dashboard") dashboard();
  if (page === "assignments") assignments();
  if (page === "attendance") attendance();
  if (page === "goals") goals();
})();
