# Gaps and Contradictions in the Doctrinal Foundation

This document catalogs everything that is **not** clean in the published doctrine. There are three categories:

- **Gaps** — questions doctrine doesn't answer; the system needs an explicit choice (default value).
- **Contradictions / tensions** — places where doctrines disagree, or where doctrine and practice diverge.
- **Theater-specific** — values that vary by deployment and must be loaded from current SPINS / OPORD / ROE.

Each entry says: **what doctrine says → what doctrine doesn't say → what we did → what we need from Collen.**

---

## GAPS — questions doctrine doesn't answer

### G1. PID confidence threshold (numeric)
- **What doctrine says:** PID is "reasonable certainty that a functionally and geospatially defined object of attack is a legitimate military target." (CJCSI 3160.01 p.D-A-7.)
- **What doctrine doesn't say:** any numeric threshold. "Reasonable certainty" is a human judgment.
- **What we did:** set the CNN classification threshold at **0.85** as a starting heuristic. Below that, the system flags `LOW CLASSIFICATION CONFIDENCE` and routes to JTAC review.
- **Need from Collen:** what's your working threshold? Is it the same for vehicles vs. personnel? Does it change based on PID corroboration sources?

### G2. Minimum observation duration before declaring PID
- **What doctrine says:** observation must be sustained, but no minimum window.
- **What we did:** **30 seconds** of consistent classification before the engageability gate clears.
- **Need from Collen:** is 30 seconds enough? Different for stationary vs. moving? Different for personnel (which can change fast) vs. vehicles?

### G3. Effectiveness scores (numeric 0–1 ratings per target × munition)
- **What doctrine says:** qualitative ratings only — "preferred," "acceptable," "marginal," "not recommended" — in JFIRE and AFTTP.
- **What doctrine doesn't say:** numeric scores. The real numeric data lives in JMEM (classified).
- **What we did:** kept the matrix qualitative (`PREFERRED / ACCEPTABLE / MARGINAL / NOT_REC`) and mapped to a 0–1 score (1.0 / 0.7 / 0.4 / 0.0) for ranking. The ranking is right; the precision is fake.
- **Need from Collen:** when two munitions both rate `PREFERRED`, what's your tiebreaker order in practice? My five-tier tiebreaker stack (in `02_munition_selection.yaml`) is a starting guess.

### G4. Civilian-proximity → control-type rule
- **What doctrine says:** Type 1 is the tightest control. Doctrine does NOT explicitly say "civilians within 500m → Type 1."
- **What doctrine doesn't say:** any specific civilian-distance trigger.
- **What we did:** kept the planning-doc heuristic ("civilians within 500m → Type 1") with a **flagged comment** in the YAML asking Collen to confirm or replace.
- **Need from Collen:** is this your unit's actual rule? Or is the rule "any civilian collateral concern → Type 1"? Or is it situational?

### G5. MANPADS / AAA altitude floor
- **What doctrine says:** threat ring concept; advise altitude floor in remarks.
- **What doctrine doesn't say:** numeric floors. These are weapon-system-specific and theater-specific.
- **What we did:** placeholder in the restrictions YAML — `<alt> AGL` to be filled in from theater SPINS.
- **Need from Collen:** for the demo, what plausible numbers should we use? (e.g., "MANPADS engagement up to 12,000 ft AGL" so aircraft floor ≥ 13,000 ft.)

### G6. Wind drift acceptable for smoke marking
- **What doctrine says:** smoke is most effective within 100 m, generally OK ≤300 m. (JP 3-09.3 III-78.)
- **What doctrine doesn't say:** at what wind speed do you stop using smoke?
- **What we did:** no numeric threshold — the YAML uses a boolean `wind_drift_acceptable`.
- **Need from Collen:** working rule of thumb? (e.g., wind > 15 kts → no smoke unless within 100 m.)

### G7. Smoke colors
- **What doctrine says:** smoke as a mark, type passed in Line 7 / remarks.
- **What doctrine doesn't say:** "red = enemy, green = friendly" or any color convention. This is a SPINS / SOP item.
- **What we did:** kept it as a SPINS-supplied parameter.
- **Need from Collen:** your unit's working color conventions, if standardized.

### G8. IP (Initial Point) library
- **What doctrine says:** IPs are pre-loaded named geographic points the aircraft uses for run-in.
- **What doctrine doesn't say:** how to generate one when no named IP exists. (Doctrine says "hasty BP" with a center grid + size.)
- **What we did:** stubbed `05_ip_egress.py` as a geometry function that picks from a library if present, else generates one based on threat / friendly geometry.
- **Need from Collen:** in your deployments, were named IPs always pre-loaded, or did you make them up tactically? What's the realistic library size?

