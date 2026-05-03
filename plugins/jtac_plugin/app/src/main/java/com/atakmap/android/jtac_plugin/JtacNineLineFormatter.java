package com.atakmap.android.jtac_plugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Renders {@code recommendation.nine_line} and related mission objects as
 * plain-text sections (not JSON).
 */
public final class JtacNineLineFormatter {

    private static final Pattern LINE_NUM = Pattern.compile("line_(\\d+)(?:_(.*))?");

    private JtacNineLineFormatter() {
    }

    public static String formatFromOption(JSONObject option) {
        if (option == null) {
            return "";
        }
        StringBuilder out = new StringBuilder();
        String role = option.optString("role", "").trim();
        if (!role.isEmpty()) {
            out.append(capitalize(role)).append(" package\n\n");
        }
        JSONObject rec = option.optJSONObject("recommendation");
        if (rec != null) {
            appendEngageabilityMunitionHeader(out, rec);
            JSONObject nine = rec.optJSONObject("nine_line");
            if (nine != null && nine.length() > 0) {
                out.append(formatNineLineBlock(nine));
            } else {
                out.append("\n").append(formatRecommendationFields(rec));
            }
        } else {
            out.append("No recommendation block on this option.");
        }
        return out.toString().trim();
    }

    public static String formatFromTarget(JSONObject target) {
        if (target == null) {
            return "";
        }
        StringBuilder out = new StringBuilder();
        out.append("Merged target\n\n");
        JSONObject track = target.optJSONObject("track");
        if (track != null) {
            out.append("━━ Track ━━\n");
            out.append(formatLeafObject(track, 0));
            out.append("\n\n");
        }
        JSONArray opts = target.optJSONArray("options");
        if (opts != null) {
            boolean anyNine = false;
            for (int i = 0; i < opts.length(); i++) {
                JSONObject opt = opts.optJSONObject(i);
                if (opt == null) {
                    continue;
                }
                JSONObject rec = opt.optJSONObject("recommendation");
                if (rec == null) {
                    continue;
                }
                JSONObject nine = rec.optJSONObject("nine_line");
                if (nine != null && nine.length() > 0) {
                    anyNine = true;
                    String role = opt.optString("role", "option " + (i + 1));
                    out.append("━━ ").append(capitalize(role))
                            .append(" — nine-line ━━\n\n");
                    out.append(formatNineLineBlock(nine)).append("\n\n");
                }
            }
            if (anyNine) {
                return out.toString().trim();
            }
            out.append("━━ Options (no nine_line on wire) ━━\n");
            for (int i = 0; i < opts.length(); i++) {
                JSONObject opt = opts.optJSONObject(i);
                if (opt == null) {
                    continue;
                }
                out.append("\n— ").append(opt.optString("role", "option"))
                        .append(" —\n");
                JSONObject rec = opt.optJSONObject("recommendation");
                if (rec != null) {
                    out.append(formatRecommendationFields(rec));
                }
            }
        } else {
            out.append("No options array on this target.");
        }
        return out.toString().trim();
    }

    private static void appendEngageabilityMunitionHeader(StringBuilder out,
            JSONObject rec) {
        String eng = rec.optString("engageability", "");
        if (!eng.isEmpty()) {
            out.append("Engageability: ").append(eng).append("\n");
        }
        String cls = rec.optString("target_classification", "");
        if (!cls.isEmpty()) {
            out.append("Classification: ").append(cls).append("\n");
        }
        JSONObject mun = rec.optJSONObject("munition");
        if (mun != null) {
            JSONObject p = mun.optJSONObject("primary");
            if (p != null) {
                String id = p.optString("id", "");
                String nm = p.optString("name", "");
                if (!id.isEmpty() || !nm.isEmpty()) {
                    out.append("Primary munition: ");
                    if (!nm.isEmpty()) {
                        out.append(nm);
                    }
                    if (!id.isEmpty()) {
                        out.append(nm.isEmpty() ? id : " (" + id + ")");
                    }
                    out.append("\n");
                }
            }
        }
        JSONObject gp = rec.optJSONObject("game_plan");
        if (gp != null) {
            String ct = gp.optString("control_type", "");
            String moa = gp.optString("method_of_attack", "");
            if (!ct.isEmpty() || !moa.isEmpty()) {
                out.append("Game plan: ");
                if (!ct.isEmpty()) {
                    out.append(ct);
                }
                if (!moa.isEmpty()) {
                    out.append(ct.isEmpty() ? moa : " · " + moa);
                }
                out.append("\n");
            }
        }
    }

    private static String formatNineLineBlock(JSONObject nine) {
        StringBuilder sb = new StringBuilder();
        List<String> keys = sortedNineLineKeys(nine);
        for (String lk : keys) {
            sb.append("━━ ").append(lineHeading(lk)).append(" ━━\n");
            Object v = nine.opt(lk);
            if (v instanceof JSONObject) {
                sb.append(formatLeafObject((JSONObject) v, 0));
            } else if (v instanceof JSONArray) {
                sb.append(formatArray((JSONArray) v, 0));
            } else if (v != null && !JSONObject.NULL.equals(v)) {
                sb.append("  ").append(stringify(v)).append("\n");
            }
            sb.append("\n");
        }
        return sb.toString();
    }

