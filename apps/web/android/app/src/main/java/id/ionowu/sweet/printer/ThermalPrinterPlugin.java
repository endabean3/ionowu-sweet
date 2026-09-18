package id.ionowu.sweet.printer;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.os.Build;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.IOException;
import java.io.OutputStream;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Mengirim byte ESC/POS ke printer termal lewat Bluetooth klasik (SPP/RFCOMM).
 *
 * Plugin ini sengaja BODOH: ia tidak tahu apa itu struk. Tata letak disusun
 * di TypeScript (src/lib/receipt/escpos.ts) supaya bisa diuji tanpa perangkat;
 * di sini hanya ada "daftar printer yang sudah dipasangkan" dan "kirim byte".
 *
 * Ditulis sendiri, bukan memakai plugin pihak ketiga: kodenya kecil, dan
 * plugin printer komunitas umumnya dipelihara satu orang — dependensi native
 * yang ditinggal pemeliharanya akan memblokir upgrade Capacitor.
 *
 * Batasan yang disadari: hanya Bluetooth klasik. Printer yang HANYA BLE tidak
 * terjangkau; printer termal 58/80mm murah yang umum di warung memakai SPP.
 * Tidak ada pemindaian — printer dipasangkan dulu lewat Pengaturan Android,
 * sehingga izin lokasi/BLUETOOTH_SCAN tidak pernah diminta.
 */
@CapacitorPlugin(
    name = "ThermalPrinter",
    permissions = { @Permission(alias = ThermalPrinterPlugin.BLUETOOTH, strings = { Manifest.permission.BLUETOOTH_CONNECT }) }
)
public class ThermalPrinterPlugin extends Plugin {

    static final String BLUETOOTH = "bluetooth";

    /** UUID standar Serial Port Profile. */
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    /**
     * Jeda sebelum soket ditutup. flush() hanya memastikan byte keluar dari
     * ponsel, bukan sampai tercetak; menutup soket seketika membuat sebagian
     * printer murah membuang sisa buffer dan struk terpotong di tengah.
     */
    private static final long DRAIN_MS = 800;

    /**
     * Byte dikirim per potongan, bukan sekaligus. Printer termal murah punya
     * buffer penerima kecil (sering 2–4 KB) dan tidak semuanya menjalankan
     * kontrol aliran dengan benar: struk panjang yang ditulis dalam satu
     * write() bisa kehilangan ekornya — total dan kembalian, bagian yang
     * justru paling penting. Jeda singkat antar-potongan memberi printer
     * waktu mencetak sebagian isi buffernya. Untuk struk biasa (±1 KB) ini
     * hanya menambah beberapa puluh milidetik.
     */
    private static final int CHUNK_BYTES = 512;
    private static final long CHUNK_PAUSE_MS = 20;

    /** Satu utas: dua ketukan "Cetak" beruntun tidak membuka dua soket ke printer yang sama. */
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void listPaired(PluginCall call) {
        if (needsPermission()) {
            requestPermissionForAlias(BLUETOOTH, call, "listPairedPermissionResult");
            return;
        }
        doListPaired(call);
    }

    @PermissionCallback
    private void listPairedPermissionResult(PluginCall call) {
        if (needsPermission()) {
            rejectPermission(call);
            return;
        }
        doListPaired(call);
    }

    @PluginMethod
    public void print(PluginCall call) {
        if (needsPermission()) {
            requestPermissionForAlias(BLUETOOTH, call, "printPermissionResult");
            return;
        }
        doPrint(call);
    }

    @PermissionCallback
    private void printPermissionResult(PluginCall call) {
        if (needsPermission()) {
            rejectPermission(call);
            return;
        }
        doPrint(call);
    }

