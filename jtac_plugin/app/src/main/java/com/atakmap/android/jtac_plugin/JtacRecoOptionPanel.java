package com.atakmap.android.jtac_plugin;

import android.view.View;
import android.widget.Button;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.ViewFlipper;

import com.atakmap.android.jtac_plugin.plugin.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;

/**
 * After a hostile map-pick: choose option A or B, then read a formatted nine-line
 * (plain text). Back returns to the two-box screen.
 */
public final class JtacRecoOptionPanel {

    private static final int PAGE_CHOOSE = 0;
    private static final int PAGE_DETAIL = 1;

    private final View root;
    private final TextView sectionTitle;
    private final ViewFlipper flipper;
    private final Button boxA;
    private final Button boxB;
    private final Button backBtn;
    private final TextView detailFormatted;
    private final ScrollView detailScroll;

    public JtacRecoOptionPanel(View helloRoot) {
        root = helloRoot.findViewById(R.id.jtac_reco_panel);
        sectionTitle = helloRoot.findViewById(R.id.jtac_reco_section_title);
        flipper = helloRoot.findViewById(R.id.jtac_reco_flipper);
        boxA = helloRoot.findViewById(R.id.jtac_reco_box_a);
        boxB = helloRoot.findViewById(R.id.jtac_reco_box_b);
        backBtn = helloRoot.findViewById(R.id.jtac_reco_back);
        detailFormatted = helloRoot.findViewById(R.id.jtac_reco_detail_formatted);
        detailScroll = helloRoot.findViewById(R.id.jtac_reco_detail_scroll);

        backBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                flipper.setDisplayedChild(PAGE_CHOOSE);
            }
        });
    }

    public void dispose() {
        if (root != null) {
            root.setVisibility(View.GONE);
        }
        if (flipper != null) {
            flipper.setDisplayedChild(PAGE_CHOOSE);
        }
    }

    public void showForTarget(String targetId, String mapUid, JSONObject target) {
        if (root == null || flipper == null || boxA == null || boxB == null) {
            return;
        }
        root.setVisibility(View.VISIBLE);
        flipper.setDisplayedChild(PAGE_CHOOSE);

        String title = root.getContext().getString(
                R.string.jtac_reco_section_fmt, targetId, mapUid);
        sectionTitle.setText(title);

        JSONArray opts = target != null ? target.optJSONArray("options") : null;
        if (opts == null) {
            opts = new JSONArray();
        }

        if (opts.length() == 0) {
            boxA.setVisibility(View.VISIBLE);
            boxA.setText(root.getContext().getString(R.string.jtac_reco_box_no_options));
            boxA.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    showFormattedDetail(target != null ? target : new JSONObject(),
                            true);
                }
            });
            boxB.setVisibility(View.GONE);
            boxB.setOnClickListener(null);
        } else if (opts.length() == 1) {
            wireOptionBox(boxA, opts, 0);
            boxB.setVisibility(View.VISIBLE);
            boxB.setText(root.getContext().getString(R.string.jtac_reco_box_full_target));
            boxB.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    showFormattedDetail(target != null ? target : new JSONObject(),
                            true);
                }
            });
        } else {
            wireOptionBox(boxA, opts, 0);
            wireOptionBox(boxB, opts, 1);
        }

        if (detailScroll != null) {
            detailScroll.post(new Runnable() {
                @Override
                public void run() {
                    detailScroll.scrollTo(0, 0);
                }
            });
        }
    }

    private void wireOptionBox(final Button box, JSONArray opts, int index) {
        final JSONObject opt = opts.optJSONObject(index);
        if (opt == null) {
            box.setVisibility(View.GONE);
            box.setOnClickListener(null);
            return;
        }
        box.setVisibility(View.VISIBLE);
        box.setText(buildBoxLabel(opt, index));
        box.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showFormattedDetail(opt, false);
            }
        });
    }

    private void showFormattedDetail(JSONObject payload, boolean wholeTarget) {
        if (detailFormatted == null || flipper == null) {
            return;
        }
        String txt = wholeTarget
                ? JtacNineLineFormatter.formatFromTarget(payload)
                : JtacNineLineFormatter.formatFromOption(payload);
        detailFormatted.setText(txt);
        flipper.setDisplayedChild(PAGE_DETAIL);
        if (detailScroll != null) {
            detailScroll.post(new Runnable() {
                @Override
                public void run() {
                    detailScroll.scrollTo(0, 0);
                }
            });
        }
    }

    private static String buildBoxLabel(JSONObject opt, int index) {
        String role = opt.optString("role", "").trim();
        if (role.isEmpty()) {
            role = "Option " + (index + 1);
        } else {
            role = role.substring(0, 1).toUpperCase(Locale.US)
                    + role.substring(1).toLowerCase(Locale.US);
        }
        JSONObject rec = opt.optJSONObject("recommendation");
        String mun = "";
        if (rec != null) {
            JSONObject m = rec.optJSONObject("munition");
            if (m != null) {
                JSONObject p = m.optJSONObject("primary");
                if (p != null) {
                    mun = p.optString("id", "");
                }
            }
        }
        String nine = "";
        if (rec != null && rec.has("nine_line")) {
            nine = "\n9-line: included";
        }
        StringBuilder sb = new StringBuilder(role);
        if (!mun.isEmpty()) {
            sb.append("\n").append(mun);
        }
        sb.append(nine);
        return sb.toString();
    }
}
