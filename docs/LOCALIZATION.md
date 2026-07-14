# Localization

ImageVault's UI strings live in `public/_locales/<code>/messages.json` and are
resolved with `chrome.i18n` (see `src/ui/i18n.ts`). The browser locale is
followed automatically — there is no in-app language switcher (plan §7). Missing
keys fall back to the default locale (`en`), so a partially translated locale
still works.

## Target locales (8)

Default **English (`en`)**, plus EFIGS (fr, it, de, es), generic Portuguese
(`pt`), Japanese (`ja`), and Traditional Chinese (`zh_TW`). All 90 message keys
are present in every locale.

## Review status

| Locale | Status |
| ------ | ------ |
| en | Source of truth. |
| fr | Author-reviewed (project language). |
| it, de, es, pt | Translated; recommend a light native proofread before 1.0. |
| ja, zh_TW | Translated; **native review required** before store submission (plan §7). |

The store `name` (`extName`, ≤ 75 chars) and `description` (`extDesc`, ≤ 132
chars) are keyword-oriented rather than literal translations. Before publishing,
do a short per-language keyword check (plan §7) and have a native speaker review
the CJK locales.

## Store screenshots (not yet automated)

The plan calls for store images generated from a single HTML/SVG template whose
captions come from these same locale files, rendered to PNG per locale with a
headless browser (Playwright). That pipeline is **not implemented yet** — a
Phase 6 / release task. Until then, store screenshots are produced manually.

## Adding or updating a locale

1. Copy `public/_locales/en/messages.json` to the new `<code>/` folder.
2. Translate each `message`. **Keep the `$PLACEHOLDER$` tokens** (e.g. `$COUNT$`,
   `$ALBUM$`) and the accompanying `placeholders` object exactly.
3. `description` fields are optional in non-default locales (they are translator
   hints) and are omitted here to keep files compact.
4. Run the build; verify the UI in that locale.
