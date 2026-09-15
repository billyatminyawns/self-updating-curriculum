# Self-Updating Curriculum — TechLearn 2026 (Austin)

**Live demo:** https://billyatminyawns.github.io/self-updating-curriculum/ (GitHub Pages, served from `docs/`). Works offline too: download `docs/index.html` and open it.

**AI agents that detect drift and re-voice your content.** Billy Sheng (WellSaid Labs) with Continuity Intelligence.
Three deliverables for a 15-minute slot: **slides → live demo (Notion, then the Drift Inbox dashboard) → slides**.

| Piece | Where | Notes |
|---|---|---|
| Slides (9, with timed speaker notes) | `slides/Self-Updating Curriculum - TechLearn 2026.pptx` | Slide 5 holds the full demo script in its notes |
| Drift Inbox dashboard | `docs/index.html` (hosted) · `dist/index.html` (local build) | one file, 34 real WellSaid clips inside; also published as a private Claude artifact |
| Notion hub | Notion page “Self-Updating Curriculum · Drift Inbox (TechLearn 2026 demo)” | Curriculum inventory (status, owner, SME, review dates), Content fixes board (who is working on what), Voice & style standards, Sources of truth, Activity log; audio on every card; deep links to the site |

## The story (fictional, but the pattern is real)

**Alder Mutual**, a regional insurer in Austin, 4,800 employees. **Jordan Ellis**, Senior Instructional Designer, owns five courses. Overnight (Tuesday Sep 15, 2026, 2:00 AM) the agents ran the first full scan of the 212-course library and posted a digest to Slack. Fourteen findings in Jordan's courses:

| Course | Narrator | What drifted |
|---|---|---|
| Working with AI at Alder (Rise, 2024) | Wade C. | AI policy flipped from “prohibited” to approved tools (Copilot, Alder Assist); human review of AI-drafted customer letters; AI Council renamed |
| ClaimsCore: Settling a Total Loss (screencast) | Ava M. | Release 26.3 moved the Payments tab into the Settlement menu; “Hold for Review” → “Pend”; a screen capture needs re-shooting |
| Welcome to Alder: First 90 Days (Storyline) | Sofia H. | Hybrid policy 2 → 3 days; new CEO (plus the old CEO's welcome video); parental leave 12 → 16 weeks (two sources disagree); Concur → Navan |
| Speak Up: Ethics & Reporting (Rise, 2023) | Patrick K. | **Critical:** the hotline number was disconnected Aug 31 |
| Personal Lines Agent Onboarding (path) | Rayna C. | Retired prerequisite; HomeShield Plus → HomeShield Complete |

Human stops built in: F9 waits for a judgment call (conflicting sources), F3 shows the edit-and-re-voice path (Legal's wording is pre-rendered), V1/V2 become tasks (footage and a video of a person can't be re-voiced), the Storyline course hands off to its owner Priya N.

## Run of show (15 minutes)

1. **Slides 1–4** (3 min): the library problem → what drifted this summer → the loop (six agents, one human).
2. **Slide 5, then switch to the browser** (8 min): Notion first (Workflow board → the critical card → play published vs. new take → the judgment card → drag to Published → Sources / Activity), then the Drift Inbox: it opens on the 7:42 AM Slack message → Start with the critical one → play today's line, play the fix, Approve & publish → Next → Edit the wording (Legal's wording, re-record) → Approve all → S for Slack (Priya republishes the Storyline course) → the judgment call → the two tasks → Courses: play the whole updated course.
3. **Slides 6–9** (3 min): what just happened → where the fix goes back (the SCORM answer) → what stays human → bring us one stale course.

