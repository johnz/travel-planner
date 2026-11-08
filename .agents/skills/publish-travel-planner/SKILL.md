---
name: publish-travel-planner
description: Update and publish the 2027 China and Korea trip pages in the johnz/travel-planner GitHub Pages repository when asked to change the shared trip website.
---

# Publish the shared travel site

The public repository is `johnz/travel-planner`. GitHub Pages serves its `main` branch from the repository root. The 2027 trip lives in `2027-china-korea/`; `index.html` links the city pages.

For Harbin, edit the private source `harbin-map.html` in the parent `travel-planner` workspace, then run `python3 build-share-site.py` there. It writes a less identifying `public-site/2027-china-korea/harbin.html`. Commit and push only the `public-site` Git repository. Keep exact accommodation details, booking references and traveller identity out of the public repository. Check the generated page for those details before each push.

For a new city, add its page beside `harbin.html`, link it from `2027-china-korea/index.html`, and include `<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">` in every published HTML page. Preserve the root `index.html` entry. Commit and push the site repository, then confirm the GitHub Pages deployment and the city URL.

GitHub Pages project paths cannot supply a host-root `robots.txt`. The repository's `robots.txt` records the intended GPTBot and OAI-SearchBot policy for a future root domain; on the current project URL, the HTML `noindex` tags are the effective search indexing signal. Neither can enforce privacy against a crawler that ignores them. Keep private data out of the published files.