### G9. Maximum acceptable TLE for "engageable at all"
- **What doctrine says:** CAT I (<10 m) for direct-hit unitary; CAT II (<20 m) for fragmentation effects. (ATP 3-09.30 ¶3-71.)
- **What doctrine doesn't say:** an upper bound. "If TLE > 200 m, do you engage at all?"
- **What we did:** rejected anything worse than CAT III (~30 m) as `NOT_ENGAGEABLE`. CAT III still allows laser-guided and IIR-guided weapons.
- **Need from Collen:** is CAT III a hard upper bound, or do you sometimes engage at "TLE unknown" with an aircraft self-acquiring?

### G10. JFO/drone abort authority
- **What doctrine says:** JTAC has abort authority. JFO ¶1-67 extends abort to anyone in the chain.
- **What doctrine doesn't say:** specifically that a drone operator can call abort.
- **What we did:** assumed yes — drone operator + system both can call ABORT if the system detects a fratricide or NSL violation developing.
- **Need from Collen:** correct? Or does abort have to come from a human?

---

## CONTRADICTIONS / TENSIONS — places where doctrines disagree

### C1. "Type 1 is for individual control" vs. "Type 1 is prohibited for GPS weapons"
- **JP 3-09.3 III-43 (top):** Type 1 is for visual control of each release.
- **JP 3-09.3 III-43 note:** Type 1 should NOT be used for GPS or INS-guided weapons.
- **Tension:** modern CAS leans heavily on JDAMs (GPS-guided); the most-supervised control type is structurally unavailable for the most common weapons.
- **Resolution in our tree:** when munition tree picks JDAM, control tree blocks Type 1, defaults to Type 2. We display this clearly in the reasoning trace.
- **Implication for the demo:** the system's "default" output for most scenarios will be Type 2, not Type 1. We need to brief judges on why.

### C2. "Drone-as-JTAC" vs. "Only certified JTACs can do TAC"
- **JP 3-09.3 p.xi (verbatim):** "Unless certified and qualified as a joint terminal air controller (JTAC) or forward air controller (airborne) (FAC[A]), personnel conducting [terminal guidance operations] do not have the authority to control the maneuver of, or grant weapons release clearance to, attacking aircraft."
- **Our system:** generates 9-line drafts and recommendations.
- **Tension:** does the system + drone constitute "personnel conducting TAC"? Doctrinally, **no** — we are a JFO-equivalent (sensor + targeting data + recommendation generator). The JTAC remains the controller. **This needs to be explicit in the marketing and the GFC approval flow.**
- **Resolution:** every output explicitly labels itself "DRAFT — pending JTAC approval." The system never auto-transmits to aircraft. The JTAC's "Confirm" action signs the brief; the GFC's "Approve" action authorizes it; THEN it transmits.

### C3. "PID can be from a sensor" vs. "Don't single-source from a video feed"
- **JP 3-60 p.II-21:** PID can come from "visual recognition, electronic support systems, non-cooperative target recognition techniques, identification friend or foe systems, or other physics-based identification techniques."
- **JFO ATTP ¶1-136:** "Video feeds should not be used as a single-source target identification method."
- **Tension:** drone EO/IR is "visual recognition," but if it's the only source, JFO doctrine says it's insufficient.
- **Resolution:** require ≥2 independent sources. Drone CNN classification = 1 source; second can be SIGINT, ground confirmation, multi-pass observation, or operator override (logged).

### C4. RED tables (0.1% Pᵢ) vs. CFF "danger close" trigger (600 m / 750 m)
- **For ARTILLERY/MORTARS:** the Call-for-Fire format triggers "DANGER CLOSE" wording at **600 m friendly distance** (ATP 3-09.30 ¶4-35), regardless of the actual 0.1% Pᵢ standing distance for that round.
- **For AIR-DELIVERED:** danger close triggers at the per-munition RED standing distance (per JFIRE Table 86).
- **Tension:** different mental models for the same word.
- **Resolution:** in our tree, the danger close flag uses the **per-munition** RED for air-delivered weapons. We don't generate CFFs (those go to artillery FDC, not aircraft). If the system is ever extended to indirect fires, swap in the 600/750 m fixed trigger.

