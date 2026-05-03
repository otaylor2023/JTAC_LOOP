package com.atakmap.android.jtac_plugin;

import com.atakmap.coremap.log.Log;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Reassembles chunked UDP wire format from {@link JtacJsonUdpWireListener}.
 * Header (20 bytes, big-endian): magic JTCH, version, reserved, msg_id (u64),
 * chunk_idx (u16), chunk_total (u16), body_len (u16), then body bytes.
 */
public final class JtacJsonChunkReassembler {

    private static final String TAG = "JtacJsonChunkReassembler";
    private static final int HEADER_LEN = 20;
    private static final byte[] MAGIC = {'J', 'T', 'C', 'H'};
    private static final int MAX_CHUNKS = 512;
    private static final long STALE_MS = 8000L;
    private static final int MAX_MESSAGES = 8;

    private static final class State {
        final int total;
        final byte[][] chunks;
        int filled;
        long lastMs;

        State(int total) {
            this.total = total;
            this.chunks = new byte[total][];
            this.lastMs = System.currentTimeMillis();
        }
    }

    private final LinkedHashMap<Long, State> states = new LinkedHashMap<>(16, 0.75f, true);

    public synchronized void reset() {
        states.clear();
    }

    /**
     * @return true if this was a chunk packet (consumed); false if not our format
     */
    public boolean feed(byte[] data, int offset, int length) {
        if (length < HEADER_LEN || !isMagic(data, offset)) {
            return false;
        }
        ByteBuffer bb = ByteBuffer.wrap(data, offset, HEADER_LEN).order(ByteOrder.BIG_ENDIAN);
        bb.position(4);
        int version = bb.get() & 0xff;
        bb.get(); // reserved
        long msgId = bb.getLong();
        int chunkIdx = bb.getShort() & 0xffff;
        int chunkTotal = bb.getShort() & 0xffff;
        int bodyLen = bb.getShort() & 0xffff;

        if (version != 1 || chunkTotal < 1 || chunkTotal > MAX_CHUNKS
                || chunkIdx >= chunkTotal || bodyLen < 0
                || offset + HEADER_LEN + bodyLen > length) {
            Log.w(TAG, "bad chunk header: ver=" + version + " total=" + chunkTotal
                    + " idx=" + chunkIdx + " bodyLen=" + bodyLen + " pktLen=" + length);
            return true;
        }

        pruneStaleLocked();
        while (states.size() >= MAX_MESSAGES) {
            Iterator<Map.Entry<Long, State>> it = states.entrySet().iterator();
            if (it.hasNext()) {
                it.next();
                it.remove();
            } else {
                break;
            }
        }

        byte[] body = Arrays.copyOfRange(data, offset + HEADER_LEN, offset + HEADER_LEN + bodyLen);

        State st = states.get(msgId);
        if (st == null) {
            st = new State(chunkTotal);
            states.put(msgId, st);
        } else if (st.total != chunkTotal) {
            Log.w(TAG, "chunk_total mismatch for msgId=" + msgId + "; resetting");
            st = new State(chunkTotal);
            states.put(msgId, st);
        }

        st.lastMs = System.currentTimeMillis();
        if (st.chunks[chunkIdx] == null) {
            st.chunks[chunkIdx] = body;
            st.filled++;
        } else {
            st.chunks[chunkIdx] = body;
        }

        if (st.filled < st.total) {
            return true;
        }

        int totalBytes = 0;
        for (byte[] c : st.chunks) {
            totalBytes += c.length;
        }
        byte[] full = new byte[totalBytes];
        int pos = 0;
        for (byte[] c : st.chunks) {
            System.arraycopy(c, 0, full, pos, c.length);
            pos += c.length;
        }
        states.remove(msgId);

        String json = new String(full, StandardCharsets.UTF_8);
        JtacMissionBundleStore.getInstance().ingestWireJson(json);
        JtacJsonWireDisplay.noteUdpWireJsonIngested(json);
        return true;
    }

    private void pruneStaleLocked() {
        long now = System.currentTimeMillis();
        Iterator<Map.Entry<Long, State>> it = states.entrySet().iterator();
        while (it.hasNext()) {
            Map.Entry<Long, State> e = it.next();
            if (now - e.getValue().lastMs > STALE_MS) {
                it.remove();
            }
        }
    }

    private static boolean isMagic(byte[] data, int offset) {
        for (int i = 0; i < 4; i++) {
            if (data[offset + i] != MAGIC[i]) {
                return false;
            }
        }
        return true;
    }

    public static boolean looksLikeChunkedWire(byte[] data, int offset, int length) {
        return length >= HEADER_LEN && isMagic(data, offset);
    }
}
