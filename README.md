# MT Multimedia — Website Example

A responsive landing-page concept for MT Multimedia, built with HTML, CSS and JavaScript.

**Preview:** https://javascript5.github.io/mt-multimedia-web-example/

Vertical mouse-wheel and trackpad gestures advance through Hero, Video, Who We Are, Partners and Services. Each gesture moves one step; the video fills the viewport at its stop. Services retain normal scrolling so all details remain reachable. Touch and keyboard retain native navigation, and reduced motion uses immediate section changes.

Service 01 is expanded when the page first opens; the other services expand on hover or tap.

This is a design prototype. Contact, news and video controls are placeholders.

## Run locally

From the repository root:

```sh
python3 -m http.server 4173 --directory web
```

Open http://localhost:4173/.

## Publish changes

GitHub Pages serves the root of the `gh-pages` branch. After committing website changes on `main`, publish them with:

```sh
git push origin main
git subtree push --prefix=web origin gh-pages
```

The website source is in `web/`. Internal project documents and design references are excluded from this repository.

Company names and logos belong to their respective owners. This repository does not grant rights to reuse those assets.