    /**
     * BLUETOOTH_CONNECT baru ada sejak Android 12. Sebelumnya izin BLUETOOTH
     * diberikan saat instal (manifest, maxSdkVersion 30) dan tidak perlu diminta.
     */
    private boolean needsPermission() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && getPermissionState(BLUETOOTH) != PermissionState.GRANTED;
    }

    private void rejectPermission(PluginCall call) {
        call.reject("Izin Bluetooth ditolak. Izinkan \"Perangkat di sekitar\" untuk aplikasi ini di Pengaturan.", "PERMISSION_DENIED");
    }

    /** Mengembalikan null (dan menolak call) bila Bluetooth tidak bisa dipakai. */
    private BluetoothAdapter readyAdapter(PluginCall call) {
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = manager == null ? null : manager.getAdapter();
        if (adapter == null) {
            call.reject("Perangkat ini tidak memiliki Bluetooth.", "NO_BLUETOOTH");
            return null;
        }
        if (!adapter.isEnabled()) {
            call.reject("Bluetooth mati. Nyalakan Bluetooth lalu coba lagi.", "BLUETOOTH_OFF");
            return null;
        }
        return adapter;
    }

    @SuppressLint("MissingPermission") // diperiksa needsPermission() sebelum sampai sini
    private void doListPaired(PluginCall call) {
        BluetoothAdapter adapter = readyAdapter(call);
        if (adapter == null) return;

        JSArray devices = new JSArray();
        for (BluetoothDevice device : adapter.getBondedDevices()) {
            String name = device.getName();
            JSObject item = new JSObject();
            item.put("name", name == null || name.isEmpty() ? device.getAddress() : name);
            item.put("address", device.getAddress());
            devices.put(item);
        }
        JSObject result = new JSObject();
        result.put("devices", devices);
        call.resolve(result);
    }

    private void doPrint(PluginCall call) {
        String address = call.getString("address");
        String data = call.getString("data");
        if (address == null || !BluetoothAdapter.checkBluetoothAddress(address)) {
            call.reject("Alamat printer tidak valid.", "INVALID_ARGUMENT");
            return;
        }
        if (data == null || data.isEmpty()) {
            call.reject("Data struk kosong.", "INVALID_ARGUMENT");
            return;
        }
        final byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("Data struk rusak.", "INVALID_ARGUMENT");
            return;
        }

        BluetoothAdapter adapter = readyAdapter(call);
        if (adapter == null) return;
        BluetoothDevice device = adapter.getRemoteDevice(address);

        // Koneksi RFCOMM memblokir hingga beberapa detik — tidak boleh di utas
        // bridge, atau seluruh layar kasir membeku selama printer dicari.
        io.execute(() -> {
            try {
                send(device, bytes);
                call.resolve();
            } catch (IOException e) {
                call.reject(
                    "Tidak bisa terhubung ke printer. Pastikan printer menyala, kertas terisi, dan tidak sedang tersambung ke ponsel lain.",
                    "PRINT_FAILED",
                    e
                );
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                call.reject("Pencetakan dibatalkan.", "PRINT_FAILED", e);
            }
        });
    }

    private static void send(BluetoothDevice device, byte[] bytes) throws IOException, InterruptedException {
        BluetoothSocket socket = connect(device);
        try {
            OutputStream out = socket.getOutputStream();
            for (int offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
                int length = Math.min(CHUNK_BYTES, bytes.length - offset);
                out.write(bytes, offset, length);
                out.flush();
                if (offset + length < bytes.length) Thread.sleep(CHUNK_PAUSE_MS);
            }
            Thread.sleep(DRAIN_MS);
        } finally {
            closeQuietly(socket);
        }
    }

    /**
     * Soket aman lebih dulu; bila gagal, soket tanpa enkripsi. Sebagian printer
     * murah menolak soket aman meski sudah dipasangkan. Isi struk bukan rahasia,
     * dan jangkauannya hanya beberapa meter.
     */
    @SuppressLint("MissingPermission")
    private static BluetoothSocket connect(BluetoothDevice device) throws IOException {
        BluetoothSocket secure = device.createRfcommSocketToServiceRecord(SPP_UUID);
        try {
            secure.connect();
            return secure;
        } catch (IOException first) {
            closeQuietly(secure);
            BluetoothSocket insecure = device.createInsecureRfcommSocketToServiceRecord(SPP_UUID);
            try {
                insecure.connect();
                return insecure;
            } catch (IOException second) {
                closeQuietly(insecure);
                second.addSuppressed(first);
                throw second;
            }
        }
    }

    private static void closeQuietly(BluetoothSocket socket) {
        try {
            socket.close();
        } catch (IOException ignored) {
            // Soket yang gagal ditutup tidak mengubah hasil cetak.
        }
    }

    @Override
    protected void handleOnDestroy() {
        io.shutdownNow();
    }
}
