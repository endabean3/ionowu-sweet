"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { JaringanError } from "@/lib/auth/api";
import { RiwayatError, aturPinSendiri } from "@/lib/sales/api";
import { KeyRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * PIN persetujuan owner/manager.
 *
 * Inilah yang membuat kasir bisa refund atau membatalkan transaksi tanpa
 * seseorang harus LOGIN sebagai manager di mesin kasir — manager cukup
 * datang dan mengetik PIN-nya. Sebelum ini tidak ada satu pun jalur untuk
 * mengisinya selain seeder data contoh, jadi di produksi alur persetujuan
 * kasir tidak pernah bisa dipakai meski servernya sudah mendukungnya.
 *
 * Password diminta lagi walau sesi sudah hidup: PIN ini dipakai menyetujui
 * uang keluar TANPA login, jadi siapa pun yang menemukan ponsel manager
 * dalam keadaan terbuka tidak boleh bisa menanam PIN miliknya sendiri.
 */
export function PinPersetujuan({
  accessToken,
  onTersimpan,
}: {
  accessToken: string | null;
  /** Dipanggil setelah PIN berubah, supaya kartu Karyawan di halaman yang
   *  sama ikut menyegarkan penanda "PIN aktif" — tanpa ini daftar tetap
   *  berbunyi "PIN belum diatur" padahal PIN-nya baru saja disimpan. */
  onTersimpan?: () => void;
}) {
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [coba, setCoba] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);

  const pinSah = pin.trim() === "" || /^[0-9]{4,8}$/.test(pin.trim());
  const sah = password !== "" && pinSah;

  const simpan = async () => {
    setCoba(true);
    if (!sah || !accessToken || menyimpan) return;
    setMenyimpan(true);
    try {
      const { punya_pin } = await aturPinSendiri(accessToken, password, pin.trim());
      toast.success(
        punya_pin
          ? "PIN persetujuan disimpan"
          : "PIN dihapus — persetujuan tidak bisa dipakai lagi",
      );
      setPassword("");
      setPin("");
      setCoba(false);
      onTersimpan?.();
    } catch (err) {
      toast.error(
        err instanceof JaringanError
          ? "Tidak bisa menghubungi server. Coba lagi saat online."
          : err instanceof RiwayatError
            ? err.message
            : "Gagal menyimpan PIN",
      );
    } finally {
      setMenyimpan(false);
    }
  };

  return (
    <Card variant="solid" className="p-4 sm:p-5">
      <h2 className="mb-1 flex items-center gap-2 font-sans text-lg font-bold">
        <KeyRound className="h-5 w-5" aria-hidden="true" />
        PIN persetujuan
      </h2>
      <p className="mb-4 font-sans text-sm text-main">
        Dipakai saat kasir perlu refund, membatalkan transaksi, atau memberi diskon besar. Kasir
        tetap di akunnya sendiri; Anda cukup mengetik PIN di layarnya.
      </p>
      <div className="flex flex-col gap-3">
        <Input
          label="Password akun Anda"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={coba && password === "" ? "Password wajib diisi" : undefined}
          hint="Diminta lagi karena PIN ini menyetujui uang keluar tanpa login."
        />
        <Input
          label="PIN baru (4–8 angka)"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          error={coba && !pinSah ? "PIN harus 4–8 angka" : undefined}
          hint="Kosongkan untuk MENGHAPUS PIN — setelah itu Anda tidak bisa menyetujui apa pun."
        />
        <Button
          size="pos"
          variant="primary"
          className="w-full"
          disabled={menyimpan || !accessToken}
          onClick={simpan}
        >
          {menyimpan ? "Menyimpan…" : "Simpan PIN"}
        </Button>
      </div>
    </Card>
  );
}
