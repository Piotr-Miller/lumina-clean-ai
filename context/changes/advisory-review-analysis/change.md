---
change_id: advisory-review-analysis
title: "Judge from recorded results whether advisory AI review is worth continuing"
status: new
created: 2026-10-17
updated: 2026-10-17
archived_at: null
---

## Notes

Analyse the finder results already recorded, with a $0 budget for new model calls, and decide whether advisory AI review is worth continuing. Count concrete bugs worth fixing, false alarms, duplicates and minor remarks across the existing finder gates. The main question for glm-5.3 low (owner accepted 55 of 60 published findings; D2 in 1 of 9 valid #269 runs; provisional $6.556540/month): how many accepted findings actually justified a fix. A finding can be true without being worth the author's time. Output: a recommendation of one candidate, or of ending the work, plus proposed pre-registered criteria for a possible on-demand pilot. A paid pilot is decided only after this analysis. D2 becomes a reported weakness, not a veto that rejects a model on its own. Predecessors: finder-glm-5-3 (archive on the unmerged branch feat/finder-glm-5-3, commit ac6bbb1) and finder-glm-5-3-high (unmerged branch feat/finder-glm-5-3-high, archive commit 6d5a09a; PR #295 closed unmerged).
