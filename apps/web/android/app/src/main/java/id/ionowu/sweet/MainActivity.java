package id.ionowu.sweet;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import id.ionowu.sweet.printer.ThermalPrinterPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin lokal (bukan paket npm) tidak ditemukan otomatis oleh
        // `cap sync`; WAJIB didaftarkan sebelum super.onCreate membuat bridge.
        registerPlugin(ThermalPrinterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
