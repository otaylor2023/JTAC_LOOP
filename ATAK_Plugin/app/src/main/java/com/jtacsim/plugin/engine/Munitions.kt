package com.jtacsim.plugin.engine

// Munition database — 1:1 port of /JTAC_Manuals/DECISION_TREE/munitions_database.yaml
// + RED values from red_table.yaml.
// All distances meters. RED = 0.1% Pᵢ standing column (JFIRE Table 86).
// Source-of-truth lives in the YAML. Update both when changing.

data class Munition(
    val id: String,
    val name: String,
    val classBucket: String,
    val effectivenessClass: String,
    val warheadLb: Int,
    val guidance: String,            // "laser" | "gps" | "gps_laser" | "iir" | "ballistic"
    val redStandingM: Int,
    val redAirburstM: Int? = null,
    val tleRequiredM: Int,
    val fuzeOptions: List<String>,
    val deliveryAircraft: List<String>,
    val type1Prohibited: Boolean = false,
    val note: String? = null,
)

object Munitions {

    val ALL: List<Munition> = listOf(
        // ── 500-lb laser-guided bombs (Paveway II) ──────────────────────────
        Munition("GBU-12", "GBU-12 Paveway II", "bomb_lgb", "bomb_lgb_500", 500, "laser",
            redStandingM = 275, tleRequiredM = 30,
            fuzeOptions = listOf("nose", "tail", "dual"),
            deliveryAircraft = listOf("A-10", "F-15E", "F-16", "F/A-18", "AV-8B", "B-1", "B-52", "F-35", "MQ-9")),
        Munition("GBU-16", "GBU-16 Paveway II", "bomb_lgb", "bomb_lgb_2000", 1000, "laser",
            redStandingM = 310, tleRequiredM = 30,
            fuzeOptions = listOf("nose", "tail", "dual"),
            deliveryAircraft = listOf("F-15E", "F/A-18", "AV-8B", "B-52")),
        Munition("GBU-10", "GBU-10 Paveway II", "bomb_lgb", "bomb_lgb_2000", 2000, "laser",
            redStandingM = 315, tleRequiredM = 30,
            fuzeOptions = listOf("nose", "tail", "dual", "hard_target_smart_fuze"),
            deliveryAircraft = listOf("F-15E", "F/A-18", "B-1", "B-52")),

        // ── GPS-guided JDAMs (Type 1 PROHIBITED — JP 3-09.3 III-43 note) ────
        Munition("GBU-38", "GBU-38 JDAM (500 lb)", "bomb_jdam", "bomb_jdam_500", 500, "gps",
            redStandingM = 290, redAirburstM = 410, tleRequiredM = 10,
            fuzeOptions = listOf("nose", "tail", "dual", "airburst_proximity", "delay"),
            deliveryAircraft = listOf("F-15E", "F-16", "F/A-18", "AV-8B", "B-1", "B-2", "B-52", "F-35"),
            type1Prohibited = true),
        Munition("GBU-32", "GBU-32 JDAM (1000 lb)", "bomb_jdam", "bomb_jdam_2000", 1000, "gps",
            redStandingM = 320, redAirburstM = 410, tleRequiredM = 10,
            fuzeOptions = listOf("nose", "tail", "dual", "airburst_proximity", "delay"),
            deliveryAircraft = listOf("F-15E", "F-16", "F/A-18", "B-1", "B-2", "B-52"),
            type1Prohibited = true),
        Munition("GBU-31", "GBU-31 JDAM (2000 lb)", "bomb_jdam", "bomb_jdam_2000", 2000, "gps",
            redStandingM = 335, redAirburstM = 420, tleRequiredM = 10,
            fuzeOptions = listOf("nose", "tail", "dual", "airburst_proximity", "delay"),
            deliveryAircraft = listOf("F-15E", "F-16", "F/A-18", "B-1", "B-2", "B-52"),
            type1Prohibited = true),
        Munition("GBU-54", "GBU-54 LJDAM (Laser JDAM)", "bomb_jdam", "bomb_jdam_500_laser", 500, "gps_laser",
            redStandingM = 290, tleRequiredM = 30,
            fuzeOptions = listOf("nose", "tail", "dual", "airburst_proximity", "delay"),
            deliveryAircraft = listOf("F-15E", "F-16", "F/A-18", "B-1"),
            type1Prohibited = true),

        // ── Small Diameter Bomb ────────────────────────────────────────────
        Munition("GBU-39", "GBU-39 SDB (250 lb)", "bomb_sdb", "bomb_sdb", 250, "gps",
            redStandingM = 205, redAirburstM = 285, tleRequiredM = 10,
            fuzeOptions = listOf("airburst_proximity", "delay"),
            deliveryAircraft = listOf("F-15E", "F-16", "F/A-18", "F-35", "B-1", "B-2", "B-52"),
            type1Prohibited = true,
            note = "Preferred urban CDE option"),
        Munition("GBU-39_FLM", "GBU-39 SDB FLM", "bomb_sdb", "bomb_sdb_flm", 250, "gps",
            redStandingM = 70, tleRequiredM = 10,
            fuzeOptions = listOf("airburst_proximity", "delay"),
            deliveryAircraft = listOf("F-15E", "F-16", "F/A-18"),
            type1Prohibited = true,
            note = "Extreme low-collateral option"),

        // ── Hellfire ───────────────────────────────────────────────────────
        Munition("AGM-114K", "AGM-114K Hellfire II", "missile_atgm", "missile_atgm_l", 20, "laser",
            redStandingM = 110, tleRequiredM = 30,
            fuzeOptions = listOf("contact"),
            deliveryAircraft = listOf("AH-64", "MQ-1", "MQ-9", "OH-58", "AH-1Z")),
        Munition("AGM-114N", "AGM-114N Hellfire (thermobaric)", "missile_atgm", "missile_thermo", 18, "laser",
            redStandingM = 110, tleRequiredM = 30,
            fuzeOptions = listOf("contact", "delay"),
            deliveryAircraft = listOf("AH-64", "MQ-1", "MQ-9", "AH-1Z"),
            note = "Recommended for in-structure / cave engagements"),
        Munition("AGM-114R", "AGM-114R Hellfire (multi-purpose)", "missile_atgm", "missile_atgm_l", 20, "laser",
            redStandingM = 130, tleRequiredM = 30,
            fuzeOptions = listOf("contact", "delay", "airburst_proximity"),
            deliveryAircraft = listOf("AH-64", "MQ-1", "MQ-9", "AH-1Z")),

        // ── Maverick ───────────────────────────────────────────────────────
        Munition("AGM-65D", "AGM-65D Maverick (IIR)", "missile_atgm", "missile_iir", 125, "iir",
            redStandingM = 175, tleRequiredM = 50,
            fuzeOptions = listOf("contact"),
            deliveryAircraft = listOf("A-10", "F-15E", "F-16", "F/A-18", "AV-8B"),
            note = "Excellent against movers"),
        Munition("AGM-65L", "AGM-65L Maverick (laser)", "missile_atgm", "missile_atgm_l", 300, "laser",
            redStandingM = 175, tleRequiredM = 30,
            fuzeOptions = listOf("contact", "delay"),
            deliveryAircraft = listOf("A-10", "F/A-18")),

        // ── Rockets ────────────────────────────────────────────────────────
        Munition("APKWS", "APKWS 70mm laser-guided rocket", "rocket", "rocket_apkws", 10, "laser",
            redStandingM = 95, tleRequiredM = 30,
            fuzeOptions = listOf("contact", "airburst_proximity"),
            deliveryAircraft = listOf("AH-1Z", "AH-64", "OH-58", "F/A-18", "AV-8B")),

        // ── Guns (direct fire <105mm exempt from CDE) ──────────────────────
        Munition("GAU-8", "A-10 GAU-8 30 mm", "gun", "gun_30mm", 1, "ballistic",
            redStandingM = 95, tleRequiredM = 100,
            fuzeOptions = listOf("contact"),
            deliveryAircraft = listOf("A-10"),
            note = "Direct fire <105 mm — EXEMPT from CDE"),
        Munition("gun_20mm", "20 mm cannon (M61)", "gun", "gun_20mm", 1, "ballistic",
            redStandingM = 95, tleRequiredM = 100,
            fuzeOptions = listOf("contact"),
            deliveryAircraft = listOf("F-15E", "F-16", "F/A-18", "AV-8B")),
    )

    fun byId(id: String): Munition? = ALL.firstOrNull { it.id == id }
}

// ─── EFFECTIVENESS RATINGS ───────────────────────────────────────────────
enum class Rating(val score: Double) {
    PREFERRED(1.0),
    ACCEPTABLE(0.7),
    MARGINAL(0.4),
    NOT_REC(0.0),
    PROHIBITED(-1.0);
}
