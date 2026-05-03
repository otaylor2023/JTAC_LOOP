package com.atakmap.android.jtac_plugin;

import com.atakmap.android.maps.MapItem;
import com.atakmap.coremap.log.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory index of JTAC wire payloads keyed by {@code target_id}, fed from
 * completed UDP JSON (single_target / single_option / bundle {@code targets}).
 */
public final class JtacMissionBundleStore {

    private static final String TAG = "JtacMissionBundleStore";
    private static final JtacMissionBundleStore INSTANCE = new JtacMissionBundleStore();

    private final ConcurrentHashMap<String, JSONObject> targets = new ConcurrentHashMap<>();

    private JtacMissionBundleStore() {
    }

    public static JtacMissionBundleStore getInstance() {
        return INSTANCE;
    }

    /**
     * Prefer {@code jtac_target_id} meta; else CoT uid if it matches a stored target_id.
     */
    public static String resolveTargetId(MapItem mi) {
        if (mi == null) {
            return null;
        }
        if (mi.hasMetaValue("jtac_target_id")) {
            String t = mi.getMetaString("jtac_target_id", null);
            if (t != null && !t.isEmpty()) {
                return t;
            }
        }
        String uid = mi.getUID();
        if (INSTANCE.targets.containsKey(uid)) {
            return uid;
        }
        return null;
    }

    public void reset() {
        targets.clear();
    }

    /** Current number of merged {@code target_id} entries (after ingest). */
    public int getTargetCount() {
        return targets.size();
    }

    public void ingestWireJson(String json) {
        if (json == null) {
            return;
        }
        String s = json.trim();
        if (s.isEmpty() || s.charAt(0) != '{') {
            return;
        }
        try {
            JSONObject o = new JSONObject(s);
            String wk = o.optString("wire_kind", "");
            if ("single_target".equals(wk) && o.has("target")) {
                JSONObject t = o.getJSONObject("target");
                String tid = t.optString("target_id", "");
                if (!tid.isEmpty()) {
                    targets.put(tid, new JSONObject(t.toString()));
                }
            } else if ("single_option".equals(wk)) {
                String tid = o.optString("target_id", "");
                if (tid.isEmpty()) {
                    return;
                }
                JSONObject track = o.has("track") && !o.isNull("track")
                        ? o.getJSONObject("track") : null;
                JSONObject opt = o.getJSONObject("option");
                JSONObject merged = targets.get(tid);
                if (merged == null) {
                    merged = new JSONObject();
                    merged.put("target_id", tid);
                    if (track != null) {
                        merged.put("track", track);
                    } else {
                        merged.put("track", JSONObject.NULL);
                    }
                    merged.put("options", new JSONArray());
                } else {
                    merged = new JSONObject(merged.toString());
                    if (track != null) {
                        merged.put("track", track);
                    }
                }
                JSONArray opts = merged.getJSONArray("options");
                opts.put(opt);
                merged.put("options", opts);
                targets.put(tid, merged);
            } else if (o.has("targets")) {
                JSONArray arr = o.getJSONArray("targets");
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject t = arr.getJSONObject(i);
                    String tid = t.optString("target_id", "");
                    if (!tid.isEmpty()) {
                        targets.put(tid, new JSONObject(t.toString()));
                    }
                }
            }
        } catch (JSONException e) {
            Log.w(TAG, "ingestWireJson: " + e.getMessage());
        }
    }

    public String getTargetJsonPretty(String targetId) {
        if (targetId == null) {
            return null;
        }
        JSONObject o = targets.get(targetId);
        if (o == null) {
            return null;
        }
        try {
            return o.toString(2);
        } catch (Exception e) {
            return o.toString();
        }
    }

    /**
     * Deep copy of merged target for UI (options[], track, etc.).
     */
    public JSONObject getTargetJsonObject(String targetId) {
        if (targetId == null) {
            return null;
        }
        JSONObject o = targets.get(targetId);
        if (o == null) {
            return null;
        }
        try {
            return new JSONObject(o.toString());
        } catch (JSONException e) {
            Log.w(TAG, "getTargetJsonObject: " + e.getMessage());
            return null;
        }
    }
}
