"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { JaringanError } from "@/lib/auth/api";
import { type Approver, type Persetujuan, fetchApprovers } from "@/lib/sales/api";
import { useEffect, useState } from "react";

/**
 * Persetujuan PIN manager untuk aksi yang tidak boleh dilakukan kasir
 * sendiri: refund, void, dan diskon besar (RBAC-MODEL §Matriks).
 *
 * Alurnya sengaja "manajer datang ke mesin kasir", bukan "kasir login
 * sebagai manajer": kasir tetap berada di sesinya, dan yang berpindah
 * tangan hanya PIN. Karena itu yang dikirim ke server adalah identitas
 * manajer + PIN-nya (`approver_user_id` + `pin`), sementara token yang
 * dipakai tetap milik kasir — jejak audit menyebut keduanya.
 *
 * PIN TIDAK pernah disimpan di perangkat, bahkan sementara: begitu dialog
 * ditutup, nilainya hilang bersama komponennya.
 */
export function PinManager({
  accessToken,
  judul,
  keterangan,
  onBatal,
  onSetuju,
}: {
  accessToken: string | null;
  /** Mis. "Refund butuh persetujuan manager". */
  judul: string;
  /** Satu kalimat tentang APA yang sedang disetujui, mis. nominalnya. */
  keterangan?: string;
  onBatal: () => void;
  onSetuju: (p: Persetujuan) => void;
}) {
  const [daftar, setDaftar] = useState<Approver[] | null>(null);
  const [pilih, setPilih] = useState<string>("");
  const [pin, setPin] = useState("");
  const [coba, setCoba] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let batal = false;
    void fetchApprovers(accessToken)
      .then((rows) => {
        if (batal) return;
        setDaftar(rows);
        // Manager tanpa PIN tidak bisa menyetujui apa pun, jadi jangan
        // dijadikan pilihan awal — kasir akan mengetik PIN yang pasti salah.
        setPilih(rows.find((a) => a.punya_pin)?.id ?? "");
      })
      .catch((err) => {
        if (batal) return;
        setDaftar([]);
        setGalat(
          err instanceof JaringanError
            ? "Tidak bisa menghubungi server. Persetujuan manager butuh koneksi."
            : "Gagal memuat daftar manager",
        );
      });
    return () => {
      batal = true;
    };
  }, [accessToken]);

  const adaYangBisa = (daftar ?? []).some((a) => a.punya_pin);
  const sah = pilih !== "" && pin.trim().length >= 4;

  return (
    <Modal
      title={judul}
      onClose={onBatal}
      footer={
        <div className="flex gap-2">
          <Button size="pos" variant="ghost" className="border-card-border" onClick={onBatal}>
            Batal
          </Button>
          <Button
            size="pos"
            variant="primary"
            className="flex-1"
            disabled={!adaYangBisa}
            onClick={() => {
              setCoba(true);
              if (!sah) return;
              onSetuju({ approver_user_id: pilih, pin: pin.trim() });
            }}
          >
            Setujui
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        {keterangan && <p className="font-sans text-sm font-semibold text-main">{keterangan}</p>}

        {galat && (
          <output className="block rounded-2xl border-2 border-card-border bg-sweet-custard p-3 font-sans text-sm font-semibold text-main">
            {galat}
          </output>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="approver" className="text-sm font-medium text-main">
            Manager yang menyetujui
          </label>
          <select
            id="approver"
            value={pilih}
            onChange={(e) => setPilih(e.target.value)}
            disabled={daftar === null}
            className="pos-touch-target w-full rounded-2xl border-2 border-card-border bg-card px-4 font-sans text-base font-bold text-main"
          >
            {daftar === null && <option value="">Memuat…</option>}
            {(daftar ?? []).map((a) => (
              <option key={a.id} value={a.id} disabled={!a.punya_pin}>
                {a.name} ({a.role === "owner" ? "pemilik" : "manager"})
                {a.punya_pin ? "" : " — PIN belum diatur"}
              </option>
            ))}
          </select>
        </div>

        <Input
          label="PIN manager"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          maxLength={32}
          error={coba && !sah ? "Pilih manager dan isi PIN (minimal 4 angka)" : undefined}
          hint="Diketik oleh manager, bukan kasir. PIN tidak disimpan di perangkat ini."
        />

        {daftar !== null && !adaYangBisa && (
          <p className="font-sans text-xs font-semibold text-main">
            Belum ada manager yang mengatur PIN. Selama itu, aksi ini hanya bisa dilakukan dengan
            akun owner atau manager.
          </p>
        )}
      </div>
    </Modal>
  );
}
