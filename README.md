# ورتّل — Quran learning data

This repository collects carefully reviewed Quran-related data and creative assets for the ورتّل app. It is a data-contribution repository, not a copy of the React application.

[Try the app](https://quran-repeat.vercel.app/) · [Propose a change](https://github.com/mrhili/quran-repeat/issues) · [Developer on GitHub](https://github.com/mrhili)

## Why this project needs you

ورتّل helps people return to the Quran through reading, memorization, listening, comparison, discovery, and reflection. Software can present an ayah, but it cannot decide alone whether two ayat are genuinely helpful to compare, whether a distractor teaches or confuses, whether a topic is responsibly named, or whether a visual design protects the legibility of the Quranic text.

That is why this repository welcomes different kinds of contributors. A small, well-evidenced correction is more valuable than thousands of unreviewed tags. The aim is to help a learner recognize connections and keep studying—not to change the Quranic text to suit a game.

**The short rule:** treat the Quranic text as a verified source; treat rules, topics, search suggestions, audio links, and artwork as reviewed annotations around that source.

## What lives here

The paths mirror the app so reviewed data can be integrated without guessing which copy is authoritative.

| Path | Purpose | How to contribute |
| --- | --- | --- |
| `src/data/metadata.json` | Chapter names and counts | Correct only with a precise source and review |
| `src/data/verses/` | Canonical ayah source files | Corrections only; see the strict text rule below |
| `src/data/quranStructure.json` | Verified chapter, juzʾ, ḥizb, and page index | Reference snapshot; corrections require source review |
| `src/data/challengeRules.json` | Challenge distractors and similarity suggestions | Add focused, justified relationships |
| `src/data/topicMap.json` | Topics, ayah links, horizontal paths, chapter topics | Add well-scoped, navigable connections |
| `src/data/savedSearches.json` | Curated search suggestions | Add useful searches, not duplicates |
| `src/data/audio/` | Chapter-level reciter metadata snapshot | Propose verified corrections; see the build limitation below |
| `src/data/discoveryFeed.json` | Discovery exclusions and background presets | Tune with a learning and readability reason |
| `src/data/verseBackImages.json` | Ayah-to-back-image mapping | Keep each reference paired with its image |
| `public/discovery-images/` | WebP assets referenced by discovery JSON | Include the asset and its source/permission |
| `src/data/cinemaScenes.json` | Cinematic scene designs and templates | Keep the ayah readable on every screen |

The deployed app also has files under `public/` that the browser fetches. Most are **generated copies**, not a second place to edit: for example, source ayah files are packed into chapter JSON, and source challenge rules are normalized for runtime. Do not submit the same edit twice in `src/data/` and generated `public/` files. The maintainer runs the preparation/build process after review. The audio snapshot is intentionally retained as a fallback; `public/audio/` is its browser-facing copy, not a second editorial source. MP3 recordings are streamed from their providers and are not stored here.

## Internal Quran and data rules

1. **One declared edition.** The app currently identifies its text as **قراءة عاصم برواية حفص، الرسم العثماني**, using Quran-Data v2.0. The expected structure is 114 surahs and 6,236 ayat. Do not mix another qirāʾa, riwāya, spelling convention, translation, or numbering scheme into these files. Another edition requires a complete, separately verified text and matching metadata, search, challenge, and display behavior.
2. **Exact references.** A reference is `chapter:ayah`, for example `2:18` or `112:1`. Use valid numeric surah and ayah numbers; `2:181` is not the same as `2:18`. Source filenames such as `002_018.json` are padded for storage, but references in annotations are not.
3. **Canonical text is not a UI state.** Hiding an ayah, erasing words, searching, adding a note, making a challenge, or displaying an excerpt must never alter the source Arabic or its verse identity. A proposed text or metadata correction needs the exact reference, the present value, the proposed value, an authoritative source, and human review before merge.
4. **Juzʾ, ḥizb, and page positions are edition-sensitive.** Do not infer boundaries from a different printed mushaf or dataset. Explain which structure source you checked and verify the adjacent ayat as well as the proposed boundary.
5. **Evidence and restraint.** A topic or similarity link is an aid to study, not a claim that two ayat mean the same thing. Describe the relationship precisely; avoid speculative theological conclusions or labels that erase context.

### Challenge rules: teaching without predictability

`src/data/challengeRules.json` has `chapters` and `verses` sections:

```json
{
  "chapters": {
    "55": { "blocked": ["55:13", "55:16"] }
  },
  "verses": {
    "2:18": {
      "recommended": ["2:171"],
      "blocked": ["2:181"]
    }
  }
}
```

- A **chapter-level `blocked`** reference is excluded as a *wrong option* throughout that chapter's normal fun challenge. It does not delete the ayah or prevent that ayah from being the correct answer to its own question. This is useful for repeated wording that would otherwise make the choice unfair.
- A verse-level `recommended` reference is a useful potential distractor. Challenge selection currently treats verse-level relationships **reciprocally**: listing `2:171` under `2:18` can affect the reverse challenge without a second entry. Recommended options are randomized and are **not guaranteed every round**. The correct option's position must remain unpredictable.
- A verse-level `blocked` reference prevents that wrong option for the target; reciprocal verse-level blocking is also recognized. Never add the target itself as its own distractor.
- The Home **المتشابهات** comparison list reads **direct** `recommended` entries; it does not automatically display reverse-only links. `blocked` entries never become similarity comparisons.
- Put each reference in a list once. Keep keys and references orderly; normalization can merge duplicate JSON keys, but a contribution should not depend on that rescue behavior.

Explain *why* a pair helps memorization (shared opening, close wording, changed ending, similar story context, and so on). If the pair merely has identical repeated wording and makes the challenge ambiguous, say so and consider a block instead.

### Topics and horizontal paths

`topicMap.json` contains `topics`, `chains`, and `chapterTopics`. A topic has a stable `id`, readable Arabic `name`, optional `description` and `parentTopicId`, and a `verses` list. A chain has an ordered `verses` list and optional manually added `topicIds`.

- In the local Reading builder, choosing two ayat in one surah (for example `2:3` and `2:7`) creates the **complete contiguous range** `2:3` through `2:7`; it is not a two-point shortcut. A one-ayah path is possible when intentionally confirmed.
- Do not create a new path containing an ayah already assigned to another path. Older overlaps may exist and are preserved for review, but new tangled paths are blocked.
- A path's effective topics are its manual topic IDs **plus the current topics of its ayat**. A chapter inherits current topics from its ayat and paths, plus any manual chapter topics. Inheritance is computed dynamically: do not copy inherited IDs into a chain or chapter as if they were permanent manual tags.
- Topic names, nesting, and verse links should be specific enough to help someone navigate. When in doubt, propose a smaller connection with an explanation rather than a broad tag on many ayat.

### Discovery, images, and cinematic design

`discoveryFeed.json` controls exact excluded ayat, excluded chapters, and enabled backgrounds. Its exclusions are **absolute for the discovery feed**; they are not the challenge's `blocked` rules. `verseBackImages.json` maps an ayah reference to an image ID. Every mapped image must exist under `public/discovery-images/`, and the JSON path must look like `/discovery-images/image-name.webp`. This folder is empty until the first image is approved; a `.gitkeep` can preserve it in Git meanwhile.

An upright image around **1080 × 1920 px** is a useful starting point, not a hard requirement. Background images fill the card and can crop at the edges; back images are shown whole and may have margins. Test both behaviors on a narrow phone and desktop. The Quran text, its diacritics, and its reference must remain readable. Use a verified font that supports the actual Uthmani glyphs. Do not rely on a heavy translucent card to fix poor contrast; adjust the image, focal point, text color, and subtle text protection instead.

`cinemaScenes.json` controls cinematic presets; it does not change the ayah text. Prefer lightweight CSS/SVG backgrounds. If proposing YouTube or another third-party visual, verify permission and test a muted, looping background on multiple browsers. Background media must never replace, mute, or compete with Quran recitation. A scene must show the full ayah without scrolling, including long ayat, and respect reduced-motion users where possible.

### Audio metadata

The chapter audio JSON lists reciters and full-surah stream URLs, not MP3 files and not precise ayah timing. Timing for verse-by-verse experiences comes from a separate service; do not claim that a chapter audio entry alone supplies word or ayah timestamps. Before adding or correcting a track, check the reciter's name, riwāya, chapter number, source, and playable link. Do not mix a different recitation into the declared text edition without clearly labelling the difference and obtaining review. Preserve the upstream source and license notice.

**Current maintenance limitation:** the app's `prepare:audio` script fetches upstream metadata during every production build and rewrites the local snapshot. That means a direct edit to `src/data/audio/` can be overwritten. For now, open an issue with the corrected track and evidence rather than assuming a JSON-only audio pull request will survive the next build. Before accepting audio-file contributions, the maintainer should make normal builds use the checked-in snapshot and provide a separate, explicit upstream-refresh command.

## Choose your contribution path

### If you are a designer

1. Propose a background or back image with its purpose, source/usage permission, and the ayat or themes it suits. Supply the WebP asset together with the JSON reference; a screenshot alone cannot be used by the app.
2. Test **360, 390, and 430 px phones** and desktop, light and dark themes, long and short ayat, and visible diacritics. Show screenshots of the real text over the asset, not a placeholder paragraph.
3. Keep recitation and text primary. Avoid moving backgrounds, overlays, text shadows, or colors that obscure a letter; provide a reduced-motion alternative for strong animations. State any cropping or focal-point assumptions.

### If you are a Quran researcher or careful reader

1. Start with one exact reference or a small coherent set. Verify surah/ayah numbers and the declared Hafs/Uthmani edition against a trustworthy source; cite it in your proposal.
2. For a similarity, challenge block, topic, or path, explain the educational reason and the surrounding context. Tell us whether a suggested comparison helps discern a difference or whether repeated wording makes a challenge unfair.
3. Review the learner's likely interpretation. Distinguish a memory aid from tafsīr, mark uncertainty, and request a second human review for any change to the canonical Arabic, metadata, juzʾ, or ḥizb boundaries.

### If you are a web developer

1. Help make data safer to edit: propose JSON/schema checks for valid `chapter:ayah` ranges, unique IDs, valid topic links, missing image files, and working audio metadata. Keep diagnostics specific enough for a non-developer contributor to fix.
2. Help keep one editorial source and reproducible generated browser files. In particular, audio should use the checked-in metadata snapshot during normal builds and refresh upstream only through an explicit maintenance action.
3. Report app behavior with a route, browser/device, exact data reference, expected result, and observed result. This repository is data-first; coordinate app-code changes with the maintainer rather than adding an unrelated React rewrite to a data pull request.

### If you are an AI agent or use one

1. **Research, do not invent.** Check the declared edition, exact ayah, upstream data/provenance, and existing nearby rules before suggesting JSON. Provide direct source links and identify any inference or uncertainty.
2. **Validate mechanically.** Parse the JSON; check valid references, duplicates, missing target files, reciprocal challenge consequences, topic-path overlaps, and image/audio assets. Do not silently rewrite many verses or tags.
3. **Ask for human review.** Show a small diff and a plain-language reason for every addition. An agent-generated suggestion is not a Quranic authority; never merge a canonical-text change, doctrinal label, or mass annotation without qualified human verification.

## How to submit a change

1. Check existing issues and data so your proposal does not duplicate an entry. If the intended rule or interpretation is uncertain, open an issue first.
2. Fork the repository and make a focused branch. Edit the **source** JSON and include any referenced image. Avoid unrelated formatting or regenerated files.
3. Confirm the file remains valid JSON. For one file, Node.js can check syntax without installing the app:

   ```bash
   node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')); console.log('JSON valid')" src/data/challengeRules.json
   ```

4. In the pull request, include: exact `chapter:ayah` references, what changed, **why it helps learning**, sources/permissions, whether Quranic text was touched, and screenshots for visual work. Mention any remaining uncertainty.
5. Expect review and iteration. Passing JSON syntax is necessary but not sufficient: the maintainer also checks Quranic accuracy, learning value, accessibility, asset rights, and integration in the live app.

Do not submit user notes, personal progress, API keys, credentials, downloaded MP3 files, or large generated word-cluster/chapter bundles. Do not run the local builders on a public network; their development endpoints can write project data.

## Maintainer, sources, and attribution

- **Developer:** Amine Online ([GitHub: `mrhili`](https://github.com/mrhili)) · [amineonline.vercel.app](https://amineonline.vercel.app/).
- **Live app:** [quran-repeat.vercel.app](https://quran-repeat.vercel.app/).
- **Text and audio dataset:** [Quran-Data v2.0](https://github.com/rn0x/Quran-Data), with its [MIT license and attribution terms](https://github.com/rn0x/Quran-Data/blob/version-2.0/LICENSE). This app's declared text edition is written above; do not assume every external Quran dataset uses the same orthography or numbering.
- **Structure verification:** the project records comparison with [AlQuran Cloud's Uthmani Quran endpoint](https://api.alquran.cloud/v1/quran/quran-uthmani). See [their terms](https://alquran.cloud/terms-and-conditions). A generated structure file is not an invitation to alter boundaries without source review.

**License scope:** original project-authored rules, topic annotations, design configuration, and documentation are offered under the [MIT License](LICENSE). The Quran-Data corpus, AlQuran Cloud-derived structure, remote recordings, translations, and contributed images retain their own applicable terms; the project MIT license does **not** relicense them. Read [third-party notices](THIRD_PARTY_NOTICES.md) and include source/permission details for every new asset.
