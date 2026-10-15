(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    today = new Date(),
    mk = () => `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`,
    dk = () => `${mk()}-${String(today.getDate()).padStart(2, "0")}`,
    money = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(n) || 0),
    id = () => crypto.randomUUID?.() || String(Date.now() + Math.random()),
    base = { opening: { hand: 0, bank: 0 }, budget: 0, transactions: [], transfers: [] };
  let d;
  try {
    d = { ...base, ...JSON.parse(localStorage.getItem("pocketledger") || "{}") };
  } catch {
    d = { ...base };
  }
  const SUPABASE_URL = "https://fgzxsftbscylbpnafovz.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_50LLQslfQ6Ef-NilNh6dGg_utTWk_ek";
  let supabaseClient = null,
    cloudUser = null,
    cloudReady = false,
    cloudSaveTimer = null;
  try {
    if (window.supabase && SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("YOUR_") && !SUPABASE_ANON_KEY.includes("YOUR_")) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  } catch (e) {
    console.error("Supabase setup error", e);
  }
  function cloudStatus(s) {
    const el = $("cloudStatus");
    if (el) el.textContent = s;
  }
  async function cloudWrite() {
    if (!supabaseClient || !cloudUser || !cloudReady) return;
    try {
      const { error } = await supabaseClient
        .from("pocketledger_data")
        .upsert({ user_id: cloudUser.id, data: d, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;
      cloudStatus("☁ Synced to cloud · " + cloudUser.email);
    } catch (e) {
      console.error(e);
      cloudStatus("Cloud sync error: " + (e.message || "check table and RLS setup"));
    }
  }
  async function cloudLoad(user) {
    cloudUser = user;
    cloudReady = false;
    cloudStatus("Loading your cloud data…");
    try {
      const { data, error } = await supabaseClient.from("pocketledger_data").select("data").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      if (data && data.data) {
        d = { ...base, ...data.data };
        localStorage.setItem("pocketledger", JSON.stringify(d));
        render();
      } else {
        await cloudWrite();
      }
      cloudReady = true;
      cloudStatus("Signed in as " + user.email + " · cloud sync enabled");
      $("cloudLogin").hidden = true;
      $("cloudSignup").hidden = true;
      $("cloudLogout").hidden = false;
      await cloudWrite();
    } catch (e) {
      cloudReady = false;
      cloudStatus("Cloud error: " + (e.message || "check SQL/RLS setup"));
    }
  }
  function setupCloud() {
    if (!supabaseClient) {
      cloudStatus("Add your Supabase URL and publishable key in app.js to enable cloud sync.");
      return;
    }
    $("cloudSignup").onclick = async () => {
      const email = $("cloudEmail").value.trim(),
        password = $("cloudPassword").value;
      if (!email || password.length < 6) return cloudStatus("Enter a valid email and password (at least 6 characters). ");
      cloudStatus("Creating account…");
      const { data, error } = await supabaseClient.auth.signUp({ email, password });
      if (error) return cloudStatus(error.message);
      if (data.session) await cloudLoad(data.user);
      else cloudStatus("Account created. Check your email to confirm, then sign in.");
    };
    $("cloudLogin").onclick = async () => {
      const email = $("cloudEmail").value.trim(),
        password = $("cloudPassword").value;
      if (!email || !password) return cloudStatus("Enter your email and password.");
      cloudStatus("Signing in…");
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) return cloudStatus(error.message);
      await cloudLoad(data.user);
    };
    $("cloudLogout").onclick = async () => {
      await supabaseClient.auth.signOut();
      cloudUser = null;
      cloudReady = false;
      $("cloudLogin").hidden = false;
      $("cloudSignup").hidden = false;
      $("cloudLogout").hidden = true;
      cloudStatus("Signed out. Data on this device remains in your browser.");
    };
    supabaseClient.auth.getSession().then(({ data }) => {
      if (data.session) cloudLoad(data.session.user);
    });
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        cloudUser = null;
        cloudReady = false;
      }
    });
  }
  let flow, donut, report;
  const colors = ["#b6f36b", "#ff8585", "#70dfca", "#f2d16e", "#a6a0ff", "#ffae70", "#7bb6ff"];
  const safe = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function save(msg) {
    localStorage.setItem("pocketledger", JSON.stringify(d));
    render();
    if (cloudSaveTimer) clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(() => cloudWrite(), 500);
    if (msg) toast(msg);
  }
  function toast(s) {
    $("toast").textContent = s;
    $("toast").classList.add("show");
    setTimeout(() => $("toast").classList.remove("show"), 2200);
  }
  function balance() {
    let hand = +d.opening.hand || 0,
      bank = +d.opening.bank || 0;
    d.transactions.forEach((t) => {
      let v = ["income", "borrowed"].includes(t.type) ? +t.amount : -+t.amount;
      if (t.account === "bank") bank += v;
      else hand += v;
    });
    d.transfers.forEach((t) => {
      if (t.from === "hand") {
        hand -= t.amount;
        bank += t.amount;
      } else {
        bank -= t.amount;
        hand += t.amount;
      }
    });
    return { hand, bank, total: hand + bank };
  }
  function list(month = $("month").value) {
    return d.transactions.filter((t) => t.date?.slice(0, 7) === month);
  }
  function sum(a, type) {
    return a.filter((t) => t.type === type).reduce((s, t) => s + +t.amount, 0);
  }
  function yearStats(y) {
    let i = Array(12).fill(0),
      e = Array(12).fill(0);
    d.transactions
      .filter((t) => t.date?.slice(0, 4) === String(y))
      .forEach((t) => {
        let m = +t.date.slice(5, 7) - 1;
        if (t.type === "income") i[m] += +t.amount;
        if (t.type === "expense") e[m] += +t.amount;
      });
    return { i, e };
  }
  function initCharts() {
    if (!window.Chart) return;
    Chart.defaults.color = "#929b92";
    Chart.defaults.font.family = "'DM Sans',sans-serif";
    flow = new Chart($("flow"), {
      type: "bar",
      data: {
        labels: [],
        datasets: [
          { label: "Income", data: [], backgroundColor: "#b6f36b", borderRadius: 5 },
          { label: "Expenses", data: [], backgroundColor: "#ff8585", borderRadius: 5 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 7 } },
          tooltip: { callbacks: { label: (c) => c.dataset.label + ": " + money(c.raw) } },
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: "#ffffff10" }, ticks: { callback: (v) => (v >= 1000 ? "₹" + v / 1000 + "k" : "₹" + v) } },
        },
      },
    });
    donut = new Chart($("spending"), {
      type: "doughnut",
      data: { labels: [], datasets: [{ data: [], backgroundColor: colors, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: "75%", plugins: { legend: { display: false } } },
    });
    report = new Chart($("reportChart"), {
      type: "bar",
      data: {
        labels: [],
        datasets: [
          { label: "Income", data: [], backgroundColor: "#b6f36b", borderRadius: 5 },
          { label: "Expenses", data: [], backgroundColor: "#ff8585", borderRadius: 5 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 7 } } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: "#ffffff10" } } },
      },
    });
  }
  function chartUpdate() {
    if (!flow) return;
    let labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
      s = yearStats($("year").value);
    flow.data.labels = labels;
    flow.data.datasets[0].data = s.i;
    flow.data.datasets[1].data = s.e;
    flow.update();
    let ex = list().filter((t) => t.type === "expense"),
      cats = {};
    ex.forEach((t) => (cats[t.category] = (cats[t.category] || 0) + +t.amount));
    let arr = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    donut.data.labels = arr.map((x) => x[0]);
    donut.data.datasets[0].data = arr.map((x) => x[1]);
    donut.data.datasets[0].backgroundColor = arr.map((_, i) => colors[i % colors.length]);
    donut.update();
    $("donutTotal").textContent = money(sum(ex, "expense")).replace(".00", "");
    $("legend").innerHTML = arr.length
      ? arr
          .slice(0, 7)
          .map(
            ([n, v], i) =>
              `<div><i class="dot" style="background:${colors[i % colors.length]}"></i><span>${safe(n)}</span><span>${sum(ex, "expense") ? Math.round((v / sum(ex, "expense")) * 100) : 0}%</span></div>`,
          )
          .join("")
      : "<small>No spending recorded this month.</small>";
    let mode = $("comparisonMode")?.value || "monthly",
      year = +$("reportMonth").value.slice(0, 4),
      month = +$("reportMonth").value.slice(5, 7) - 1,
      ri = Array(mode === "weekly" ? 5 : 12).fill(0),
      re = Array(mode === "weekly" ? 5 : 12).fill(0),
      labs = mode === "weekly" ? ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5"] : labels;
    d.transactions.forEach((t) => {
      if (!t.date) return;
      let dt = new Date(t.date + "T12:00:00");
      if (dt.getFullYear() !== year) return;
      let idx;
      if (mode === "weekly") {
        if (dt.getMonth() !== month) return;
        idx = Math.min(4, Math.floor((dt.getDate() - 1) / 7));
      } else idx = dt.getMonth();
      if (t.type === "income") ri[idx] += +t.amount;
      if (t.type === "expense") re[idx] += +t.amount;
    });
    $("comparisonTitle").textContent = mode === "weekly" ? "Weekly comparison" : "Monthly comparison";
    report.data.labels = labs;
    report.data.datasets[0].data = ri;
    report.data.datasets[1].data = re;
    report.update();
  }
  function row(t, actions = true) {
    let neg = ["expense", "lent"].includes(t.type);
    return `<tr><td><strong>${safe(t.description)}</strong><span class="txsub">${safe(t.category || "Other")}${t.note ? " · " + safe(t.note) : ""}</span></td><td>${safe(t.date)}</td><td>${t.account === "bank" ? "In account" : "In hand"}</td><td><span class="pill ${t.type}">${safe(t.type)}</span></td><td class="right ${neg ? "neg" : "pos"}">${neg ? "−" : "+"}${money(t.amount)}</td>${actions ? `<td class="rowactions"><button data-edit="${safe(t.id)}">✎</button><button data-del="${safe(t.id)}">×</button></td>` : ""}</tr>`;
  }
  function fill(id, empty, arr, limit = Infinity, actions = true) {
    arr = arr
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit);
    $(id).innerHTML = arr.map((t) => row(t, actions)).join("");
    $(empty).style.display = arr.length ? "none" : "block";
  }
  function render() {
    let b = balance(),
      ml = list(),
      month = $("reportMonth").value || mk();
    $("net").textContent = money(b.total);
    $("expenses").textContent = money(sum(ml, "expense"));
    $("income").textContent = money(sum(ml, "income"));
    $("hand").textContent = money(b.hand);
    $("hand2").textContent = money(b.hand);
    $("bank").textContent = money(b.bank);
    $("total").textContent = money(b.total);
    $("sHand").textContent = money(b.hand);
    $("sBank").textContent = money(b.bank);
    $("sTotal").textContent = money(b.total);
    $("openHand").value = d.opening.hand || 0;
    $("openBank").value = d.opening.bank || 0;
    fill("recent", "recentEmpty", d.transactions, 6);
    let q = ($("txSearch").value || $("search").value).toLowerCase(),
      type = $("typeFilter").value,
      acc = $("accountFilter").value,
      arr = d.transactions.filter(
        (t) =>
          (!q || `${t.description} ${t.category} ${t.note || ""}`.toLowerCase().includes(q)) &&
          (type === "all" || t.type === type) &&
          (acc === "all" || t.account === acc),
      );
    fill("allRows", "allEmpty", arr);
    let r = list(month);
    $("ri").textContent = money(sum(r, "income"));
    $("re").textContent = money(sum(r, "expense"));
    $("rn").textContent = money(sum(r, "income") - sum(r, "expense"));
    $("rc").textContent = r.length;
    let loans = d.transactions.filter((t) => ["lent", "borrowed"].includes(t.type));
    $("lentTotal").textContent = money(sum(loans, "lent"));
    $("borrowTotal").textContent = money(sum(loans, "borrowed"));
    $("loansRows").innerHTML = loans
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(
        (t) =>
          `<tr><td>${safe(t.description)}<span class="txsub">${safe(t.note || "")}</span></td><td>${safe(t.date)}</td><td><span class="pill ${t.type}">${t.type}</span></td><td class="right">${money(t.amount)}</td></tr>`,
      )
      .join("");
    $("loanEmpty").style.display = loans.length ? "none" : "block";
    let used = sum(ml, "expense"),
      budget = +d.budget || 0;
    $("budget").value = budget || "";
    $("budgetStatus").textContent = budget ? `${money(used)} spent of ${money(budget)} · ${money(budget - used)} remaining` : "No budget set yet.";
    chartUpdate();
  }
  function openTx(type = "expense", t = null) {
    $("txForm").reset();
    $("editId").value = t?.id || "";
    $("dialogTitle").textContent = t ? "Edit transaction" : "Add transaction";
    $("desc").value = t?.description || "";
    $("amount").value = t?.amount || "";
    $("date").value = t?.date || dk();
    $("category").value = t?.category || "Food";
    if (!Array.from($("category").options).some((o) => o.value === $("category").value)) $("category").value = "Food";
    $("account").value = t?.account || "hand";
    $("note").value = t?.note || "";
    document.querySelector(`input[name="kind"][value="${t?.type || type}"]`).checked = true;
    $("txDialog").showModal();
  }
  function view(v) {
    document.querySelectorAll(".view").forEach((x) => x.classList.add("hidden"));
    $(v).classList.remove("hidden");
    document.querySelectorAll("[data-view]").forEach((x) => x.classList.toggle("active", x.dataset.view === v));
    $("title").textContent = {
      dashboard: "Dashboard",
      transactions: "Transactions",
      reports: "Analytics & reports",
      accounts: "Accounts",
      budgets: "Budgets",
      loans: "Lent & borrowed",
    }[v];
    $("sidebar").classList.remove("open");
    window.scrollTo(0, 0);
  }
  function download(name, text, type) {
    let u = URL.createObjectURL(new Blob([text], { type })),
      a = document.createElement("a");
    a.href = u;
    a.download = name;
    a.click();
    URL.revokeObjectURL(u);
  }
  $("month").value = mk();
  $("reportMonth").value = mk();
  $("year").innerHTML = [...new Set([today.getFullYear(), ...d.transactions.map((t) => +t.date.slice(0, 4))])]
    .sort((a, b) => b - a)
    .map((y) => `<option>${y}</option>`)
    .join("");
  initCharts();
  render();
  document.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => view(b.dataset.view)));
  document.querySelectorAll("[data-goto]").forEach((b) => (b.onclick = () => view(b.dataset.goto)));
  $("add").onclick = $("add2").onclick = () => openTx();
  $("addLoan").onclick = () => openTx("lent");
  $("close").onclick = $("cancel").onclick = () => $("txDialog").close();
  $("txForm").onsubmit = (e) => {
    e.preventDefault();
    let t = {
        id: $("editId").value || id(),
        description: $("desc").value.trim(),
        amount: +$("amount").value,
        date: $("date").value,
        type: document.querySelector('input[name="kind"]:checked').value,
        category: $("category").value,
        account: $("account").value,
        note: $("note").value.trim(),
      },
      i = d.transactions.findIndex((x) => x.id === t.id);
    if (i < 0) d.transactions.push(t);
    else d.transactions[i] = t;
    $("txDialog").close();
    save(i < 0 ? "Transaction saved" : "Transaction updated");
  };
  document.body.addEventListener("click", (e) => {
    let ed = e.target.closest("[data-edit]"),
      del = e.target.closest("[data-del]");
    if (ed) {
      let t = d.transactions.find((x) => x.id === ed.dataset.edit);
      openTx(t.type, t);
    }
    if (del && confirm("Delete this transaction?")) {
      d.transactions = d.transactions.filter((t) => t.id !== del.dataset.del);
      save("Transaction deleted");
    }
  });
  $("month").onchange = render;
  $("reportMonth").onchange = render;
  $("comparisonMode").onchange = chartUpdate;
  $("year").onchange = chartUpdate;
  $("txSearch").oninput = render;
  $("search").oninput = () => {
    view("transactions");
    $("txSearch").value = $("search").value;
    render();
  };
  $("typeFilter").onchange = $("accountFilter").onchange = render;
  $("balances").onsubmit = (e) => {
    e.preventDefault();
    d.opening = { hand: +$("openHand").value || 0, bank: +$("openBank").value || 0 };
    save("Starting balances saved");
  };
  $("budgetForm").onsubmit = (e) => {
    e.preventDefault();
    d.budget = +$("budget").value || 0;
    save("Budget saved");
  };
  $("transfer").onclick = () => $("transferDialog").showModal();
  $("closeTransfer").onclick = $("cancelTransfer").onclick = () => $("transferDialog").close();
  $("transferForm").onsubmit = (e) => {
    e.preventDefault();
    let amount = +$("transferAmount").value,
      from = $("from").value,
      to = $("to").value,
      b = balance();
    if (from === to) return toast("Choose different accounts");
    if (amount > (from === "hand" ? b.hand : b.bank)) return toast("Not enough balance");
    d.transfers.push({ id: id(), amount, from, to, date: dk() });
    $("transferDialog").close();
    save("Transfer completed");
  };
  function backupJSON() {
    download("pocketledger-backup.json", JSON.stringify({ ...d, exportedAt: new Date().toISOString() }, null, 2), "application/json");
    toast("Backup downloaded");
  }
  $("backup").onclick = backupJSON;
  $("backupMobile").onclick = () => {
    backupJSON();
    $("sidebar").classList.remove("open");
  };
  $("csv").onclick = () => {
    let rows = [
      ["Date", "Description", "Type", "Category", "Account", "Amount", "Note"],
      ...d.transactions.map((t) => [t.date, t.description, t.type, t.category, t.account, t.amount, t.note || ""]),
    ];
    download(
      "pocketledger-transactions.csv",
      "\ufeff" + rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\r\n"),
      "text/csv;charset=utf-8",
    );
    toast("CSV exported");
  };
  $("theme").onclick = () => {
    document.body.classList.toggle("light");
    localStorage.setItem("pocketledger-theme", document.body.classList.contains("light") ? "light" : "dark");
  };
  if (localStorage.getItem("pocketledger-theme") === "light") document.body.classList.add("light");
  $("menu").onclick = () => $("sidebar").classList.toggle("open");
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") $("sidebar").classList.remove("open");
  });
  setupCloud();
})();
