# saurabhya.github.io

Personal site of [Saurabh Yadav](https://saurabhya.github.io). Custom Jekyll, no
heavy theme — just hand-written layouts, a bit of SCSS, and a tiny JS for the
light/dark toggle.

## Structure

```
.
├── _config.yml          # Jekyll config (nav, plugins, pagination)
├── _data/
│   └── photos.yml       # entries for the /misc/ photo gallery
├── _includes/           # head, header, footer, social
├── _layouts/            # default, home, page, post
├── _pages/              # publications, cv, blog, misc
├── _posts/              # blog posts (Markdown, named YYYY-MM-DD-slug.md)
├── assets/
│   ├── css/style.scss   # main stylesheet (compiled to style.css by Jekyll)
│   ├── js/site.js       # theme toggle, gallery filter, lightbox
│   └── img/
│       ├── prof_pic.jpg
│       ├── darth.png
│       └── photos/      # gallery images, organised by category
├── index.md             # home / about page
└── 404.html
```

## Local development

```bash
bundle install
bundle exec jekyll serve --livereload
```

Then open <http://localhost:4000>.

## Writing a blog post

Drop a Markdown file in `_posts/` named `YYYY-MM-DD-some-slug.md` with this
front matter:

```yaml
---
title: "Post title"
date: 2026-05-02 18:00:00 +0530
description: "Optional one-liner shown above the title."
tags: [research, vim]
---
```

Posts are listed at `/writing/` (paginated, 6 per page) and resolve to URLs like
`/writing/2026/05/02/some-slug/`. The nav still labels this tab "blog" — the path
is `/writing/` because the user already has a `saurabhya/blog` repo and GitHub
Pages would otherwise route `/blog/` to that project's pages.

## Adding photos to /misc/

Drop image files under `assets/img/photos/<category>/` and add an entry to
`_data/photos.yml`. See `assets/img/photos/README.md` for the field reference.

## Deployment

The GitHub Actions workflow at `.github/workflows/jekyll.yml` builds the site
on every push to `main` and deploys to GitHub Pages. Make sure GitHub Pages is
configured to deploy from "GitHub Actions" in repository settings.