    private static String lineHeading(String key) {
        Matcher m = LINE_NUM.matcher(key);
        if (m.find()) {
            String n = m.group(1);
            String rest = m.group(2);
            if (rest != null && !rest.isEmpty()) {
                return "Line " + n + " — " + humanizeToken(rest);
            }
            return "Line " + n;
        }
        return humanizeToken(key);
    }

    private static List<String> sortedNineLineKeys(JSONObject nine) {
        List<String> keys = new ArrayList<>();
        for (Iterator<String> it = nine.keys(); it.hasNext(); ) {
            keys.add(it.next());
        }
        Collections.sort(keys, new Comparator<String>() {
            @Override
            public int compare(String a, String b) {
                int na = lineSortKey(a);
                int nb = lineSortKey(b);
                if (na != nb) {
                    return Integer.compare(na, nb);
                }
                return a.compareTo(b);
            }
        });
        return keys;
    }

    private static int lineSortKey(String key) {
        Matcher m = LINE_NUM.matcher(key);
        if (m.find()) {
            return Integer.parseInt(m.group(1));
        }
        return 999;
    }

    private static String formatRecommendationFields(JSONObject rec) {
        StringBuilder sb = new StringBuilder();
        String[] keys = {
                "engageability", "target_classification", "target_class",
                "cnn_confidence", "flags", "routing", "game_plan", "munition",
                "remarks"
        };
        for (String k : keys) {
            if (!rec.has(k)) {
                continue;
            }
            Object v = rec.opt(k);
            if (v == null || JSONObject.NULL.equals(v)) {
                continue;
            }
            sb.append(humanizeToken(k)).append("\n");
            if (v instanceof JSONObject) {
                sb.append(formatLeafObject((JSONObject) v, 1));
            } else if (v instanceof JSONArray) {
                sb.append(formatArray((JSONArray) v, 1));
            } else {
                sb.append("  ").append(stringify(v)).append("\n");
            }
            sb.append("\n");
        }
        return sb.toString().trim();
    }

    private static String formatLeafObject(JSONObject o, int depth) {
        String pad = repeatPad(depth);
        StringBuilder sb = new StringBuilder();
        List<String> keys = new ArrayList<>();
        for (Iterator<String> it = o.keys(); it.hasNext(); ) {
            keys.add(it.next());
        }
        Collections.sort(keys);
        for (String k : keys) {
            Object v = o.opt(k);
            if (v == null || JSONObject.NULL.equals(v)) {
                continue;
            }
            if (v instanceof JSONObject) {
                sb.append(pad).append(humanizeToken(k)).append("\n");
                sb.append(formatLeafObject((JSONObject) v, depth + 1));
            } else if (v instanceof JSONArray) {
                sb.append(pad).append(humanizeToken(k)).append("\n");
                sb.append(formatArray((JSONArray) v, depth + 1));
            } else {
                sb.append(pad).append(humanizeToken(k)).append(": ")
                        .append(stringify(v)).append("\n");
            }
        }
        return sb.toString();
    }

    private static String formatArray(JSONArray arr, int depth) {
        String pad = repeatPad(depth);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < arr.length(); i++) {
            Object v = arr.opt(i);
            if (v instanceof JSONObject) {
                sb.append(pad).append("• ").append(i + 1).append("\n");
                sb.append(formatLeafObject((JSONObject) v, depth + 1));
            } else {
                sb.append(pad).append("• ").append(stringify(v)).append("\n");
            }
        }
        return sb.toString();
    }

    private static String repeatPad(int depth) {
        StringBuilder p = new StringBuilder();
        for (int i = 0; i <= depth; i++) {
            p.append("  ");
        }
        return p.toString();
    }

    private static String stringify(Object v) {
        if (v == null || JSONObject.NULL.equals(v)) {
            return "";
        }
        if (v instanceof Boolean) {
            return ((Boolean) v) ? "yes" : "no";
        }
        return String.valueOf(v);
    }

    private static String humanizeToken(String snake) {
        if (snake == null || snake.isEmpty()) {
            return "";
        }
        String[] parts = snake.split("_");
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < parts.length; i++) {
            if (parts[i].isEmpty()) {
                continue;
            }
            if (sb.length() > 0) {
                sb.append(" ");
            }
            String p = parts[i];
            sb.append(p.substring(0, 1).toUpperCase(Locale.US));
            if (p.length() > 1) {
                sb.append(p.substring(1).toLowerCase(Locale.US));
            }
        }
        return sb.toString();
    }

    private static String capitalize(String s) {
        if (s == null || s.isEmpty()) {
            return s;
        }
        return s.substring(0, 1).toUpperCase(Locale.US)
                + s.substring(1).toLowerCase(Locale.US);
    }
}
