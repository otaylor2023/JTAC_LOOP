package com.jtacsim.plugin.engine

// Target × Munition effectiveness matrix.
// 1:1 port of /JTAC_Manuals/DECISION_TREE/target_effectiveness_matrix.yaml.
// Rows: target classes. Columns: munition.effectivenessClass.
// Missing cell → NOT_REC.

object TargetEffectiveness {

    private val MATRIX: Map<String, Map<String, Rating>> = mapOf(
        "vehicle_wheeled_soft" to mapOf(
            "bomb_lgb_500" to Rating.PREFERRED, "bomb_jdam_500" to Rating.PREFERRED,
            "bomb_jdam_500_laser" to Rating.PREFERRED, "bomb_sdb" to Rating.PREFERRED,
            "missile_atgm_l" to Rating.PREFERRED, "missile_iir" to Rating.PREFERRED,
            "rocket_apkws" to Rating.PREFERRED, "gun_30mm" to Rating.PREFERRED,
            "gun_20mm" to Rating.ACCEPTABLE,
            "bomb_lgb_2000" to Rating.NOT_REC, "bomb_jdam_2000" to Rating.NOT_REC,
        ),
        "vehicle_wheeled_soft_moving" to mapOf(
            "missile_atgm_l" to Rating.PREFERRED, "missile_iir" to Rating.PREFERRED,
            "bomb_jdam_500_laser" to Rating.PREFERRED,
            "bomb_lgb_500" to Rating.MARGINAL, "bomb_jdam_500" to Rating.NOT_REC,
            "gun_30mm" to Rating.PREFERRED,
        ),
        "vehicle_tracked_light" to mapOf(
            "bomb_lgb_500" to Rating.PREFERRED, "bomb_jdam_500" to Rating.PREFERRED,
            "bomb_jdam_500_laser" to Rating.PREFERRED, "missile_atgm_l" to Rating.PREFERRED,
            "missile_iir" to Rating.PREFERRED, "gun_30mm" to Rating.PREFERRED,
            "bomb_sdb" to Rating.ACCEPTABLE, "gun_20mm" to Rating.MARGINAL,
        ),
        "vehicle_tracked_armor" to mapOf(
            "missile_atgm_l" to Rating.PREFERRED, "missile_iir" to Rating.PREFERRED,
            "bomb_lgb_2000" to Rating.PREFERRED, "bomb_jdam_2000" to Rating.PREFERRED,
            "bomb_lgb_500" to Rating.MARGINAL, "gun_30mm" to Rating.ACCEPTABLE,
            "bomb_sdb" to Rating.NOT_REC,
        ),
        "personnel_open" to mapOf(
            "bomb_lgb_500" to Rating.ACCEPTABLE, "bomb_jdam_500" to Rating.ACCEPTABLE,
            "bomb_sdb" to Rating.PREFERRED, "bomb_sdb_flm" to Rating.PREFERRED,
            "missile_atgm_l" to Rating.ACCEPTABLE, "rocket_apkws" to Rating.PREFERRED,
            "gun_30mm" to Rating.PREFERRED, "gun_20mm" to Rating.PREFERRED,
            "bomb_lgb_2000" to Rating.NOT_REC, "bomb_jdam_2000" to Rating.NOT_REC,
        ),
        "personnel_concentrated" to mapOf(
            "bomb_lgb_500" to Rating.PREFERRED, "bomb_jdam_500" to Rating.PREFERRED,
            "bomb_jdam_500_laser" to Rating.PREFERRED, "bomb_sdb" to Rating.PREFERRED,
            "bomb_sdb_flm" to Rating.PREFERRED, "missile_atgm_l" to Rating.ACCEPTABLE,
            "missile_thermo" to Rating.PREFERRED, "rocket_apkws" to Rating.ACCEPTABLE,
            "gun_30mm" to Rating.ACCEPTABLE,
        ),
        "personnel_dug_in" to mapOf(
            "bomb_lgb_500" to Rating.ACCEPTABLE, "bomb_jdam_500" to Rating.PREFERRED,
            "bomb_jdam_500_laser" to Rating.PREFERRED, "bomb_sdb" to Rating.ACCEPTABLE,
            "missile_atgm_l" to Rating.MARGINAL, "missile_iir" to Rating.MARGINAL,
            "gun_30mm" to Rating.ACCEPTABLE,
        ),
        "structure_soft" to mapOf(
            "bomb_lgb_500" to Rating.PREFERRED, "bomb_jdam_500" to Rating.PREFERRED,
            "bomb_sdb" to Rating.PREFERRED, "missile_thermo" to Rating.PREFERRED,
            "missile_atgm_l" to Rating.PREFERRED, "missile_iir" to Rating.PREFERRED,
            "gun_30mm" to Rating.ACCEPTABLE,
        ),
        "structure_hardened" to mapOf(
            "bomb_lgb_2000" to Rating.PREFERRED, "bomb_jdam_2000" to Rating.PREFERRED,
            "bomb_lgb_500" to Rating.MARGINAL, "missile_atgm_l" to Rating.MARGINAL,
        ),
    )

    fun rating(targetClass: String, effectivenessClass: String): Rating {
        return MATRIX[targetClass]?.get(effectivenessClass) ?: Rating.NOT_REC
    }
}
