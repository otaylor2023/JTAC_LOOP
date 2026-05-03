# Decision Tree — Plain-Language Overview

## What this system does, in one paragraph

A drone watches a battlefield. A neural net classifies what it sees and produces GPS coordinates for each detection. Friendly troop positions are also fed in. **This decision tree takes those inputs and produces a draft 9-line CAS brief** — the standardized message a JTAC reads to attacking aircraft. The tree is deterministic: every output traces back to specific rules from specific manuals. The JTAC reviews and approves. Then the Ground Force Commander gives final approval. Then the brief is transmitted.

## The architecture, in plain language

```
DRONE FEED + FRIENDLY POSITIONS + AIRCRAFT-ON-STATION + WEATHER + ROE
                              │
                              ▼
                ┌──────────────────────────────┐
                │  FEATURE EXTRACTION           │
                │  (deterministic functions —    │
                │   no LLM, no model)           │
                │                              │
                │  • distance to nearest        │
                │    friendly                   │
                │  • distance to nearest        │
                │    protected site             │
                │  • target hardness            │
                │  • target movement state      │
                │  • position uncertainty bin   │
                │  • civilian density estimate  │
                │  • active airspace gates      │
                └──────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────────┐
        │     6 DECISION SUB-TREES (in sequence)      │
        ├─────────────────────────────────────────────┤
        │  1. Engageability gate                      │
        │     "Can we even consider this target?"     │
        │  2. Munition selection                      │
        │     "Which weapons are viable + ranked"     │
        │  3. Control type (Type 1/2/3)               │
        │     "How tightly does the JTAC supervise?"  │
        │  4. Mark method                             │
        │     "How will the pilot find the target?"   │
        │  5. IP / egress geometry                    │
        │     "Where does the aircraft fly from/to?"  │
        │  6. Restriction enumeration                 │
        │     "What does the pilot need to NOT do?"   │
        └─────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────────┐
        │  COMPOSE 9-LINE  (top recommendation        │
        │  + 2 alternatives + reasoning trace)        │
        └─────────────────────────────────────────────┘
                              │
                              ▼
                   JTAC: Confirm / Alter / Deny
                              │
                              ▼
                   GFC: Approve / Reject
                              │
                              ▼
                  Transmit to aircraft
```

## Why deterministic instead of an LLM

| Concern | LLM | Deterministic tree |
|---|---|---|
| Auditable per-rule? | No — opaque | Yes — every output traces to specific tree nodes |
| Hallucinations? | Possible | Impossible (nothing is generated) |
| Compute cost on edge device? | High | Trivial |
| Trust from operators (JTACs, GFCs)? | Low (black box) | High (matches their mental model) |
| Handles novel situations? | Tries to | Routes to "JTAC review required" — fails safely |
| Improvable with feedback? | Retraining | Edit YAML, re-run regression tests |

The LLM stays in our back pocket for a single optional purpose: turning the tree's structured reasoning trace into a natural-language paragraph for the JTAC. It never decides; it explains.

## Key doctrinal anchors that drive the tree's structure

These are the load-bearing rules. If you change one, much of the tree shifts.

### 1. Our drone is doctrinally a JFO, not a JTAC
A Joint Fires Observer feeds targeting data and marks targets, but cannot independently terminate a CAS attack. (JFO ATTP ¶1-3, ¶1-9.) **So our system's output is a draft brief for a JTAC, not a strike order.** This is not a limitation — it's the legal and doctrinal frame that lets the system exist.

### 2. PID cannot be single-source from drone video alone
"Video feeds should not be used as a single-source target identification method." (JFO ATTP ¶1-136.) **Engageability gate must require a second corroborating source** before the system declares a target engageable: SIGINT, ground-team confirmation, multi-pass observation, or operator override (logged).

### 3. Type 1 control is prohibited for GPS-guided weapons
"Due to the guidance of GPS or inertial navigation systems weapons, deliveries of GPS or INS guided weapons should not be controlled under Type 1." (JP 3-09.3 III-43 note.) When the munition tree picks a JDAM (GBU-31, GBU-32, GBU-38), the control-type tree **must** select Type 2 — never Type 1.

### 4. Our drone-as-sensor architecture defaults to Type 2
Type 1 requires the JTAC to have visual on both target AND aircraft. With drone video as the JTAC's only target sight, Type 1 is rarely available; Type 2 is the default.

### 5. Danger close has hard published numbers
JFIRE Table 86 gives the 0.1% probability-of-incapacitation distance per munition. That's the threshold that triggers "danger close — ground commander's initials required." Examples:

| Weapon | Danger close distance (m) |
|---|---|
| AGM-114 K/M/N (Hellfire) | 110 |
| AGM-114R | 130 |
| GBU-39 SDB (250 lb) | 205 |
| GBU-12 (500 lb LGB) | 275 |
| GBU-38 JDAM (500 lb) | 290 |
| Mk-82 unguided (500 lb) | 305 |
| GBU-31 JDAM (2000 lb) | 335 |
| Mk-84 unguided (2000 lb) | 355 |

