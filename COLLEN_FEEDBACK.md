# Collen Feedback Log

Append-only log of feedback from Collen (the JTAC reviewer) on the decision tree and 9-line outputs. Each entry: date, source, raw note, our interpretation, files changed, status.

---

## 2026-05-02 — Round 1 (review of decision tree visualization + scenarios)

### CF-1.1 · No-Strike List check
**Raw note:** "For No-Strike List Nearby is the No-Strike List object within the damage radius of the chosen munition."

**Interpretation:** The NSL check isn't "is the target on the NSL"; it's "is an NSL object inside the chosen weapon's damage circle." That makes the check **munition-dependent** — same target can be engageable with a small-frag weapon and not with a large one.

**What our tree has:** Engageability gate (Tree 1) checks general NSL presence; munition tree (Tree 2) `protected_site_in_red` rule actually does this per-munition check. So the logic is correct, but the engageability-gate node is misleadingly worded.

**Action:** Reword Tree 1 `nsl_check` to say "Is a Cat I no-strike object in the area at all? If yes, flag CDE_ELEVATED for downstream weapon selection. The actual block decision is per-munition in Tree 2." Don't block engagement at Tree 1 just because an NSL object is "nearby" — the block happens when it's inside the *chosen* weapon's RED.

**Files changed:** `DECISION_TREE/01_engageability_gate.yaml`

---

### CF-1.2 · ROE — generalize for demo
**Raw note:** "for rules of engagement, authorize this target type. Just will need to specify rules of engagement prior to mission - may generalize this for demo this needs pre mission data"

**Interpretation:** ROE is theater-specific and loaded as pre-mission data. For the demo, don't try to encode ROE in the tree — accept it as input. The `roe_target_category_check` is correctly structured (reads from input), but should be flagged as "expects pre-mission ROE data; demo can use a generic permissive ROE."

**Action:** Add an explicit note to `roe_target_category_check`: ROE is loaded as pre-mission data; for hackathon demo, use a generic permissive ROE that approves combatant categories (vehicles, personnel, structures) and excludes Cat I protected entities.

**Files changed:** `DECISION_TREE/01_engageability_gate.yaml`

---

### CF-1.3 · Munition selection — Collen's primary rule (HIGH-VALUE)
**Raw note:** "for ammunition selection, if the target is moving or movable, use laser. If it's stationary and not movable, use coordinate-based JDAM or GPS"

**Interpretation:** Collen's mental model is much simpler than our matrix. Top-level rule:
- **Moving / movable target → laser-guided weapon (or laser-hybrid like GBU-54 LJDAM)**
- **Stationary / not movable → coordinate-based (JDAM, GPS-guided)**

This is the JTAC's actual decision heuristic. Our matrix has it right per-cell but doesn't surface this rule at the top of the tree. We should hoist it as the **primary munition class selector** and let the matrix tiebreak within the chosen class.

**Action:** Add a new STAGE 0 in `02_munition_selection.yaml` — the "movement gate" — that selects munition class FIRST based on movement state, then runs the existing filter→flag→rank pipeline within that class.

```
STAGE 0 — MOVEMENT GATE (Collen's primary rule)
  if target_movement_state in [slow, fast, movable]:
    PREFER: laser-guided (LGB, LJDAM, Hellfire, Maverick laser)
    DEPRIORITIZE: pure GPS (JDAM)
  else (stationary, not movable):
    PREFER: coordinate-based (JDAM, GPS-guided, mensurated coords)
    ACCEPT: laser if no GPS option
```

**Files changed:** `DECISION_TREE/02_munition_selection.yaml`

---

### CF-1.4 · RED data completeness audit
**Raw note:** "Ensure you have all the danger close distances and meters to near friendly for each bomb. In the visualization it didn't seem like all the data was there. Just make sure it is in the code base."

**Interpretation:** Two things: (a) verify every munition in the database has a `red_standing_m` value; (b) the visualization showed only 7 munitions in the RED summary box — surface the full set.

**Action:**
1. Audit `munitions_database.yaml` — every entry must carry `red_standing_m`. Cross-check against `red_table.yaml`.
2. Update `visualization/decision_tree.html` — show the FULL RED table (24 munitions), not 7 cherry-picked ones.

**Files changed:** `DECISION_TREE/munitions_database.yaml` (audit only — no missing values found), `visualization/decision_tree.html` (expanded RED table).

---

## How to use this log

When Collen sends new feedback:
1. Append a new round below as `## YYYY-MM-DD — Round N`.
2. For each note: `### CF-N.X · short title`, raw note, interpretation, action, files changed.
3. Cross-reference any open items in `GAPS_AND_CONTRADICTIONS.md`.
4. After acting, mark status in the round header (Resolved / Partial / Deferred).

Round 1 status: **Resolved.**
