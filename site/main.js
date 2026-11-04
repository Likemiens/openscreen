// Marquee landing: small, independent behaviours. No framework, no build step.
(() => {
	document.documentElement.classList.add("js");
	const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
	const NS = "http://www.w3.org/2000/svg";

	// Pause decorative animation while it is off screen.
	const pauser = new IntersectionObserver((entries) => {
		for (const e of entries) e.target.classList.toggle("is-paused", !e.isIntersecting);
	});

	// ---- Reveal once on scroll ---------------------------------------------
	const revealer = new IntersectionObserver(
		(entries) => {
			for (const e of entries) {
				if (!e.isIntersecting) continue;
				e.target.classList.add("is-in");
				revealer.unobserve(e.target);
			}
		},
		{ rootMargin: "0px 0px -10% 0px" },
	);
	for (const el of document.querySelectorAll(".reveal, .sign")) revealer.observe(el);

	// ---- Bulbs: a frame of lights that chase around the host ---------------
	// Starts at the top centre, so every even count is symmetric on both axes.
	const frame = (w, h, r) =>
		`M${w / 2} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${h - r}A${r} ${r} 0 0 1 ${w - r} ${h}` +
		`H${r}A${r} ${r} 0 0 1 0 ${h - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`;

	function bulbs(host) {
		const layers = ["bulbs-base", "bulbs-lit b0", "bulbs-lit b1", "bulbs-lit b2"].map((cls) => {
			const svg = document.createElementNS(NS, "svg");
			svg.setAttribute("class", `bulbs ${cls}`);
			svg.setAttribute("aria-hidden", "true");
			svg.append(document.createElementNS(NS, "path"));
			host.append(svg);
			return svg.firstChild;
		});
		const draw = () => {
			const cs = getComputedStyle(host);
			const gap = Number.parseFloat(cs.getPropertyValue("--bulb-gap")) || 16;
			const size = Number.parseFloat(cs.getPropertyValue("--bulb-size")) || 5;
			const shape = host.querySelector(".stage-screen") || host;
			const r = (Number.parseFloat(getComputedStyle(shape).borderTopLeftRadius) || 0) + gap;
			const w = host.offsetWidth + gap * 2;
			const h = host.offsetHeight + gap * 2;
			const length = 2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r;
			// A multiple of three, for the three-phase chase. Spacing grows with the bulb.
			const n = Math.max(3, Math.round(length / (size * 5.2) / 3) * 3);
			layers.forEach((path, i) => {
				path.setAttribute("d", frame(w, h, r));
				path.setAttribute("pathLength", String(n));
				path.setAttribute("stroke-dasharray", i === 0 ? "0 1" : "0 3");
				path.setAttribute("stroke-dashoffset", i === 0 ? "0" : String(-(i - 1)));
			});
		};
		draw();
		new ResizeObserver(draw).observe(host);
		pauser.observe(host);
	}

	// ---- The sign: MARQUEE in bulbs, the Q's tail is the record light -------
	const GLYPHS = {
		M: ["X...X", "XX.XX", "X.X.X", "X.X.X", "X...X", "X...X", "X...X"],
		A: [".XXX.", "X...X", "X...X", "XXXXX", "X...X", "X...X", "X...X"],
		R: ["XXXX.", "X...X", "X...X", "XXXX.", "X.X..", "X..X.", "X...X"],
		Q: [".XXX.", "X...X", "X...X", "X...X", "X.X.X", "X..X.", ".XX.X"],
		U: ["X...X", "X...X", "X...X", "X...X", "X...X", "X...X", ".XXX."],
		E: ["XXXXX", "X....", "X....", "XXXX.", "X....", "X....", "XXXXX"],
	};

	function sign(host) {
		const word = "MARQUEE";
		const cols = word.length * 6 - 1;
		const svg = document.createElementNS(NS, "svg");
		svg.setAttribute("class", "sign-letters");
		svg.setAttribute("viewBox", `0 0 ${cols * 10} 70`);
		[...word].forEach((ch, i) => {
			GLYPHS[ch].forEach((row, y) => {
				[...row].forEach((cell, x) => {
					const col = i * 6 + x;
					const c = document.createElementNS(NS, "circle");
					c.setAttribute("cx", String(col * 10 + 5));
					c.setAttribute("cy", String(y * 10 + 5));
					c.setAttribute("r", "3.4");
					if (cell === "X") {
						c.setAttribute("class", ch === "Q" && y === 6 && x === 4 ? "on red" : "on");
						c.style.setProperty("--d", `${col * 24 + y * 12}ms`);
					}
					svg.append(c);
				});
			});
		});
		host.append(svg);
	}

	const signHost = document.querySelector("[data-sign]");
	if (signHost) sign(signHost);
	for (const host of document.querySelectorAll("[data-bulbs]")) bulbs(host);

	// ---- "box": the selection around the word shows its size in real pixels --
	const wordbox = document.querySelector("[data-wordbox]");
	if (wordbox) {
		const ui = wordbox.querySelector(".wordbox-ui");
		const label = wordbox.querySelector("[data-wordbox-size]");
		const measure = () => {
			const r = ui.getBoundingClientRect();
			const d = window.devicePixelRatio || 1;
			label.textContent = `${Math.round(r.width * d)} × ${Math.round(r.height * d)}`;
		};
		measure();
		new ResizeObserver(measure).observe(wordbox);
		document.fonts?.ready.then(measure);
	}

	// ---- Tagline: words light up one at a time as the block scrolls by -------
	const tagline = document.querySelector("[data-tagline]");
	if (tagline) {
		const hot = new Set(["own.", "ask,", "paywall."]);
		const words = tagline.textContent.trim().split(/\s+/);
		tagline.textContent = "";
		const spans = words.map((w, i) => {
			const s = document.createElement("span");
			s.className = hot.has(w) ? "w hot" : "w";
			s.textContent = w;
			tagline.append(s, i < words.length - 1 ? " " : "");
			return s;
		});
		if (reduce) {
			for (const s of spans) s.classList.add("is-lit");
		} else {
			let queued = false;
			const update = () => {
				queued = false;
				const r = tagline.getBoundingClientRect();
				const start = innerHeight * 0.85;
				const end = innerHeight * 0.4;
				const p = (start - r.top) / (start - end + r.height);
				const lit = Math.round(Math.min(1, Math.max(0, p)) * spans.length);
				spans.forEach((s, i) => s.classList.toggle("is-lit", i < lit));
			};
			addEventListener(
				"scroll",
				() => {
					if (queued) return;
					queued = true;
					requestAnimationFrame(update);
				},
				{ passive: true },
			);
			update();
		}
	}

	// ---- Navigation: mark the section in view -------------------------------
	const links = new Map(
		[...document.querySelectorAll("[data-spy]")].map((a) => [a.dataset.spy, a]),
	);
	const spy = new IntersectionObserver(
		(entries) => {
			for (const e of entries) {
				const link = links.get(e.target.id);
				if (!link) continue;
				if (e.isIntersecting) link.setAttribute("aria-current", "true");
				else link.removeAttribute("aria-current");
			}
		},
		{ rootMargin: "-45% 0px -50% 0px" },
	);
	for (const id of links.keys()) {
		const section = document.getElementById(id);
		if (section) spy.observe(section);
	}

	const ticker = document.querySelector(".ticker");
	if (ticker) pauser.observe(ticker);

	// ---- The stage: hotkey, select, record, stop, copy. On a loop. ----------
	const stage = document.querySelector(".stage");
	if (stage) demo(stage);

	function demo(stage) {
		const screen = stage.querySelector(".stage-screen");
		const desk = stage.querySelector("[data-desk]");
		const sel = desk.querySelector("[data-sel]");
		const selSize = desk.querySelector("[data-sel-size]");
		const cursor = desk.querySelector("[data-cursor]");
		const timer = desk.querySelector("[data-timer]");
		const copyBtn = desk.querySelector('[data-target="copy-link"]');
		const copyLabel = desk.querySelector("[data-copy-label]");
		const narrow = matchMedia("(max-width: 700px)");
		const SEL = { x: 288, y: 104, w: 704, h: 396 };
		const REST = { x: 930, y: 660 };

		const fit = () => {
			desk.style.setProperty("--k", String(screen.clientWidth / (narrow.matches ? 840 : 1280)));
		};
		fit();
		new ResizeObserver(fit).observe(screen);

		const phase = (p) => {
			desk.dataset.phase = p;
		};

		if (reduce) {
			phase("done");
			cursor.style.display = "none";
			return;
		}

		let visible = false;
		let wake = null;
		new IntersectionObserver(([e]) => {
			visible = e.isIntersecting;
			if (visible) wake?.();
		}).observe(stage);
		document.addEventListener("visibilitychange", () => {
			if (!document.hidden && visible) wake?.();
		});
		const gate = () =>
			visible && !document.hidden
				? Promise.resolve()
				: new Promise((resolve) => {
						wake = resolve;
					});

		const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
		const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
		const out = (t) => 1 - (1 - t) ** 3;
		const tween = (ms, fn, ease = inOut) =>
			new Promise((resolve) => {
				const t0 = performance.now();
				const tick = (now) => {
					const t = Math.min(1, (now - t0) / ms);
					fn(ease(t));
					if (t < 1) requestAnimationFrame(tick);
					else resolve();
				};
				requestAnimationFrame(tick);
			});

		let pos = { ...REST };
		const put = (p) => {
			pos = p;
			cursor.style.transform = `translate(${p.x}px, ${p.y}px)`;
		};
		const moveTo = (to, ms) => {
			const from = { ...pos };
			return tween(ms, (p) =>
				put({ x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p }),
			);
		};
		// Centre of an element in desk coordinates (the desk is scaled by --k).
		const at = (el, dx = 0, dy = 0) => {
			const d = desk.getBoundingClientRect();
			const r = el.getBoundingClientRect();
			const k = d.width / 1280;
			return {
				x: (r.left + r.width / 2 - d.left) / k + dx,
				y: (r.top + r.height / 2 - d.top) / k + dy,
			};
		};
		const press = async (el) => {
			cursor.classList.add("is-clicking");
			el.classList.add("is-pressed");
			await wait(140);
			cursor.classList.remove("is-clicking");
			el.classList.remove("is-pressed");
		};
		const drag = (ms) =>
			tween(
				ms,
				(p) => {
					const w = SEL.w * p;
					const h = SEL.h * p;
					sel.style.width = `${w}px`;
					sel.style.height = `${h}px`;
					selSize.textContent = `${Math.round(1280 * p)} × ${Math.round(720 * p)}`;
					put({ x: SEL.x + w, y: SEL.y + h });
				},
				out,
			);

		put(REST);

		(async () => {
			for (let take = 0; ; take++) {
				await gate();
				phase("idle");
				sel.style.width = "0px";
				sel.style.height = "0px";
				selSize.textContent = "0 × 0";
				timer.textContent = "00:00";
				copyLabel.textContent = "Copy link";
				copyBtn.classList.remove("is-done");
				delete desk.dataset.tip;
				// Let the first look at the desk last a little longer.
				await wait(take === 0 ? 1800 : 800);

				phase("keys");
				await wait(1200);
				phase("select");
				await moveTo({ x: SEL.x, y: SEL.y }, 700);
				await wait(120);
				await drag(1000);
				phase("ready");
				await wait(500);

				const rec = desk.querySelector('[data-target="picker-rec"]');
				await moveTo(at(rec, -14, 2), 650);
				await press(rec);
				phase("rec");
				let secs = 0;
				const clock = setInterval(() => {
					secs += 1;
					timer.textContent = `00:${String(secs).padStart(2, "0")}`;
				}, 1000);

				const dip = desk.querySelector(".dip");
				await moveTo(at(dip, 6, 8), 900);
				desk.dataset.tip = "";
				await wait(1300);
				await moveTo(at(dip, 120, -70), 900);
				delete desk.dataset.tip;
				await wait(300);

				const stop = desk.querySelector('[data-target="stop"]');
				await moveTo(at(stop, -20, 2), 800);
				await press(stop);
				clearInterval(clock);
				phase("done");
				await wait(600);

				await moveTo(at(copyBtn, -10, 2), 700);
				await press(copyBtn);
				copyLabel.textContent = "Link copied";
				copyBtn.classList.add("is-done");
				await wait(2400);

				phase("idle");
				await moveTo(REST, 900);
			}
		})();
	}
})();
