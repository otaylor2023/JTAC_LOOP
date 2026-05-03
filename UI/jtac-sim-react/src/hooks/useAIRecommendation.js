import { useEffect, useMemo, useState } from 'react';
import { recommend } from '../engine/decisionTree';
import { AIRCRAFT_ON_STATION, WEATHER, ROE } from '../data/units';

// Live recommendation hook. Re-runs the deterministic decision tree whenever
// the drone feed updates (or any other input changes). Returns:
//   { ready, recommendation }  where `recommendation` is the full structured
// output described in DECISION_TREE/output_schema.json.
//
// The engine is pure JS, runs in <1ms, so we don't debounce. In a future
// production deployment this would call a Jetson 2 service over REST.

export function useAIRecommendation({
  hostiles,
  friendlies,
  self,
  primaryTargetId,
  user_heading,
  weapon_override,                                    // JTAC weapon override
  // Tactical knobs the operator can flip (from the form / map):
  jtac_visual_on_target = false,
  jtac_visual_on_aircraft = false,
  friendlies_taking_effective_fire = false,
  multi_target_window = false,
  supported_commander_authorized_type_3 = false,
  target_is_time_sensitive = false,
  drone_has_laser_designator = true,
  drone_has_ir_pointer = true,
  // Initial compute delay — purely cosmetic ("AI computing…" pill).
  initialDelayMs = 1800,
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setReady(true), initialDelayMs);
    return () => clearTimeout(id);
  }, [initialDelayMs]);

  const recommendation = useMemo(() => {
    if (!hostiles?.length) return null;
    return recommend({
      hostiles, friendlies, self,
      primaryTargetId: primaryTargetId ?? hostiles[0].id,
      aircraft: AIRCRAFT_ON_STATION,
      weather: WEATHER,
      roe: ROE,
      time_of_day: 'day',
      user_heading,
      weapon_override,
      jtac_visual_on_target,
      jtac_visual_on_aircraft,
      friendlies_taking_effective_fire,
      multi_target_window,
      supported_commander_authorized_type_3,
      target_is_time_sensitive,
      drone_has_laser_designator,
      drone_has_ir_pointer,
    });
  }, [
    hostiles, friendlies, self, primaryTargetId, user_heading, weapon_override,
    jtac_visual_on_target, jtac_visual_on_aircraft,
    friendlies_taking_effective_fire, multi_target_window,
    supported_commander_authorized_type_3, target_is_time_sensitive,
    drone_has_laser_designator, drone_has_ir_pointer,
  ]);

  return { ready, recommendation };
}
