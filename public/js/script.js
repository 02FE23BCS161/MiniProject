// public/js/script.js

// Confirm deletion links/buttons that include data-confirm attribute
document.addEventListener("click", function (e) {
  const el = e.target.closest("[data-confirm]");
  if (!el) return;

  const msg = el.getAttribute("data-confirm") || "Are you sure?";
  const ok = confirm(msg);
  if (!ok) {
    e.preventDefault();
    e.stopImmediatePropagation();
    return false;
  }
});

// Auto-hide flash messages after a timeout
window.addEventListener("load", () => {
  const alerts = document.querySelectorAll(".alert");
  if (!alerts.length) return;
  setTimeout(() => {
    alerts.forEach(a => {
      a.style.transition = "opacity 0.4s ease, transform 0.4s ease";
      a.style.opacity = "0";
      a.style.transform = "translateY(-6px)";
      setTimeout(() => a.remove(), 450);
    });
  }, 5000);
});
