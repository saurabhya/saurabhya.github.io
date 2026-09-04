# Photos

Drop image files here, then list them in `_data/photos.yml`.

Folder convention (the category is just for tidiness — what shows up on the page
is controlled by the `category` field in `_data/photos.yml`):

```
assets/img/photos/
├── sketches/    # fountain-pen drawings
└── places/      # travel / city / running snapshots
```

For every image you add, append an entry to `_data/photos.yml`:

```yaml
- src: places/munnar-sunrise.jpg
  category: places
  caption: First light over the Munnar tea estates.
  place: Munnar, Kerala
  date: Jan 2025
```

Tips:

- Keep images under ~600 KB. JPEGs at 1600 px on the long side look great and
  load fast. `cwebp` or `magick mogrify -resize 1600x -quality 82` works well.
- The page sorts entries newest first by `date`; any free-form string works
  (`"Mar 2025"`, `"2025-03-01"`, etc.).
- New categories: add to the `categories:` list in `_data/photos.yml`.
