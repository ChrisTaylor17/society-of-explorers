/* Society of Explorers — exhibition nav
   No analytics. No network. Menu state stays in the page.
   Share uses the browser share sheet or the clipboard only. */
(function () {
  var main = document.getElementById("main");
  if (main && !main.hasAttribute("tabindex")) {
    main.setAttribute("tabindex", "-1");
  }

  function ideaUrl(el) {
    var explicit = el.getAttribute("data-share-url");
    if (explicit) {
      try {
        return new URL(explicit, location.href).href;
      } catch (e) {}
    }
    var hash = el.getAttribute("data-share-hash");
    if (hash) {
      if (hash.charAt(0) !== "#") hash = "#" + hash;
      return location.origin + location.pathname + location.search + hash;
    }
    return location.href;
  }

  function markShared(btn, label) {
    var prev = btn.getAttribute("data-share-label") || btn.textContent;
    btn.setAttribute("data-share-label", prev);
    btn.textContent = label;
    btn.classList.add("is-copied");
    setTimeout(function () {
      btn.textContent = prev;
      btn.classList.remove("is-copied");
    }, 1600);
  }

  function copyText(url, btn) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        markShared(btn, "Copied");
      }).catch(function () {});
    }
  }

  function shareIdea(btn) {
    var url = ideaUrl(btn);
    var title = btn.getAttribute("data-share-title") || document.title;
    var text = btn.getAttribute("data-share-text") || "";
    var payload = { title: title, url: url };
    if (text) payload.text = text;
    if (navigator.share) {
      navigator.share(payload).then(function () {
        markShared(btn, "Shared");
      }).catch(function (err) {
        if (err && err.name === "AbortError") return;
        copyText(url, btn);
      });
      return;
    }
    copyText(url, btn);
  }

  document.querySelectorAll("[data-share-idea]").forEach(function (btn) {
    if (!navigator.share && btn.textContent.trim() === "Share this idea") {
      btn.textContent = "Copy this idea";
    }
    btn.addEventListener("click", function () {
      shareIdea(btn);
    });
  });

  /* Copy link — subtle footer util; fail silently if clipboard unavailable */
  (function initCopyLink() {
    var inner = document.querySelector("footer .inner");
    if (!inner || inner.querySelector("[data-copy-link]")) return;
    var sep = document.createElement("span");
    sep.className = "footer-sep";
    sep.setAttribute("aria-hidden", "true");
    sep.textContent = "·";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "footer-util copy-link-btn";
    btn.setAttribute("data-copy-link", "");
    btn.textContent = "Copy link";
    btn.addEventListener("click", function () {
      var url = location.href;
      function ok() {
        var prev = btn.textContent;
        btn.textContent = "Copied";
        btn.classList.add("is-copied");
        setTimeout(function () {
          btn.textContent = prev;
          btn.classList.remove("is-copied");
        }, 1600);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(ok).catch(function () {});
      }
    });
    inner.appendChild(document.createTextNode(" "));
    inner.appendChild(sep);
    inner.appendChild(document.createTextNode(" "));
    inner.appendChild(btn);
  })();

  var btn = document.querySelector("[data-nav-toggle]");
  var nav = document.getElementById("site-nav");
  if (!btn || !nav) return;

  var burger =
    '<span class="burger" aria-hidden="true"><i></i><i></i><i></i></span> ';

  function setOpen(open) {
    nav.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.innerHTML = burger + (open ? "Close" : "Menu");
    document.body.classList.toggle("nav-open", open);
  }

  btn.addEventListener("click", function () {
    setOpen(!nav.classList.contains("is-open"));
  });

  nav.addEventListener("click", function (e) {
    var link = e.target.closest && e.target.closest("a");
    if (link && nav.classList.contains("is-open")) setOpen(false);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var details = nav.querySelector("details[open]");
    if (details) details.removeAttribute("open");
    if (nav.classList.contains("is-open")) {
      setOpen(false);
      btn.focus();
    }
  });

  document.addEventListener("click", function (e) {
    var details = nav.querySelector("details.nav-more[open]");
    if (!details) return;
    if (!details.contains(e.target)) details.removeAttribute("open");
  });

  var desktop = window.matchMedia("(min-width: 761px)");
  function closeIfDesktop() {
    if (desktop.matches && nav.classList.contains("is-open")) setOpen(false);
  }
  if (desktop.addEventListener) desktop.addEventListener("change", closeIfDesktop);
  else if (desktop.addListener) desktop.addListener(closeIfDesktop);
})();