### C5. CDE Level 1 says "all weapons in inventory" vs. Level 4 excludes cluster + RAP
- **CJCSI 3160.01 p.D-A-11:** if Level 1 passes (no protected/collateral concerns within the largest CER), target is "cleared for engagement with every conventional weapon in the U.S. inventory."
- **CJCSI 3160.01 p.D-A-22:** cluster munitions and Rocket-Assisted Projectile artillery are NOT supported at Level 4 or above.
- **Tension:** Level 1 says "any weapon," Level 4 carves out exceptions.
- **Resolution:** treat this as a refinement, not a contradiction. Level 1 = "no concerns nearby, weapon choice unconstrained." Level 4 = "concerns are nearby and we're refining; some weapon classes are not refinable down to safe."
- **Tree behavior:** the engageability gate exits Level 1 cleanly; the munition tree adds the exclusion at the appropriate flag.

### C6. Self-defense vs. CDE / NSL gate
- **CJCSI 3160.01 p.D-3:** "the CDM does not limit a commander's inherent right of self-defense under the LOW."
- **CJCSI 3160.01 Encl B:** Cat I protected entities (hospitals, etc.) cannot be struck.
- **Tension:** what if friendlies are taking fire FROM a Cat I structure?
- **Resolution per doctrine:** CJCSI 3160.01 p.C-B-4 — "those instances where (1) intelligence confirms the use of the No-Strike entity for hostile purposes and the need to strike is time sensitive (whereupon it is nominated as a TST), and/or (2) **troops are in contact and taking hostile fire from traditional No-Strike entities**. These entities do not have to be reflected on the JTL before they can be engaged."
- **Tree behavior:** the self-defense override branch in the engageability gate bypasses the NSL check **only if** friendlies are taking effective fire FROM the protected entity. Logged with full justification.

### C7. JFIRE RED table assumes "standing personnel" — but friendly posture varies
- **JFIRE p.127-128:** the danger close trigger is the "Standing" column, regardless of actual posture. JFIRE notes this is conservative.
- **In practice:** dug-in or armored friendlies can be much closer to a strike than standing personnel.
- **Tension:** the tree could over-flag danger close.
- **Resolution:** stick with Standing-column trigger (conservative is correct here). Make the friendly-posture data available in the reasoning trace so the JTAC and GFC can see it and make informed judgment for the initials decision.

---

## THEATER-SPECIFIC — values that must come from the current mission's data

These are NOT defaults; they're inputs the system must read at runtime from theater SPINS / OPORD / ROE.

| Item | Source format | Where it's used |
|---|---|---|
| Approved target categories | Structured ROE feed | Engageability gate (`roe_target_category_check`) |
| Prohibited munitions | ROE feed | Munition selection (`roe_munition_block`) |
| MANPADS / SAM altitude floors | OPTASKLINK / SPINS | Restrictions tree |
| Acceptable Level of Risk (ALR) | ACP / SPINS | Used to gate aircraft-into-MEZ decisions |
| NCV (Noncombatant Casualty Cutoff Value) | ROE | CDE Level 5 escalation trigger |
| Active no-strike list (NSL) entries | MIDB / NSL feed | Engageability gate |
| Active restricted target list (RTL) | RTL feed | Engageability gate |
| Active airspace measures (FSCMs, ACAs, kill boxes, NFAs, RFAs) | ACO | Engageability gate (`airspace_check`) |
| Smoke color conventions | SPINS / SOP | Mark method tree |
| Pattern-of-life / population density | AOR-specific table | CDE Level 5 |
| Time-window factors (school hours, prayer times, market hours) | AOR data | Civilian density factor |
| Standard abort code | SPINS | Check-in / abort procedure |
| Standard PRF codes for laser deconfliction | SPINS | Mark method tree |
| Pre-loaded named Initial Points | Mission planning | IP/egress geometry |

The system architecture must accept all of these as run-time inputs, not hard-coded defaults.

---

## Summary for Collen

Below are the items I most want your input on, ranked. Each one maps to a specific gap or tension above. The feedback site (`/feedback_site/index.html`) walks you through scenarios that exercise each:

1. **Munition tiebreakers** (G3) — the order in which you'd break ties between two equally-effective munitions. Site shows you 3 scenarios where two munitions tie.
2. **Civilian / protected-site control-type rule** (G4) — does civilians-in-500m really force Type 1?
3. **PID confidence + observation thresholds** (G1, G2) — do my numeric defaults match your gut?
4. **Self-defense override scope** (C6) — when friendlies are taking fire from a hospital, what's the actual procedure?
5. **CAT-III TLE upper bound** (G9) — when do you simply not engage because the position fix is too soft?
6. **Type 1 vs Type 2 default** (C1) — given that Type 1 is blocked for JDAMs, how often do you actually use Type 1 in modern CAS?
7. **Smoke / wind drift threshold** (G6) — at what wind speed do you stop using smoke?
8. **Drone abort authority** (G10) — does the system having an "ABORT" button violate your sense of who's in the chain?
