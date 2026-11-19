# Which height are we measuring?

The Archivist’s third field note compares two measurements reported for Kīlauea’s October 17, 2026 eruption. The plume rose about 25,000 feet above sea level. The lava fountain at the north vent reached just over 700 feet earlier that morning. The Reel asks viewers to identify what was measured and where the measurement started. [USGS eruption report](https://www.usgs.gov/media/videos/october-17-2026-video-kilauea-summit-lava-fountaining-episode-55)

The footage is James Lee’s archive view of Kīlauea, listed on Pexels in August 2025. It illustrates the difference between the fountain and plume. The archive label and credit stay visible. The date and measurements come from the separate USGS report. The edit keeps the portrait frame whole and adds four cards of original commentary and timed text. Both the source and output are silent. [Creator’s footage](https://www.pexels.com/video/kilauea-volcano-eruption-in-hawaii-33378632/)

The Pexels License permits worldwide commercial use of creative adaptations and excludes standalone stock distribution and political uses. The reviewed use is the exact educational Reel with its source and license credit. The source file is retained for verification and the catalog serves the finished edit. USGS footage is linked as a reference. USGS’s public-domain policy describes U.S. use and explains that foreign rights can differ. [Pexels terms](https://www.pexels.com/terms-of-service/) · [USGS rights policy](https://www.usgs.gov/data-management/data-licensing)

The web player links both the creator’s source and the USGS report and offers a path into online Circles. The iOS and Android resource lists package the same silent video and carry the exact transcript and credits. [Verification](which-height-reel-verification.json)

The render recipe pins the exact publisher file and its SHA-256. Place those bytes in the private, deployment-excluded `verification/web/evidence/source-media/pexels-33378632-source.mp4` before rendering. The review keeps the approved encode and records the source frame mapping. Local re-encodes can produce different file hashes.

    python3 -B verification/web/scripts/render-paranal-reel.py reel-lava-next --clip which-height
