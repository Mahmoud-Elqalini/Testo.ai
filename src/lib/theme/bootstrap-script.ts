export const themeBootstrapScript = `(() => {
try {
  var themeCookie = document.cookie.match(/(?:^|;\\s*)testo_theme=([^;]*)/);
  var theme = themeCookie ? themeCookie[1] : "light";

  if (themeCookie && theme !== "light" && theme !== "dark") {
    theme = "light";
  } else if (!themeCookie) {
    try {
      var storedTheme = window.localStorage.getItem("testo_theme");
      if (storedTheme === "light" || storedTheme === "dark") {
        theme = storedTheme;
        try {
          document.cookie = "testo_theme=" + theme + "; path=/; max-age=31536000; samesite=lax";
        } catch (_) {}
      }
    } catch (_) {}
  }

  try {
    window.localStorage.setItem("testo_theme", theme);
  } catch (_) {}

  document.documentElement.classList.toggle("dark", theme === "dark");
} catch (_) {}
})();`;