Dashboard keys: `→`/`N` next item, `1`/`2` Inbox/Courses, `S` Slack panel, `H` How it works (agents, last night's log, sources, standards, where fixes go back), `T` light/dark (light is the default and matches the Continuity Intelligence dashboard palette), `?` presenter notes, **Reset** back to 7:42 AM. Deep links: `#F11` opens the hotline item, `#courses` the courses view. Zoom the browser to 110–125 % on a 1080p projector. On a 720p projector (1280×720) the three-column layout gets tight: press `S` to hide Slack while you work the inbox, or set the display to 1080p. Light theme (`T`) is there for a washed-out room.

## Palette

The demo (and the deck) use the Continuity Intelligence dashboard palette: pale gray page, white cards, dark slate text, amber for the active item and for drift, red for critical, blue for what changed and for Continuity, green for fixes and WellSaid, purple for things a person has to do. Tokens live at the top of `src/styles.css`; the dark theme is a secondary set under `[data-theme="dark"]`.

## Notion and the site work together

The Notion hub is the team's system of record; the site is the agent's inbox. Every finding card in Notion has **Open in Drift Inbox** (deep link to that item, e.g. `#F11`); every course row has one too (`#course-A`). On the site, each item's Details section links back to its Notion card, the Curriculum inventory and the hub, and the How it works panel links to the Voice & style standards. Same 14 findings, same owners (Jordan Ellis, Priya N.), same voices.

## Voice intelligence

`voice_standards` in `src/content.json` says which WellSaid voice is approved for which content type (Patrick K. external training and compliance, Ava M. internal how-to, Wade C. company policy, Sofia H. onboarding; Rayna C. retired). Each course carries a `standard`; the site shows whether its narrator is approved. A finding can carry `voice_override`, and the fix is then rendered in that voice: the Agent Onboarding path (external training, narrated by the retired Rayna C.) gets its fix in Patrick K. The Notion database *Voice & style standards* holds the same table plus the script style rules and pronunciation library.

## Finding the published course

Every review card's course title is a link to that course's page (`#course-A` … `#course-E`), and every green outcome has **Open the published course**. The course page is framed as the LMS page: an *Alder Learn* breadcrumb, the live version, who republished it and when, then the lines with play buttons (new lines in the approved voice) and the version note. There is no real LMS behind it; the version and time come from what you approved in the demo.

## WellSaid Studio

The demo's audio was rendered through the WellSaid API, which has no notion of Studio projects (its clips endpoint stores rendered clips, not projects). To hold the same lines in Studio, `studio-import/` has one script file per course (one paragraph per section, labelled with segment id, published/fix, and voice) plus a README with the voice to set per project. Import or paste each file into a new Studio project named after the course, set the voice on section 1, and generate.

## Real Slack, optional

The Slack panel in the demo is simulated. To post for real during the talk: in your Slack workspace create a channel (for example `#ld-content-ops`), add an app with an **Incoming Webhook** pointing at it, open the demo's Slack panel (`S`) and paste the webhook URL into **Connect**. From then on every approval, hand-off, task and judgment call the demo posts also lands in the real channel (the built-in panel keeps working offline). The webhook URL is stored only in that browser.

## Does it make sense to export a SCORM file?

Only as the delivery container. The fix belongs in the source, and the package is the new version the LMS receives:
Rise → block audio replaced, republished, uploaded as a new version of the same course (SCORM 1.2/2004 or xAPI) so completions survive;
video → audio track swapped under the same media ID; Storyline → audio is embedded in the .story project, so the takes go to the author for a two-minute swap (a published-package hotfix exists if it can't wait). Material change → the designer chooses notify vs. re-assign, recorded in the version note. The dashboard, the Notion page and slide 7 all say this.

## What is real, what is staged

- All narration is real WellSaid audio (preview model; Wade C. 30, Ava M. 31, Sofia H. 8, Patrick K. 19, Rayna C. 157), rendered ahead of time so the demo works offline. Production renders live, ~2 s per segment.
- Word highlighting uses WellSaid's word-timing endpoint. Agent progress animations run at demo pace.
- Alder Mutual, its people, policies and courses are fictional. Library-wide counts (212 courses, 47 findings) are illustrative.

## Change or rebuild

- Content: `src/content.json` (company, sources, agents, courses/segments, findings, Slack people). `"voice": true` on a segment renders audio; a finding's `fixed` gets a second take, `alt` a third; `status` `review`/`task` control the human stops.
- Page: `src/index.html`, `src/styles.css`, `src/app.js`. Build: `python3 build.py` → `docs/index.html` (standalone, what GitHub Pages serves) + `dist/index.html` (local copy) + `dist/artifact.html` (fragment for the Claude artifact). Push `docs/` to publish.
- Audio: `python3 scripts/render_audio.py` (missing clips; a finding's `voice_override.speaker_id` is used for its fix) · `--only=A3_orig,A3_fix` · `--force`. Uses the REST API directly (`scripts/wellsaid_api.py`, key from `../wellsaid-connector/.env`) so the `preview` model is available. `TTS_SUBS` spells out `AI`, `ClaimsCore`, `HomeShield`, `401(k)`; speech-to-text transcripts land in `audio/timing/` and are the fast way to catch a mispronunciation.
- Slides: `slides/build_deck.js` (pptxgenjs; run with `NODE_PATH` pointing at a node_modules that has pptxgenjs). Speaker notes carry the timings.
- Preview: `python3 serve.py 4833`.
- The slide deck (`slides/`), the first slide-style version (`archive/`) and the raw WAV masters (`audio/raw/`) live only in the local folder, not in this repo.
