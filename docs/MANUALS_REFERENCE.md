# JTAC Manuals — What's In This Library

This folder is the doctrinal foundation for our deterministic CAS decision tree. Every threshold, rule, and matrix in `DECISION_TREE/` traces to one of the documents below. If you're new to this corpus, read this file first.

---

## Plain-language glossary (read this before anything else)

| Acronym | Plain meaning | When you see it |
|---|---|---|
| **CAS** | Close Air Support — aircraft attacking enemies near friendly troops | The whole problem we're solving |
| **JTAC** | Joint Terminal Attack Controller — the certified person on the ground who clears aircraft to drop bombs | The user our system serves |
| **GFC** | Ground Force Commander — the senior on-scene commander who owns the engagement decision | Final approver above the JTAC |
| **JFO** | Joint Fires Observer — a less-certified observer who can adjust artillery and feed targeting data to a JTAC, but cannot independently clear a strike | Doctrinally, our drone+system is closest to a JFO |
| **FAC(A)** | Forward Air Controller (Airborne) — a pilot qualified to do JTAC's job from the air | An alternative controller; same authorities as JTAC |
| **9-line** | The standardized 9-line briefing format a JTAC reads to attack aircraft | The system's primary output |
| **5-line** | Shorter brief used for rotary-wing (helicopter) attacks | Alternative output format |
| **Type 1 / 2 / 3 control** | Three categories of how tightly the JTAC supervises each weapons release. See `DECISION_TREE/03_control_type.yaml` | Our system always defaults to Type 2 |
| **BOT / BOC** | Bomb On Target / Bomb On Coordinate — does the aircraft aim at the target it sees, or at GPS coordinates we give it? | Affects which weapons are available |
| **IP** | Initial Point — a named geographic point the aircraft flies from toward the target | Line 1 of the 9-line |
| **BP** | Battle Position — a holding area for helicopters, equivalent to an IP for fixed-wing | Line 1 alternative |
| **MGRS** | Military Grid Reference System — the alphanumeric grid format ("38SMB12345678") used for target locations | Line 6 format |
| **MSL / AGL** | Mean Sea Level / Above Ground Level — two different reference points for altitude | Always state which one |
| **WGS-84** | The standard global GPS coordinate datum used by US military | Always confirm coords are in this datum |
| **TLE** | Target Location Error — how accurately we know where the target is, expressed as a 90% confidence circle radius | Drives which weapons can be used |
| **CEP** | Circular Error Probable — radius inside which 50% of weapons land. Used for weapon accuracy | Compared against TLE |
| **CAT I / II / III** | TLE quality categories. CAT I (≤6 m, JDAM-grade per ATP 3-09.30 ¶3-61) is GPS-bomb-grade. CAT III (~30 m) is typical of an airborne sensor pod | Drone alone usually produces CAT III |
| **PID** | Positive Identification — "reasonable certainty that this is a legitimate military target" | Required before any engagement |
| **CID** | Combat Identification — confirming target type just before firing | Done at "engage" step |
| **ROE** | Rules of Engagement — the legal/policy rules for when and how to use force | Theater-specific, varies by mission |
| **NSL** | No-Strike List — buildings/sites that are off-limits (hospitals, schools, mosques, etc.) | Hard block in the tree |
| **RTL** | Restricted Target List — valid military targets that need higher approval | Soft block |
| **CDE** | Collateral Damage Estimation — the formal process for predicting civilian harm | 5 levels of escalation |
| **CHA** | Collateral Hazard Area — the danger circle around a planned strike | Computed per weapon |
| **CER** | Collateral Effects Radius — the radius of that danger circle | Inputs to CHA |
| **NCV** | Noncombatant Casualty Cutoff Value — the max civilian casualties the ROE allows before kicking the decision up to the Secretary of Defense | Theater-specific |
| **TST** | Time-Sensitive Target — a target that's about to disappear; gets expedited approval | Special-handling flag |
| **HVT / HVI** | High-Value Target / Individual | Marketing/reporting term |
| **F2T2EA** | Find, Fix, Track, Target, Engage, Assess — the 6-step "kill chain" | The cycle our system shortens |
| **RED** | Risk Estimate Distance — how far friendly troops should be from a planned weapon impact, by weapon type. Quoted at 0.1% probability of incapacitating a standing soldier (1-in-1000 risk) | Drives danger-close threshold |
| **MSD** | Minimum Safe Distance — training-only version of RED, more conservative | Don't confuse with RED in combat |
| **0.1% Pᵢ** | "0.1 percent probability of incapacitation" — i.e., 1 in 1,000 risk to a standing soldier | The published threshold for danger close |
| **Danger Close** | A condition that exists when friendlies are within RED of the planned impact point. Requires the ground commander's initials | Doesn't *prohibit* — it adds a procedure |
| **PGM** | Precision-Guided Munition — laser, GPS, or IR/EO-guided weapon | Preferred whenever civilians are nearby |
| **LGB / LGW** | Laser-Guided Bomb / Laser-Guided Weapon — needs a laser spot on the target to home in | GBU-12 family |
| **JDAM** | Joint Direct Attack Munition — GPS-guided bomb. Doesn't need a laser, but needs precise coordinates | GBU-31, GBU-32, GBU-38 |
| **SDB** | Small Diameter Bomb — 250 lb GPS-guided bomb (GBU-39) | Smaller frag, used in urban / civilian-near scenarios |
| **CBU** | Cluster Bomb Unit — disperses many sub-munitions over an area | Largely banned by ROE / CDE rules |
| **AGM-114** | Hellfire missile — fired from helicopters and drones; laser-guided variants are most common | Drone-fired; small footprint |
| **GBU-12** | A 500 lb laser-guided bomb (Paveway II family) | The CAS workhorse |
| **GBU-38** | A 500 lb GPS-guided bomb (JDAM, smaller version) | Bad-weather alternative to GBU-12 |
| **GAU-8** | The 30 mm gun on the A-10 | Strafe attacks |
| **TOT / TTT** | Time On Target / Time To Target — when the weapon should impact | Always last item in 9-line remarks |
| **FAH** | Final Attack Heading — the magnetic heading the aircraft must be on when releasing the weapon | Restriction in 9-line remarks |
| **LTL** | Laser-to-Target Line — magnetic bearing from the laser designator to the target | Drives the FAH cone |
| **PRF** | Pulse Repetition Frequency — the unique blink pattern of a laser. Aircraft seeker must match the laser's PRF to home in | 4-digit code (e.g., 1688) |
| **SOFLAM / GLTD / HLM / IZLID** | Different ground laser designators / IR pointers | Marking equipment |
| **IR pointer** | Infrared laser pointer — visible only through night vision goggles | Night marking method |
| **Sparkle** | The brevity word for "I'm marking the target with my IR pointer" | Mark brevity |
| **Smoke / WP** | Smoke round (often White Phosphorus) used as a visual mark | Day marking method |
| **Talk-on** | Verbally guiding the aircrew's eyes onto the target using landmarks | Backup when no marking equipment |
| **VS-17 panel** | Bright orange/pink fabric panel friendlies put down to mark themselves visually | Friendly mark |
| **VDL / ROVER** | Video Downlink — JTAC's tablet that shows the drone or aircraft's sensor feed | How drone video gets to JTAC |
| **SPINS** | Special Instructions — the daily theater-specific orders that override defaults | Authoritative for any specific mission |
| **ATO** | Air Tasking Order — the daily schedule of which aircraft do what | Defines what's available |
| **MEZ / FEZ / JEZ** | Missile / Fighter / Joint Engagement Zone — areas where enemy air defenses dominate | Aircraft routing constraint |
| **MANPADS** | Man-Portable Air Defense System — shoulder-fired anti-aircraft missiles (e.g., Stinger-class) | Drives altitude floors |
| **AAA** | Anti-Aircraft Artillery — guns | Lower altitude threat |
| **SEAD** | Suppression of Enemy Air Defenses | Pre-strike clearing of threats |
| **FSCM** | Fire Support Coordination Measure — lines on the map that govern who can shoot where (FSCL, NFA, RFA, etc.) | Airspace deconfliction |
| **FSCL** | Fire Support Coordination Line — beyond it, the air component coordinates fires | Major boundary |
| **NFA / RFA / FFA** | No-Fire / Restricted Fire / Free Fire Area | Map overlays |
| **ACA / ROZ** | Airspace Coordination Area / Restricted Operations Zone | 3D airspace boxes |
| **Kill box** | A 3D box on the map where attacks can happen without further coordination — but **never used for CAS** | Far-side-of-FSCL targeting tool |
| **SCAR** | Strike Coordination And Reconnaissance — the mission of finding targets in a kill box and directing strikes against them | What our system does when friendlies aren't nearby |
| **BDA** | Battle Damage Assessment — what the strike actually accomplished | Final step |
| **SALT-R** | Size, Activity, Location, Time, Remarks — the BDA reporting format | Output of BDA |
| **JIPTL / JTL / NSL / RTL** | Joint Integrated Prioritized Target List / Joint Target List / etc. — the various target-listing artifacts | Targets feed in from these |
| **ABORT** | Universal call to stop a strike before weapons release | Anyone in the chain can call it |
| **Cleared Hot** | "Drop the weapon now" (Type 1 / Type 2) | The sentence the JTAC says |
| **Cleared to Engage** | Multi-attack version (Type 3) | Type 3 only |
| **Continue Dry** | "Keep maneuvering, do not drop" | Holding pattern call |

