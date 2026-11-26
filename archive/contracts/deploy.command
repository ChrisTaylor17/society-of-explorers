#!/bin/bash
cd /Users/christaylor/society-of-explorers
git add -A
git commit -m "Tighten thinker responses"
git push
vercel --prod --yes
