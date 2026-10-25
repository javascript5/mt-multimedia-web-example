/* Client presentation choreography: scroll-driven scenes, finite entrances, and one
   shared pointer/parallax frame. There is no animation loop while idle. */
(() => {
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  const root = document.documentElement;
  const hero = document.querySelector(".hero");
  const film = document.querySelector(".film");
  const statement = document.querySelector(".statement");
  const statementSource = statement.innerHTML;
  let statementLines = [], statementWidth = 0;

  function splitStatementLines() {
    if (!enabled) return;
    statement.innerHTML = statementSource;
    const walker = document.createTreeWalker(statement, NodeFilter.SHOW_TEXT);
    const tokens = [];
    while (walker.nextNode()) {
      const text = walker.currentNode;
      const color = text.parentElement.closest(".text-blue,.text-muted")?.className || "";
      for (const token of text.textContent.match(/\s+|\S+/g) || []) tokens.push({ text: token, color });
    }
    const words = document.createDocumentFragment();
    tokens.forEach(token => {
      if (/^\s+$/.test(token.text)) words.append(document.createTextNode(token.text));
      else {
        const word = document.createElement("span");
        word.textContent = token.text;
        if (token.color) word.className = token.color;
        words.append(word);
      }
    });
    statement.replaceChildren(words);
    // Measure actual browser line breaks after fonts load, including responsive
    // wrapping. Keep one copy of the text and preserve the original color spans.
    const groups = [];
    let top;
    [...statement.childNodes].forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const nextTop = node.getBoundingClientRect().top;
        if (top === undefined || Math.abs(nextTop - top) > 2) {
          groups.push([]);
          top = nextTop;
        }
      }
      if (!groups.length) groups.push([]);
      groups[groups.length - 1].push(node);
    });
    const lines = document.createDocumentFragment();
    statementLines = groups.map(nodes => {
      const line = document.createElement("span");
      line.className = "statement-line";
      const content = document.createElement("span");
      content.className = "statement-line-content";
      content.append(...nodes);
      line.append(content);
      lines.append(line);
      return line;
    });
    statement.replaceChildren(lines);
    statementWidth = statement.getBoundingClientRect().width;
    scrollDirty = true;
    schedule();
  }
  const cards = [...document.querySelectorAll(".service-card")];
  const fields = [];
  const seen = new WeakSet();
  const animations = new Map();
  let enabled = false, frame = 0, lastFrame = 0, scrollDirty = true;
  let heroProgress = 0, filmProgress = 0, targetHero = 0, targetFilm = 0;
  let observer, introPlayed = false;
  let filmScene, filmStage, filmOrigin;
  let filmBaseWidth = 0, filmBaseHeight = 0, filmViewWidth = 0, filmViewHeight = 0;
  const standards = document.querySelector(".standards-content");

  function measureFilmScene() {
    if (!filmScene) return;
    const base = filmOrigin.getBoundingClientRect();
    const heroBottom = hero.getBoundingClientRect().bottom;
    filmBaseWidth = base.width;
    filmBaseHeight = base.height;
    filmViewWidth = filmStage.clientWidth;
    filmViewHeight = filmStage.clientHeight;
    // Keep the initial cover in its original place over the bottom of the hero.
    filmScene.style.setProperty("--film-overlap", `${base.top - heroBottom - (filmViewHeight - base.height) / 2}px`);
    scrollDirty = true;
    schedule();
  }
  function mountFilmScene() {
    const previousTop = standards.getBoundingClientRect().top;
    filmOrigin = document.createElement("div");
    filmOrigin.className = "film-origin";
    filmOrigin.setAttribute("aria-hidden", "true");
    film.before(filmOrigin);
    filmScene = document.createElement("div");
    filmScene.className = "film-scroll";
    filmStage = document.createElement("div");
    filmStage.className = "film-stage";
    filmScene.append(filmStage);
    hero.after(filmScene);
    filmStage.append(film);
    measureFilmScene();
    paintFilmScene(0);
    // Preserve the reader's position if motion is enabled farther down the page.
    if (previousTop < innerHeight) scrollBy({ top: standards.getBoundingClientRect().top - previousTop, behavior: "instant" });
  }
  function unmountFilmScene() {
    if (!filmScene) return;
    const previousTop = standards.getBoundingClientRect().top;
    const scene = filmScene.getBoundingClientRect();
    const wasInScene = scene.top <= 0 && scene.bottom > 0;
    const focused = film.contains(document.activeElement) ? document.activeElement : null;
    filmOrigin.replaceWith(film);
    filmScene.remove();
    filmScene = filmStage = filmOrigin = null;
    if (previousTop < innerHeight) scrollBy({ top: standards.getBoundingClientRect().top - previousTop, behavior: "instant" });
    else if (wasInScene) film.scrollIntoView({ block: "center", behavior: "instant" });
    focused?.focus({ preventScroll: true });
  }
  function paintFilmScene(progress) {
    if (!filmScene) return;
    const smooth = value => value * value * (3 - 2 * value);
    const expansion = progress < .42 ? smooth(clamp(progress / .42))
      : progress <= .58 ? 1 : 1 - smooth(clamp((progress - .58) / .42));
    filmScene.style.setProperty("--film-width", `${filmBaseWidth + (filmViewWidth - filmBaseWidth) * expansion}px`);
    filmScene.style.setProperty("--film-height", `${filmBaseHeight + (filmViewHeight - filmBaseHeight) * expansion}px`);
  }

  const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
  const set = (node, name, value) => node.style.setProperty(name, value);
  function schedule() {
    if (enabled && !frame && !document.hidden) frame = requestAnimationFrame(render);
  }
  function field(node, paint = () => {}) {
    const item = {
      node, paint, x: 0, y: 0, px: .5, py: .5, active: 0,
      tx: 0, ty: 0, tpx: .5, tpy: .5, ta: 0
    };
    fields.push(item);
    node.addEventListener("pointermove", event => {
      if (!enabled || !finePointer.matches || event.pointerType === "touch") return;
      const rect = node.getBoundingClientRect();
      item.tpx = clamp((event.clientX - rect.left) / rect.width);
      item.tpy = clamp((event.clientY - rect.top) / rect.height);
      item.tx = (item.tpx - .5) * 2;
      item.ty = (item.tpy - .5) * 2;
      item.ta = 1;
      node.classList.add("is-hovered");
      schedule();
    }, { passive: true });
    const leave = () => {
      item.tx = item.ty = item.ta = 0;
      node.classList.remove("is-hovered");
      schedule();
    };
    node.addEventListener("pointerleave", leave);
    node.addEventListener("pointercancel", leave);
    return item;
  }

  const heroPointer = field(hero);
  field(film, item => {
    set(film, "--film-rx", `${item.y * -2.6}deg`);
    set(film, "--film-ry", `${item.x * 3.2}deg`);
    set(film, "--film-scale", 1 + item.active * .018);
    set(film, "--film-shadow", item.active * .45);
    set(film, "--film-active", item.active.toFixed(4));
    set(film, "--film-light-x", `${item.px * 100}%`);
    set(film, "--film-light-y", `${item.py * 100}%`);
    set(film, "--play-x", `${item.x * 20}px`);
    set(film, "--play-y", `${item.y * 16}px`);
  });
  cards.forEach(card => field(card, item => {
    set(card, "--card-rx", `${item.y * -1.7}deg`);
    set(card, "--card-ry", `${item.x * 1.1}deg`);
    set(card, "--card-active", item.active.toFixed(4));
    set(card, "--card-shadow", item.active * .42);
    set(card, "--card-pan-x", `${item.x * -7}px`);
    set(card, "--card-pan-y", `${item.y * -5}px`);
    set(card, "--card-zoom", 1 + item.active * .035);
    set(card, "--card-light-x", `${item.px * 100}%`);
    set(card, "--card-light-y", `${item.py * 100}%`);
  }));

  function readScroll() {
    // All geometry reads happen before writes in render().
    const heroRect = hero.getBoundingClientRect();
    const linePositions = statementLines.map(line => {
      const rect = line.getBoundingClientRect();
      return { line, top: rect.top, height: rect.height };
    });
    targetHero = clamp(-heroRect.top / hero.offsetHeight);
    if (filmScene) {
      const sceneRect = filmScene.getBoundingClientRect();
      targetFilm = clamp(-sceneRect.top / (filmScene.offsetHeight - filmStage.offsetHeight));
      // A fast scroll should never leave the full-screen cover behind an entrance wipe.
      if (targetFilm > 0 && animations.has(film)) showImmediately(film);
    }
    linePositions.forEach(({ line, top, height }) => {
      const progress = clamp((innerHeight * .8 - top) / (height * .9));
      const eased = progress * progress * (3 - 2 * progress);
      set(line, "--line-reveal", eased.toFixed(4));
    });
    scrollDirty = false;
  }
  function render(now) {
    frame = 0;
    if (!enabled || document.hidden) return;
    const factor = 1 - Math.exp(-Math.min(now - (lastFrame || now - 16), 40) / 80);
    lastFrame = now;
    if (scrollDirty) readScroll();
    let moving = false;
    function follow(value, target) {
      if (Math.abs(target - value) < .0005) return target;
      moving = true;
      return value + (target - value) * factor;
    }
    heroProgress = follow(heroProgress, targetHero);
    filmProgress = follow(filmProgress, targetFilm);
    for (const item of fields) {
      item.x = follow(item.x, item.tx);
      item.y = follow(item.y, item.ty);
      item.px = follow(item.px, item.tpx);
      item.py = follow(item.py, item.tpy);
      item.active = follow(item.active, item.ta);
      item.paint(item);
    }
    set(hero, "--hero-pan-x", `${heroPointer.x * 14}px`);
    set(hero, "--hero-pan-y", `${heroProgress * 48 + heroPointer.y * 6}px`);
    set(hero, "--hero-zoom", 1 + heroProgress * .12 + heroPointer.active * .035);
    set(hero, "--copy-y", `${heroProgress * -32}px`);
    set(hero, "--copy-opacity", 1 - heroProgress * .45);
    paintFilmScene(filmProgress);
    if (moving) schedule();
  }

  function reveal(node, { delay = 0, duration = 900, distance = 40, wipe = false } = {}) {
    if (seen.has(node)) return;
    seen.add(node);
    observer?.unobserve(node);
    node.removeAttribute("data-motion-pending");
    if (!enabled) return;
    const opacity = getComputedStyle(node).opacity;
    const from = { opacity: 0, translate: `0 ${distance}px`, filter: "blur(5px)" };
    const to = { opacity, translate: "0 0", filter: "blur(0px)" };
    if (wipe) {
      delete from.translate; delete to.translate;
      from.clipPath = "inset(0 0 100% 0)";
      to.clipPath = "inset(0 0 0% 0)";
    }
    const animation = node.animate([from, to], {
      duration, delay, easing: "cubic-bezier(.16,1,.3,1)", fill: "both"
    });
    animations.set(node, animation);
    animation.finished.then(() => {
      if (animations.get(node) === animation) animations.delete(node);
      animation.cancel();
    }).catch(() => {});
  }
  function showImmediately(node) {
    node.removeAttribute("data-motion-pending");
    seen.add(node);
    observer?.unobserve(node);
    animations.get(node)?.cancel();
    animations.delete(node);
  }
  const revealNodes = [
    document.querySelector(".standards-content>.eyebrow"),
    document.querySelector(".partners h2"), ...document.querySelectorAll(".partner"),
    document.querySelector(".services-header"), ...cards
  ];
  const logoNodes = [...document.querySelectorAll(".partner")];
  function prepareReveals() {
    observer?.disconnect();
    observer = new IntersectionObserver(entries => {
      entries.filter(entry => entry.isIntersecting).forEach(({ target }) => {
        const logoIndex = logoNodes.indexOf(target);
        reveal(target, { delay: logoIndex >= 0 ? logoIndex * 85 : 0, distance: logoIndex >= 0 ? 20 : 44 });
      });
    }, { threshold: .12, rootMargin: "0px 0px -5% 0px" });
    revealNodes.forEach(node => {
      if (seen.has(node)) return;
      // Reloading mid-page or following an anchor never hides existing content.
      if (node.getBoundingClientRect().top < innerHeight * .95) showImmediately(node);
      else { node.setAttribute("data-motion-pending", ""); observer.observe(node); }
    });
  }
  function enable() {
    if (preference.matches) return;
    enabled = true;
    root.classList.add("motion-enabled");
    mountFilmScene();
    splitStatementLines();
    prepareReveals();
    if (!introPlayed && scrollY < 40 && !location.hash) {
      introPlayed = true;
      // Header hit areas stay still, even if someone clicks during the intro.
      [...document.querySelector(".header").children].forEach((node, i) => reveal(node, { delay: i * 65, duration: 700, distance: 0 }));
      [document.querySelector(".hero-eyebrow"), document.querySelector("h1"), document.querySelector(".hero-description"), document.querySelector(".hero-content>.button")]
        .forEach((node, i) => reveal(node, { delay: 160 + i * 140, duration: 1100, distance: i === 1 ? 38 : 24 }));
      reveal(film, { delay: 650, duration: 1250, wipe: true });
    }
    scrollDirty = true;
    lastFrame = 0;
    schedule();
  }
  function disable() {
    enabled = false;
    root.classList.remove("motion-enabled");
    cancelAnimationFrame(frame); frame = 0;
    observer?.disconnect();
    for (const animation of animations.values()) animation.cancel();
    animations.clear();
    document.querySelectorAll("[data-motion-pending]").forEach(node => node.removeAttribute("data-motion-pending"));
    fields.forEach(item => {
      item.x = item.y = item.tx = item.ty = item.active = item.ta = 0;
      item.node.classList.remove("is-hovered");
      item.paint(item);
    });
    heroProgress = filmProgress = targetHero = targetFilm = 0;
    statement.innerHTML = statementSource;
    statementLines = [];
    statementWidth = 0;
    unmountFilmScene();
  }
  addEventListener("scroll", () => { scrollDirty = true; schedule(); }, { passive: true });
  addEventListener("resize", () => { measureFilmScene(); scrollDirty = true; schedule(); }, { passive: true });
  new ResizeObserver(() => { if (enabled) measureFilmScene(); }).observe(hero);
  new ResizeObserver(entries => {
    if (enabled && Math.abs(entries[0].contentRect.width - statementWidth) > .5) splitStatementLines();
  }).observe(statement);
  document.fonts.ready.then(() => { if (enabled) splitStatementLines(); });
  document.fonts.addEventListener("loadingdone", () => { if (enabled) splitStatementLines(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; lastFrame = 0; }
    else { scrollDirty = true; schedule(); }
  });
  document.addEventListener("focusin", event => {
    // Do not snap a moving hit area between pointerdown and pointerup.
    if (event.target.matches("a,button,input,select,textarea") && !event.target.matches(":focus-visible")) return;
    [...revealNodes, ...animations.keys()].forEach(node => {
      if (node.contains(event.target)) showImmediately(node);
    });
  });
  finePointer.addEventListener("change", () => {
    fields.forEach(item => { item.tx = item.ty = item.ta = 0; item.node.classList.remove("is-hovered"); });
    schedule();
  });
  preference.addEventListener("change", () => preference.matches ? disable() : enable());
  enable();
})();