---

## Folder-by-folder reference

### `JOINT PUBS/` — the "bibles"
Top-level joint publications. These are the highest authority short of national-level instructions.

| File | What it covers | When to read it |
|---|---|---|
| **JP 3-09.3 Close Air Support (2014)** ← **most important file in the corpus** | The bible for CAS. 9-line format, Type 1/2/3 control, danger close, marking, every CAS execution detail. | Read first. Cited everywhere in our tree. |
| **AFTTP(I) 3-3 .JTAC (2012)** | The JTAC tactics manual — fills in the "how do you actually do it" gaps in JP 3-09.3. Target taxonomy, weapon-target matching guidance. | Read second |
| **JP 3-09 Joint Fire Support (2014)** | Higher-level joint fires doctrine (artillery + aviation + naval guns). | Big picture context |
| **JP 3-06 Joint Urban Operations (2013)** | Urban combat doctrine. Civilian density, building classification, ROE complications | Urban scenarios |
| **JP 3-60 Joint Targeting (2013)** | The 6-phase targeting cycle and F2T2EA "kill chain." Where CAS fits. | When asked "where does our system live in the kill chain?" |
| **JP 3-01 Countering Air and Missile Threats (2012)** | Enemy aircraft / missile threats | Edge cases |
| **JP 3-13.1 Electronic Warfare (2012)** | Jamming, electronic attack | Out of scope for v1 |
| **JP 3-52 Joint Airspace Control (2014)** | Airspace control measures (FSCMs, ACAs, ROZ) | Airspace gating |
| **DoD Dictionary (2016)** | Official term definitions | Resolving disagreements over terms |

