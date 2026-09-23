// Shared by login.html, dashboard.html, and lesson.html.
window.AFN = (function () {
  var SUPABASE_URL = "https://pnalfkdewygqdmblxjoq.supabase.co";
  var SUPABASE_KEY = "sb_publishable_QAIFChbnZk9PM3pbWzEGFA_sNsFlOuD";
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" }
  });

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    });
    if (text != null) e.textContent = text;
    return e;
  }

  // Send signed-out visitors to the login page, then come back here.
  async function requireUser() {
    var res = await sb.auth.getSession();
    var session = res.data && res.data.session;
    if (!session) {
      var back = location.pathname + location.search;
      location.replace("/login.html?next=" + encodeURIComponent(back));
      return null;
    }
    var who = document.getElementById("who");
    if (who) who.textContent = session.user.email;
    var out = document.getElementById("signout");
    if (out) out.addEventListener("click", async function () {
      await sb.auth.signOut();
      location.href = "/login.html";
    });
    return session;
  }

  async function hasCourseAccess(userId) {
    var r = await sb.from("enrollments").select("status").eq("user_id", userId).eq("product", "course").eq("status", "active").limit(1);
    return !r.error && r.data && r.data.length > 0;
  }

  return { sb: sb, el: el, requireUser: requireUser, hasCourseAccess: hasCourseAccess };
})();
