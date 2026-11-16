# Startup performance, 16 November 2026

Production before this change serves a 2,374,258-byte shared CSS file (338,526
bytes over gzip) and a 1,109,943-byte App module (338,626 bytes over gzip).
Static hashed assets already have gzip and an immutable one-year browser cache.
These are asset sizes, not measurements of full-page load time.

## Changes

- Serve the existing four font families from `/assets/fonts/` on the platform,
  with Unicode subsets, variable weights, `font-display: swap`, and the original
  SIL licenses. Preload only Manrope Cyrillic and Latin (38,884 bytes together).
  Opening the cabinet no longer requires a Google Fonts stylesheet and font CDN
  connection. Content-hashed font filenames use the existing asset cache.
- Download optional student profiles and chest animations only when opened.
  Weekly recaps have a separate loading boundary; the teacher cabinet does not
  download them. These boundaries do not hide the call or editor while loading.
- Load the student home overview as a separate section.
- Use a 96-pixel transparent WebP thumbnail for small chest icons in mock exam
  progress: 9,534 bytes instead of the original 161,917 bytes. The 512-pixel
  source remains available for large displays and animations.

## Scope

No application process restart, API behavior, student solutions, lesson timers,
payments, call settings, or recording settings are part of this change. The
large shared stylesheet remains a separate future refactor; it was not purged
by matching selectors, which could remove conditional lesson styles.