### `JTAC PROGRAM REFERENCES/` — qualifications and authorities
Who is allowed to do what, and how they qualify.

| File | What it covers |
|---|---|
| **JTAC MOA (2015)** | Memorandum of Agreement — the inter-service deal that defines JTAC qualification, currency (every 6 months), and evaluation (every 18 months). |
| **AFI 13-112-V2 (2014)** | Air Force-specific implementation of the JTAC standards. |
| **FAC(A) MOA (2015)** | Same idea, for airborne controllers. |
| **USSOCOM Directive 525-13 / supplements** | Special Operations Command-specific rules. Relevant if our user is SOF. |
| **M 350-5 (2015)** | Marine Corps JTAC syllabus. |

### `ALSA PUBS/` — multi-service tactics manuals
Air, Land, Sea, Air Center publications. Practical "how-to" tactics across services.

| File | What it covers |
|---|---|
| **JFIRE (2016)** ← critical | Pocket reference. The famous **target-to-weapon matrix**, the **Risk Estimate Distance tables** (Tables 81–87 — the danger-close numbers), and weapon catalogs. Most-used reference in our tree. |
| **BREVITY (2016)** | The official radio brevity dictionary — "Tally," "Splash," "Cleared Hot," etc. |
| **KILL BOX (2014)** | Kill box doctrine: 3D fire support measure for non-CAS strikes. |
| **SCAR (2014)** | Strike Coordination and Reconnaissance — the mission of finding targets and directing strikes from the air. |
| **JSEAD (2015)** | Suppression of Enemy Air Defenses procedures. |
| **Aviation Urban Ops (2016)** | Air-delivered weapons in urban environments — the urban CDE recommendations. |

