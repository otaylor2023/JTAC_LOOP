package com.atakmap.android.jtac_plugin;

import com.atakmap.android.jtac_plugin.plugin.R;

import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONException;
import org.json.JSONObject;

import java.lang.ref.WeakReference;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.Date;
import java.util.Locale;

/**
 * Sidebar for JTAC UDP wire: short one-line receipts per message, plus a
 * separate block updated on each hostile map-pick with that target's JSON.
 */
public final class JtacJsonWireDisplay {

    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final int MAX_CHARS = 200_000;
    private static final int UDP_LOG_MAX = 14;
    private static final ArrayDeque<String> UDP_LINES = new ArrayDeque<>();
    private static volatile String pickBlock = null;
    private static WeakReference<TextView> textRef = new WeakReference<>(null);

    private JtacJsonWireDisplay() {
    }

    public static void attach(TextView tv) {
        textRef = new WeakReference<>(tv);
        synchronized (UDP_LINES) {
            UDP_LINES.clear();
        }
        pickBlock = null;
        if (tv != null) {
            tv.setText(tv.getContext().getString(
                    R.string.jtac_wire_json_waiting));
        }
    }

    public static void detach() {
        textRef = new WeakReference<>(null);
    }

    /**
     * Call after {@link JtacMissionBundleStore#ingestWireJson(String)} — does not log raw JSON,
     * only a one-line receipt so the panel stays readable.
     */
    public static void noteUdpWireJsonIngested(final String rawJson) {
        if (rawJson == null) {
            return;
        }
        final String line = buildUdpReceiptLine(rawJson);
        synchronized (UDP_LINES) {
            UDP_LINES.addLast(line);
            while (UDP_LINES.size() > UDP_LOG_MAX) {
                UDP_LINES.removeFirst();
            }
        }
        MAIN.post(new Runnable() {
            @Override
            public void run() {
                rebuildPanel();
            }
        });
    }

    private static String buildUdpReceiptLine(String raw) {
        String stamp = new SimpleDateFormat("HH:mm:ss.SSS", Locale.US)
                .format(new Date());
        int len = raw.length();
        int n = JtacMissionBundleStore.getInstance().getTargetCount();
        StringBuilder hint = new StringBuilder();
        String t = raw.trim();
        if (t.startsWith("{")) {
            try {
                JSONObject o = new JSONObject(t);
                String wk = o.optString("wire_kind", "");
                if (!wk.isEmpty()) {
                    hint.append(" · ").append(wk);
                    if ("single_target".equals(wk) || "single_option".equals(wk)) {
                        String tid = o.optString("target_id", "");
                        if (tid.isEmpty() && o.has("target")) {
                            tid = o.optJSONObject("target").optString("target_id", "");
                        }
                        if (!tid.isEmpty()) {
                            hint.append(" · ").append(tid);
                        }
                    }
                } else if (o.has("targets")) {
                    hint.append(" · targets[]");
                }
            } catch (JSONException ignored) {
            }
        }
        return "[" + stamp + "] JSON received · " + len + " UTF-8 chars · "
                + n + " target(s) in memory" + hint;
    }

    /**
     * Short note in the UDP text area after a map pick; full JSON is shown in
     * {@link JtacRecoOptionPanel}.
     */
    public static void setLastPickSummary(final String mapUid, final String targetId) {
        pickBlock = "──────── Last map pick ────────\n"
                + "target_id: " + targetId + "\n"
                + "map_uid: " + mapUid + "\n"
                + "(choose a 9-line / reco package in the panel below)";
        MAIN.post(new Runnable() {
            @Override
            public void run() {
                rebuildPanel();
            }
        });
    }

    private static void rebuildPanel() {
        TextView tv = textRef.get();
        if (tv == null) {
            return;
        }
        String waiting = tv.getContext().getString(R.string.jtac_wire_json_waiting);
        StringBuilder sb = new StringBuilder();
        sb.append(tv.getContext().getString(R.string.jtac_wire_panel_intro));
        sb.append("\n\n");
        synchronized (UDP_LINES) {
            if (UDP_LINES.isEmpty()) {
                sb.append(waiting).append("\n");
            } else {
                for (String line : UDP_LINES) {
                    sb.append(line).append('\n');
                }
            }
        }
        if (pickBlock != null) {
            sb.append("\n").append(pickBlock);
        }
        String out = sb.toString();
        if (out.length() > MAX_CHARS) {
            out = out.substring(out.length() - MAX_CHARS);
        }
        tv.setText(out);
        scrollParentToBottom(tv);
    }

    private static void scrollParentToBottom(TextView tv) {
        View parent = (View) tv.getParent();
        while (parent != null) {
            if (parent instanceof ScrollView) {
                final ScrollView sv = (ScrollView) parent;
                sv.post(new Runnable() {
                    @Override
                    public void run() {
                        sv.fullScroll(View.FOCUS_DOWN);
                    }
                });
                break;
            }
            if (parent.getParent() instanceof View) {
                parent = (View) parent.getParent();
            } else {
                break;
            }
        }
    }
}
