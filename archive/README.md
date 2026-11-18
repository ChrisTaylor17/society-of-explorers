# Archive: early Society of Explorers versions

These are early versions of Society of Explorers that were kept only on Chris's Mac. They are reference copies for safekeeping. Nothing in this folder is built, run or deployed, and the `recovery/all-versions` branch is not meant to be built or deployed either.

All of them use the dark and gold design: a near-black background (`#080808`), gold trim (`#c8a84b`) and Garamond type. The earliest is `dark-gold-v1`.

| Folder | What it is | Date |
| --- | --- | --- |
| `dark-gold-v1/` | Five single-file web pages titled "Society of Explorers — The Salon of Great Minds". The first dark and gold version, made before the app existed. | March 21, 2026 |
| `salon-2026-03-22/` | The first Next.js Salon: page source, components and images from commit `ed72ee4`. 24 files. | March 22, 2026 |
| `council-2026-04-06/` | The Council Mode version, where several thinkers answer in turn, from commit `c89e98f`. 74 files. | April 6, 2026 |
| `six-persona-main/` | The six-thinker version at the tip of `main`, from commit `47fecac`. 128 files. | May 17, 2026 |
| `historical-ui-provenance/` | The note and manifest that came with the three snapshots above. The manifest lists every file and its hash. | October 22, 2026 |
| `unverified-hero-images/` | Already in the repository before this archive was added. Not part of it. | |

## The five pages in `dark-gold-v1/`

Each file opens on its own in a browser. They were saved on March 21, 2026 and are listed in the order they were saved. The file names start with the order and the time.

| File | Saved | Size | Came from | Notes |
| --- | --- | --- | --- | --- |
| `1-0917-society-of-explorers.html` | 09:17 | 50,781 bytes | `~/Downloads/society-of-explorers.html` | First version. |
| `2-1026-society-of-explorers_1.html` | 10:26 | 65,101 bytes | `~/Downloads/society-of-explorers_1.html` | Adds a box where a visitor pastes their own AI key. |
| `3-1033-society-of-explorers_2.html` | 10:33 | 66,517 bytes | `~/Downloads/society-of-explorers_2.html` | Same key box. Mentions Aristotle as well. |
| `4-1045-society-of-explorers_3.html` | 10:45 | 63,694 bytes | `~/Downloads/society-of-explorers_3.html` | Same key box. |
| `5-1356-society-of-explorers.html` | 13:56 | 63,396 bytes | `~/Downloads/files/society-of-explorers.html` | Last version of the day. No key box. |

No key is stored in any of these files. The key box only holds what a visitor types while the page is open.

## The three snapshots

Codex exported `salon-2026-03-22`, `council-2026-04-06` and `six-persona-main` on October 22, 2026 from exact commits in this repository and checked every file by hash. They hold the look of each version: pages, components, styles and images. They are not complete apps and will not run on their own. The full code and history for those commits is already in this repository.

They are copied here unchanged from `~/Codex-Preservation-20261022-4uqw00b1/historical-ui-20261022-5hug2mw7/`.

## What was left out

- The `supplemental-current-font-cache` folder from the snapshot package. Its font files come from a later build and their origin for these versions is not confirmed.
- No `.env` files, keys, wallet files, `node_modules` or member data were in the sources, and none are here.

One thing to know: `salon-2026-03-22/app/join/page.tsx` shows the founder's contact e-mail address, as it did in the original commit.
