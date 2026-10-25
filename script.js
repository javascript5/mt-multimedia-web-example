/* Figma image paints map the card's normalized coordinates into the source.
   Invert that mapping to preserve the exact crop/rotation of the original PNG.
   No raster is edited or substituted. */
const imagePaints = [
  [".service-card--strategic", [[-.2541867196559906,.3140147924423218,.2590062916278839],[-.8803529143333435,-.05489327013492584,1.175999641418457]]],
  [".service-card--pr", [[.19234441220760345,-.2997262477874756,.5095639824867249],[.949373185634613,.0303877592086792,-.20834684371948242]]],
  [".service-card--imc", [[1.2037159204483032,-.1373622566461563,-.2344004511833191],[.3386786878108978,.20260204374790192,.40287089347839355]]],
  [".service-card--digital", [[.6793267726898193,.24918010830879211,-.13670958578586578],[-.8510870337486267,.11529508978128433,1.0882676839828491]]]
];
imagePaints.push([".service-card--events", imagePaints[0][1]]);
for (const [selector, [[a,c,e],[b,d,f]]] of imagePaints) {
  const card = document.querySelector(selector);
  const image = card.querySelector(".service-image img");
  const determinant = a*d-b*c;
  const inverse = [d/determinant,-b/determinant,-c/determinant,a/determinant,(c*f-d*e)/determinant,(b*e-a*f)/determinant];
  const update = () => {
    const {width,height} = card.getBoundingClientRect();
    image.style.transform = `matrix(${inverse[0]},${inverse[1]*height/width},${inverse[2]*width/height},${inverse[3]},${inverse[4]*width},${inverse[5]*height})`;
  };
  update();
  new ResizeObserver(update).observe(card);
}

/* Round one: same-page journeys only. Normal links still work without JS,
   and modified clicks / new tabs keep the browser's native behavior. */
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let activeJourney = null;

function cancelJourney() {
  if (!activeJourney) return;
  cancelAnimationFrame(activeJourney.frame);
  activeJourney.events.abort();
  activeJourney = null;
}

function focusDestination(target) {
  // Announce the destination heading and continue Tab from that section.
  const destination = target.matches("main")
    ? target
    : target.querySelector("h2,h3") || target;
  if (!destination.matches("a[href],button,input,select,textarea,[tabindex]")) {
    destination.setAttribute("tabindex", "-1");
    destination.setAttribute("data-anchor-focus", "");
    destination.addEventListener("blur", () => {
      destination.removeAttribute("tabindex");
      destination.removeAttribute("data-anchor-focus");
    }, { once: true });
  }
  destination.focus({ preventScroll: true });
}

function travelTo(target, { home = false, instant = false } = {}) {
  cancelJourney();
  const start = window.scrollY;
  const inset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  const maximum = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const top = home ? 0 : Math.min(maximum, Math.max(0, start + target.getBoundingClientRect().top - inset));
  const finish = () => {
    cancelJourney();
    window.scrollTo({ top, behavior: "instant" });
    focusDestination(target);
  };

  if (instant || reducedMotion.matches || Math.abs(top - start) < 1) {
    finish();
    return;
  }

  const duration = 300 + Math.min(Math.abs(top - start) / 2000, 1) * 150;
  const journey = { frame: 0, events: new AbortController(), finish };
  activeJourney = journey;
  // Interrupt, never compete with the user's own scroll or next action.
  for (const type of ["wheel", "touchstart", "pointerdown", "keydown", "resize", "popstate", "hashchange"]) {
    window.addEventListener(type, cancelJourney, { passive: true, signal: journey.events.signal });
  }
  document.addEventListener("visibilitychange", cancelJourney, { signal: journey.events.signal });
  const began = performance.now();
  function step(now) {
    if (activeJourney !== journey) return;
    const progress = Math.min(1, (now - began) / duration);
    const eased = progress < .5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
    window.scrollTo({ top: start + (top - start) * eased, behavior: "instant" });
    if (progress < 1) journey.frame = requestAnimationFrame(step);
    else finish();
  }
  journey.frame = requestAnimationFrame(step);
}

document.addEventListener("click", event => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest("a[href]");
  if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search) return;
  // Limit enhancement to fragment links, including the brand's href="#".
  if (!link.getAttribute("href").includes("#")) return;
  let id;
  try { id = decodeURIComponent(url.hash.slice(1)); } catch { return; }
  const home = id === "";
  const target = home ? document.querySelector(".brand") : document.getElementById(id);
  if (!target) return;
  event.preventDefault();
  if (url.href !== location.href) history.pushState(history.state, "", url.href);
  travelTo(target, { home, instant: link.classList.contains("skip-link") });
});

reducedMotion.addEventListener("change", () => {
  if (reducedMotion.matches) activeJourney?.finish();
});

// The supplied frame contains no contact destination, news route, service pages
// or playable movie. Keep those controls visibly faithful without fabricating
// a route, address, video, or successful submission. Wire real targets here.
document.querySelectorAll("[data-pending]").forEach(control => {
  control.addEventListener("click", event => event.preventDefault());
});

/* Services start closed. Mouse hover is temporary; touch and keyboard toggle
   the same disclosure buttons. Hidden panels cannot receive keyboard focus. */
(() => {
  const list = document.querySelector(".service-list");
  const cards = [...list.querySelectorAll(".service-card")];
  const hoverPointer = matchMedia("(hover: hover) and (pointer: fine)");
  let expanded = null;
  let lastPointer = "mouse";
  function show(card) {
    cards.forEach(item => {
      const open = item === card;
      const toggle = item.querySelector(".service-toggle");
      const panel = item.querySelector(".service-details");
      if (!open && panel.contains(document.activeElement)) toggle.focus({ preventScroll: true });
      item.classList.toggle("is-expanded", open);
      toggle.setAttribute("aria-expanded", String(open));
      panel.inert = !open;
      panel.setAttribute("aria-hidden", String(!open));
    });
    expanded = card;
  }
  cards.forEach(card => {
    const toggle = card.querySelector(".service-toggle");
    card.addEventListener("pointerenter", event => {
      if (hoverPointer.matches && event.pointerType !== "touch") show(card);
    });
    card.addEventListener("pointerleave", event => {
      if (event.pointerType === "touch" || expanded !== card) return;
      if (!card.querySelector(":focus-visible")) show(null);
    });
    toggle.addEventListener("pointerdown", event => { lastPointer = event.pointerType; });
    toggle.addEventListener("click", event => {
      // Mouse hover has already opened the row; clicking must not flicker it shut.
      if (event.detail > 0 && hoverPointer.matches && lastPointer === "mouse") return;
      show(expanded === card ? null : card);
    });
    card.addEventListener("focusout", event => {
      if (!card.contains(event.relatedTarget) && expanded === card && !card.matches(":hover")) show(null);
    });
    card.addEventListener("keydown", event => {
      if (event.key !== "Escape" || expanded !== card) return;
      event.preventDefault();
      toggle.focus({ preventScroll: true });
      show(null);
    });
  });
  hoverPointer.addEventListener("change", () => show(null));
  show(null);
  list.classList.add("services-interactive");
})();
