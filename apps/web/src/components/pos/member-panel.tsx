"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { type LocalCustomer, db } from "@/lib/db";
import { formatWA, memberCodeFromUlid, normalizeHandle, normalizeWA } from "@/lib/member/member";
import { enqueueOfflineAction } from "@/lib/sync/queue";
import { useLiveQuery } from "dexie-react-hooks";
import { Search, UserPlus } from "lucide-react";
import { useState } from "react";
import { ulid } from "ulid";

/**
 * Cari atau daftarkan member, lalu tempelkan ke transaksi yang sedang
 * berjalan. Seluruhnya LOKAL: member didaftarkan ke IndexedDB + antrean
 * sync, jadi tetap bisa saat toko offline. Kasir tidak pernah dipaksa
 * memakai member (CLAUDE.md §5).
 *
 * Syarat daftar dari pemilik Warung Wangi: nomor WA wajib, akun media sosial
 * opsional, dan calon member WAJIB sudah follow akun TikTok toko.
 */
export function MemberPanel({
  tenantId,
  outletId,
  storeHandle,
  onClose,
  onSelect,
}: {
  tenantId: string;
  outletId: string;
  /** Akun TikTok toko dari Pengaturan; kosong = kalimat umum. */
  storeHandle?: string | null;
  onClose: () => void;
  onSelect: (member: LocalCustomer) => void;
}) {
  const [mode, setMode] = useState<"cari" | "daftar">("cari");
  const [cari, setCari] = useState("");

  const semua = useLiveQuery(
    () => db.customers.where("tenant_id").equals(tenantId).toArray(),
    [tenantId],
  );
  const kunci = cari.trim().toLowerCase();
  const kunciWA = normalizeWA(cari);
  const hasil = (semua ?? [])
    .filter(
      (c) =>
        !kunci ||
        c.member_code.toLowerCase().includes(kunci) ||
        (c.name ?? "").toLowerCase().includes(kunci) ||
        (kunciWA !== "" && c.phone === kunciWA) ||
        c.phone.includes(kunci.replace(/\D/g, "") || "#"),
    )
    .slice(0, 20);

  return (
    <Modal title="Member" onClose={onClose}>
      <div className="flex flex-col gap-4 p-6">
        <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Pilih aksi member">
          {(
            [
              ["cari", "Cari member", Search],
              ["daftar", "Daftar baru", UserPlus],
            ] as const
          ).map(([k, label, Icon]) => (
            <Button
              key={k}
              role="tab"
              aria-selected={mode === k}
              size="pos"
              variant={mode === k ? "custard" : "ghost"}
              className={`gap-2 ${mode === k ? "" : "border-card-border"}`}
              onClick={() => setMode(k)}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </Button>
          ))}
        </div>

        {mode === "cari" ? (
          <>
            <Input
              label="Kode member, nomor WA, atau nama"
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              placeholder="M-… atau 0812…"
              autoFocus
            />
            {semua && hasil.length === 0 && (
              <p className="font-sans text-sm text-main">
                {semua.length === 0
                  ? "Belum ada member di perangkat ini."
                  : "Tidak ada member yang cocok."}{" "}
                <button
                  type="button"
                  className="font-bold underline underline-offset-4"
                  onClick={() => setMode("daftar")}
                >
                  Daftarkan member baru
                </button>
              </p>
            )}
            <ul className="flex flex-col gap-2">
              {hasil.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c)}
                    className="mochi-button pos-touch-target flex w-full items-center justify-between gap-3 rounded-2xl border-2 border-card-border bg-card px-4 py-3 text-left shadow-hard-sm hover:bg-sweet-custard/40"
                  >
                    <span className="min-w-0">
                      <span className="block font-mono font-bold text-main">{c.member_code}</span>
                      <span className="block truncate font-sans text-sm text-main">
                        {c.name ? `${c.name} · ` : ""}
                        {formatWA(c.phone)}
                      </span>
                    </span>
                    {!c.merchandise_given_at && (
                      <span className="shrink-0 rounded-pill border border-card-border bg-sweet-matcha px-2 py-0.5 font-sans text-xs font-bold text-main">
                        Belum belanja
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <FormDaftar
            tenantId={tenantId}
            outletId={outletId}
            storeHandle={storeHandle}
            onDone={onSelect}
          />
        )}
      </div>
    </Modal>
  );
}

function FormDaftar({
  tenantId,
  outletId,
  storeHandle,
  onDone,
}: {
  tenantId: string;
  outletId: string;
  storeHandle?: string | null;
  onDone: (member: LocalCustomer) => void;
}) {
  const [wa, setWa] = useState("");
  const [nama, setNama] = useState("");
  const [sosmed, setSosmed] = useState("");
  const [follow, setFollow] = useState(false);
  const [coba, setCoba] = useState(false);
  const [ganda, setGanda] = useState<LocalCustomer | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);

  const waBaku = normalizeWA(wa);
  const akunToko = storeHandle ? `@${normalizeHandle(storeHandle)}` : "akun TikTok toko";
  const galatWA = coba && !waBaku ? "Isi nomor WA yang benar, mis. 0812-3456-7890" : undefined;

  const simpan = async () => {
    setCoba(true);
    if (!waBaku || !follow || menyimpan) return;
    const sudahAda = await db.customers
      .where("phone")
      .equals(waBaku)
      .filter((c) => c.tenant_id === tenantId)
      .first();
    if (sudahAda) {
      setGanda(sudahAda);
      return;
    }
    setMenyimpan(true);
    const id = ulid();
    const member: LocalCustomer = {
      id,
      tenant_id: tenantId,
      name: nama.trim() || undefined,
      phone: waBaku,
      member_code: memberCodeFromUlid(id),
      social_handle: normalizeHandle(sosmed) || undefined,
      merchandise_given_at: null,
    };
    await db.customers.put(member);
    await enqueueOfflineAction({
      tenantId,
      outletId,
      type: "customer",
      customUlid: id,
      payload: {
        id,
        name: member.name ?? "",
        phone: waBaku,
        member_code: member.member_code,
        social_handle: member.social_handle ?? "",
        follows_store_social: true,
        created_at: new Date().toISOString(),
      },
    });
    onDone(member);
  };

  return (
    <div className="flex flex-col gap-4">
      <Input
        label="Nomor WhatsApp *"
        value={wa}
        onChange={(e) => {
          setWa(e.target.value);
          setGanda(null);
        }}
        type="tel"
        inputMode="tel"
        autoComplete="off"
        placeholder="0812-3456-7890"
        error={galatWA}
        autoFocus
      />
      {ganda && (
        <output className="block rounded-2xl border-2 border-card-border bg-sweet-custard p-3 font-sans text-sm text-main">
          Nomor ini sudah terdaftar sebagai <b className="font-mono">{ganda.member_code}</b>.{" "}
          <button
            type="button"
            className="font-bold underline underline-offset-4"
            onClick={() => onDone(ganda)}
          >
            Pakai member ini
          </button>
        </output>
      )}
      <Input
        label="Nama panggilan (opsional)"
        value={nama}
        onChange={(e) => setNama(e.target.value)}
        maxLength={200}
        autoComplete="off"
      />
      <Input
        label="Akun media sosial (opsional)"
        value={sosmed}
        onChange={(e) => setSosmed(e.target.value)}
        maxLength={100}
        autoComplete="off"
        placeholder="@username TikTok / Instagram"
      />
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-card-border bg-surface p-4">
        <input
          type="checkbox"
          checked={follow}
          onChange={(e) => setFollow(e.target.checked)}
          className="mt-0.5 h-6 w-6 shrink-0 accent-sweet-strawberry"
          aria-describedby="follow-hint"
        />
        <span>
          <span className="block font-sans text-sm font-bold text-main">
            Sudah follow TikTok {akunToko} *
          </span>
          <span id="follow-hint" className="block font-sans text-xs text-main">
            Syarat menjadi member. Cek di layar ponsel pelanggan.
          </span>
        </span>
      </label>
      {coba && !follow && (
        <p role="alert" className="font-sans text-xs font-semibold text-red-700">
          Calon member wajib follow akun TikTok toko dulu.
        </p>
      )}
      <Button size="pos" variant="primary" onClick={simpan} disabled={menyimpan}>
        {menyimpan ? "Menyimpan…" : "Daftarkan & pakai"}
      </Button>
      <p className="font-sans text-xs text-main">
        Kode member dibuat otomatis dan barcode-nya dicetak di nota. Bisa didaftarkan saat offline —
        terkirim otomatis begitu online.
      </p>
    </div>
  );
}
