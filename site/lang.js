// Marquee landing: pick the page language before the first paint.
// First ?lang= in the address (the footer switcher), then the visitor's earlier pick,
// then the browser's own languages. English is in the HTML; i18n.js swaps the rest in.
(() => {
	const supported = ["en", "ru", "es", "zh"];
	const pick = (code) => {
		const short = String(code || "")
			.slice(0, 2)
			.toLowerCase();
		return supported.includes(short) ? short : null;
	};
	let lang = pick(new URLSearchParams(location.search).get("lang"));
	try {
		if (lang) localStorage.setItem("lang", lang);
		else lang = pick(localStorage.getItem("lang"));
	} catch {
		// Storage can be blocked; the address and the browser still decide.
	}
	for (const code of lang ? [] : navigator.languages || [navigator.language]) {
		lang = pick(code);
		if (lang) break;
	}
	if (!lang || lang === "en") return;
	const root = document.documentElement;
	root.lang = lang === "zh" ? "zh-CN" : lang;
	root.classList.add("i18n-wait");
})();