### `CDE/` — collateral damage estimation
| File | What it covers |
|---|---|
| **CJCSI 3160-01 (Feb 09)** | The Chairman of the Joint Chiefs Instruction on the no-strike list and the 5-level Collateral Damage Estimation methodology. The doctrinal foundation for civilian-harm avoidance. |

### `ORDNANCE/`
| File | What it covers |
|---|---|
| **Weapons File (2012)** ← critical | Encyclopedia of every air-delivered munition: warhead weight, guidance, fuze options, delivery profiles, target compatibility. The primary source for our munitions database. |

### `MSDs/`
| File | What it covers |
|---|---|
| **AFI 11-214 (2012)** | Air Force minimum safe distances for training. |

### `FIRE SUPPORT/` — artillery and mortars
| File | What it covers |
|---|---|
| **ATP 3-09.30 Techniques of Observed Fire (2013)** | Call-for-fire format, target location methods, adjustment procedures. |
| **FM 3-09.60 (MLRS), 3-09.70 (M-109A6), 3-22.90 (Mortars)** | Specific weapon system manuals. |

### `JFO/` — Joint Fires Observer
**Important: doctrinally, our drone+system is closest to a JFO. Read this folder.**

| File | What it covers |
|---|---|
| **ATTP 3-09.36 The JFO (2011)** | What a JFO can and cannot do. Coordinate accuracy. PID rules from a sensor feed. |
| **JFO MOA (2016)** | JFO qualification standards. |
| **MAWTS-1 TACSOP (2014)** | Marine air-ground tactics SOP. |

### `LASERS/` (HLM, SOFLAM)
Operator manuals for ground laser designators and markers. Drive Line 7 of the 9-line.

### `RANGE FINDERS/`, `RADIOS/`, `DAGR/`, `ROVER/`
Equipment manuals — what gear is in the JTAC's kit.

### `UAS/` — drones
| File | What it covers |
|---|---|
| **ALSB UAS (2014)**, **UAS (2015)** | UAS roles, JTAC integration, sensor-derived coordinate accuracy, video downlink procedures. **Defines what our drone can doctrinally do.** |

### `BOMBER/`, `USMC/`, `FMs/`
Edge-case references (long-range bombers, Marine-specific manuals, special ops).

### Loose files
- **THREAT CARD.pptx** — visual reference for enemy weapon systems.
- **Loging controls in AJACTS.pptx** — JTAC training records system.

---

## How to use this library when you're stuck

1. **"What does X mean?"** → Glossary above, or DoD Dictionary in JOINT PUBS.
2. **"Is this 9-line correct?"** → JP 3-09.3, Chapter V, Figure V-9.
3. **"Can this aircraft drop this weapon?"** → Weapons File.
4. **"How close can this weapon come to friendlies?"** → JFIRE Table 86 (air) or Table 81 (artillery).
5. **"Is this target on the no-strike list?"** → CJCSI 3160-01, Enclosure B.
6. **"What's a kill box?"** → ALSA Kill Box (2014). Also note: kill boxes are NOT used for CAS.
7. **"Can our drone PID a target alone?"** → JFO ATTP ¶1-136. Answer: **No.** Single-source FMV is doctrinally insufficient.
8. **"Type 1 vs 2 vs 3?"** → JP 3-09.3 III-42 to III-46. Also: Type 1 prohibited for GPS/INS-guided weapons.