Full table in `red_table.yaml`.

### 6. Target Location Error gates which weapons can be used
Drone-derived coordinates are typically Category III (~30 m accuracy). To use a GPS bomb, the system needs Category I (<10 m) — only achievable via mensuration tools (e.g., PSS-SOF). The munition tree branches on TLE category before considering JDAMs.

### 7. The 9-line we produce is abbreviated
Lines 1–3 (Initial Point, Heading, Distance from IP) describe a route the *aircraft* flies. The JTAC controlling the strike picks those, not us. **Our system outputs Lines 4–9 + Remarks.** The JTAC fills in 1–3 from their pre-loaded named IPs.

### 8. Self-defense overrides everything
Doctrine preserves the inherent right of self-defense at every level. If friendly forces are taking fire, the engageability gate has a parallel branch that bypasses ROE category checks (CJCSI 3160.01 p.D-3).

## The trees, one paragraph each

### Tree 1 — Engageability gate
Pre-flight checks: do we have multi-source PID? Is the target on a no-strike list? Is the target inside an active airspace measure that allows fires? Does the ROE authorize this target category? If any answer is "no," the system blocks engagement and surfaces the reason. **YAML:** `01_engageability_gate.yaml`.

### Tree 2 — Munition selection
Three stages: (a) **hard filter** — drop munitions where the aircraft can't deliver, the weather defeats the guidance, or a no-strike protected site is too close; (b) **flag stage** — annotate "danger close," "elevated CDE," or "minimum-altitude restriction"; (c) **rank** — score the survivors against the target-effectiveness matrix and tiebreak. The output is a top-1 plus 2 alternatives. **YAML:** `02_munition_selection.yaml`. **Tables:** `munitions_database.yaml`, `red_table.yaml`, `target_effectiveness_matrix.yaml`.

### Tree 3 — Control type
Default Type 2. Force Type 1 only if the JTAC has visual on aircraft AND target AND the munition is non-GPS. Force Type 3 if multiple targets in a single engagement window. Bias toward elevated approval whenever the inputs are ambiguous. **YAML:** `03_control_type.yaml`.

### Tree 4 — Mark method
Day → laser if munition is laser-guided, else smoke or talk-on. Night → IR pointer (if NVG-equipped aircrew) or laser. Always pass laser-to-target line in remarks. Always plan a backup mark. **YAML:** `04_mark_method.yaml`.

### Tree 5 — IP / egress
Pure geometry, not a tree. A scoring function picks the best Initial Point and egress direction from a list of pre-loaded named IPs. Penalties for run-ins over friendlies and into known threat rings; bonuses for terrain masking and pilot familiarity. **(Implemented as Python helper, not YAML — see `05_ip_egress.py` stub.)**

### Tree 6 — Restrictions
A flat list of conditional flags. Each fires independently if its condition is met. Output is a list of strings appended to the 9-line remarks. **YAML:** `06_restrictions.yaml`.

## Confidence as a first-class output

Every tree node records whether its decision was unambiguous (clean YES/NO) or fell into a fuzzy band. The system aggregates these into a `tree_confidence` score on the final recommendation. **Below 0.7 → the UI shows a warning: "Ambiguous scenario, JTAC review especially recommended."** This is the system being honest about its limits.

## Ranked output format

The system produces this structure (rendered as JSON for clarity):

```json
{
  "recommendations": [
    {
      "rank": 1,
      "munition": "GBU-12",
      "control_type": "Type 2",
      "method_of_attack": "BOT",
      "mark_method": "laser, code 1688",
      "nine_line": {
        "line_4_target_elevation_ft_msl": 312,
        "line_5_target_description": "2x technical with mounted MG",
        "line_6_target_location": "38SMB12345678 (WGS-84)",
        "line_7_mark": "laser, code 1688",
        "line_8_friendlies": "SW 800m",
        "line_9_egress": "north"
      },
      "remarks": [
        "LTL 045 magnetic",
        "FAH 015-075 clockwise",
        "TOT push when ready"
      ],
      "flags": [],
      "reasoning_trace": [
        "engageability:passed (multi-source PID, no NSL match, ROE category approved)",
        "munition:GBU-12 ranked first (effective vs soft moving vehicle, friendly distance 800m > danger close 275m, no protected sites in CHA)",
        "control_type:Type 2 (drone is sole sensor, JTAC remote)"
      ],
      "tree_confidence": 0.91
    },
    { "rank": 2, "munition": "AGM-114N", ... },
    { "rank": 3, "munition": "GBU-38", ... }
  ]
}
```

The JTAC sees the top recommendation expanded, the alternatives collapsed, and a one-click trace drill-down per recommendation.
