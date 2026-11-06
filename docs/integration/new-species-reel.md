# Is it a new species?

The Archivist’s fourth field note opens with a real isopod filmed above the seafloor during NOAA’s September 10, 2026 dive off American Samoa. NOAA’s dive report says the animal may represent a new species. The Reel asks what evidence a viewer would want to compare before making that claim. [NOAA Dive 11](https://oceanexplorer.noaa.gov/dive-11-ex2606/)

The September date stays on screen. A separate card refers to NOAA’s November 2–16 demonstration off Hawaiʻi, where the agency is testing untethered vehicles for mapping, imaging and collecting samples. [NOAA November trial plan](https://oceanexplorer.noaa.gov/expedition/ex2701/)

NOAA Ocean Exploration identifies its material as public domain unless a credit says otherwise and permits credited redistribution. The source item credits NOAA Ocean Exploration and the 2026 American Samoa ROV + Mapping Exploration expedition. The reviewed excerpt shows the isopod and seafloor. The edit retains the whole source frame, removes the audio track and adds independent SoE commentary and full credit. This review covers the exact informational edit in Clips under the publisher’s unqualified reuse permission. Promotional use, agency marks and endorsement claims are outside this review. [NOAA Ocean Exploration reuse terms](https://oceanexplorer.noaa.gov/faqs/) · [NOAA imagery guidance](https://www.omao.noaa.gov/image-licensing-usage-info)

The export is a 20-second portrait video with four timed captions. The web player and phone resource manifests bind the exact silent file. The public Reel page includes the transcript, both source references and an online Circle link that carries the question. [Local verification](new-species-reel-verification.json)

To reproduce the edit, place the publisher’s MP4 at verification/web/evidence/source-media/noaa-ex2606-dive11-isopod-source.mp4. The recipe verifies its hash, samples its 30000/1001 frame clock at normal speed and checks the finished encode.

    python3 -B verification/web/scripts/render-paranal-reel.py reel-isopod-next --clip new-species
