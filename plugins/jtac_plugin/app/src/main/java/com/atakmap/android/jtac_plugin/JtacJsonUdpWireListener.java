package com.atakmap.android.jtac_plugin;

import com.atakmap.coremap.log.Log;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * Listens on UDP port {@link #PORT} for:
 * <ul>
 *   <li>Chunked wire format {@code JTCH} (see {@link JtacJsonChunkReassembler})</li>
 *   <li>Legacy: plain UTF-8 in one datagram (small JSON only)</li>
 * </ul>
 */
public final class JtacJsonUdpWireListener implements Runnable {

    public static final String TAG = "JtacJsonUdpWire";
    public static final int PORT = 6970;

    private final Thread thread;
    private volatile DatagramSocket socket;
    private volatile boolean stopped;
    private final JtacJsonChunkReassembler reassembler = new JtacJsonChunkReassembler();

    public JtacJsonUdpWireListener() {
        this.thread = new Thread(this, "jtac-plugin-udp-wire");
    }

    public void start() {
        stopped = false;
        thread.start();
    }

    public void stop() {
        stopped = true;
        reassembler.reset();
        DatagramSocket s = socket;
        if (s != null && !s.isClosed()) {
            s.close();
        }
        thread.interrupt();
    }

    @Override
    public void run() {
        try {
            DatagramSocket ds = new DatagramSocket(null);
            ds.setReuseAddress(true);
            ds.bind(new InetSocketAddress(PORT));
            socket = ds;
            Log.i(TAG, "listening for JSON on UDP port " + PORT);
            byte[] buf = new byte[65507];
            while (!stopped && !Thread.currentThread().isInterrupted()) {
                DatagramPacket pkt = new DatagramPacket(buf, buf.length);
                ds.receive(pkt);
                int len = pkt.getLength();
                if (len <= 0) {
                    continue;
                }
                byte[] copy = Arrays.copyOfRange(pkt.getData(), pkt.getOffset(),
                        pkt.getOffset() + len);
                if (JtacJsonChunkReassembler.looksLikeChunkedWire(copy, 0, copy.length)) {
                    reassembler.feed(copy, 0, copy.length);
                } else {
                    String text = new String(copy, StandardCharsets.UTF_8);
                    JtacMissionBundleStore.getInstance().ingestWireJson(text);
                    JtacJsonWireDisplay.noteUdpWireJsonIngested(text);
                }
            }
        } catch (Exception e) {
            if (!stopped) {
                Log.e(TAG, "UDP wire listener stopped: " + e.getMessage(), e);
            }
        } finally {
            DatagramSocket s = socket;
            socket = null;
            if (s != null && !s.isClosed()) {
                try {
                    s.close();
                } catch (Exception ignored) {
                }
            }
            Log.i(TAG, "UDP wire listener exit");
        }
    }
}
