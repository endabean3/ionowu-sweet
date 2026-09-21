"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { JaringanError } from "@/lib/auth/api";
import { useAuth } from "@/lib/auth/context";
import { MemberError, type MemberRow, fetchMembers, patchMember } from "@/lib/member/api";
import { formatWA } from "@/lib/member/member";
import Decimal from "decimal.js";
import { ArrowLeft, Gift, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const rupiah = (v: Decimal.Value) =>
  `Rp ${new Decimal(v || 0).toDecimalPlaces(0).toNumber().toLocaleString("id-ID")}`;

const tanggal = (iso?: string | null) =>
  iso
    ? new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Jakarta",
      }).format(new Date(iso))
    : "—";

/**
 * Daftar member.
 *
 * Sebelum layar ini, member hanya bisa DICARI dari kolom kasir — tidak ada
 * cara melihat siapa saja yang terdaftar, memperbaiki nomor WA yang salah
 * ketik, atau mengetahui siapa yang belum menerima merchandise perdananya.
 */
export default function MemberPage() {
  const { accessToken } = useAuth();
  const [cari, setCari] = useState("");
  const [rows, setRows] = useState<MemberRow[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [ubah, setUbah] = useState<MemberRow | null>(null);

  const muat = useCallback(
    async (q: string) => {
      if (!accessToken) return;
      setMemuat(true);
      setGalat(null);
      try {
        setRows(await fetchMembers(accessToken, q));
      } catch (err) {
        setRows(null);
        setGalat(
          err instanceof JaringanError
            ? "Tidak bisa menghubungi server. Daftar member butuh koneksi."
            : err instanceof MemberError
              ? err.message
              : "Gagal memuat member",
        );
      } finally {
        setMemuat(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    // Jeda ketik: mengetik "081234" tanpa ini mengirim enam permintaan, dan
    // jawaban yang datang tidak berurutan bisa menampilkan hasil ketikan lama.
    const t = setTimeout(() => void muat(cari), 300);
    return () => clearTimeout(t);
  }, [cari, muat]);

  const simpan = async (m: MemberRow, patch: Parameters<typeof patchMember>[2]) => {
    if (!accessToken) return;
    try {
      await patchMember(accessToken, m.id, patch);
      toast.success("Member diperbarui");
      setUbah(null);
      await muat(cari);
    } catch (err) {
      toast.error(
        err instanceof JaringanError
          ? "Tidak bisa menghubungi server. Coba lagi saat online."
          : err instanceof MemberError
            ? err.message
            : "Gagal menyimpan",
      );
    }
  };

  return (
    <div className="min-h-[100dvh] bg-base p-3 sm:p-4 md:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:gap-4">
        <header className="sticky top-0 z-30 -mx-3 -mt-3 flex items-center gap-3 bg-base/95 px-3 py-2 backdrop-blur sm:static sm:m-0 sm:bg-transparent sm:p-0">
          <Link
            href="/dashboard"
            aria-label="Kembali ke dasbor"
            className="mochi-button flex h-11 w-11 shrink-0 items-center justify-center rounded-pill border-2 border-card-border bg-card text-main shadow-hard-sm"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <h1 className="flex-1 font-display text-xl font-bold text-main sm:text-2xl">Member</h1>
          <button
            type="button"
            onClick={() => void muat(cari)}
            disabled={memuat}
            aria-label="Muat ulang daftar member"
            className="mochi-button flex h-11 w-11 items-center justify-center rounded-pill border-2 border-card-border bg-card text-main shadow-hard-sm disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${memuat ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
        </header>

        <div className="relative">
          <input
            type="text"
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari nama, nomor WA, atau kode member"
            aria-label="Cari member"
            className="pos-touch-target w-full rounded-pill border-2 border-card-border bg-card py-2 pl-4 pr-11 font-sans text-base font-bold text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-sweet-strawberry"
          />
          <Search
            className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
        </div>

        {galat && (
          <output className="block rounded-2xl border-2 border-card-border bg-sweet-custard p-3 font-sans text-sm font-semibold text-main">
            {galat}
          </output>
        )}

        <p className="font-sans text-sm font-bold text-main">
          {rows === null ? "Memuat…" : `${rows.length} member`}
        </p>

        <ul aria-label="Daftar member" className="flex flex-col gap-2">
          {rows?.length === 0 && (
            <li className="rounded-squircle border-2 border-dashed border-card-border p-10 text-center font-bold text-muted">
              {cari ? `Tidak ada member cocok dengan "${cari}".` : "Belum ada member terdaftar."}
            </li>
          )}
          {(rows ?? []).map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setUbah(m)}
                aria-label={`Ubah member ${m.member_code}`}
                className="mochi-button flex w-full items-center gap-3 rounded-squircle-sm border-2 border-card-border bg-card px-3 py-2.5 text-left shadow-hard-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-sans text-sm font-bold text-main">
                    {m.name || "Tanpa nama"} · {m.member_code}
                  </p>
                  <p className="truncate font-sans text-xs text-main">
                    {formatWA(m.phone)}
                    {m.social_handle ? ` · @${m.social_handle}` : ""}
                  </p>
                  <p className="font-sans text-xs text-muted">
                    {m.jumlah_transaksi}× belanja · terakhir {tanggal(m.last_seen_at)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono text-sm font-bold tabular-nums text-main">
                    {rupiah(m.total_belanja)}
                  </p>
                  {/* Penanda merchandise: yang BELUM menerima ditonjolkan,
                     karena itulah tindakan yang menunggu dilakukan. */}
                  {m.merchandise_given_at ? (
                    <p className="font-sans text-xs text-muted">merchandise ✓</p>
                  ) : (
                    <p className="inline-flex items-center gap-1 rounded-pill border border-card-border bg-sweet-custard px-2 py-0.5 font-sans text-xs font-bold text-main">
                      <Gift className="h-3 w-3" aria-hidden="true" />
                      belum
                    </p>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {ubah && <UbahMember member={ubah} onClose={() => setUbah(null)} onSimpan={simpan} />}
    </div>
  );
}

function UbahMember({
  member,
  onClose,
  onSimpan,
}: {
  member: MemberRow;
  onClose: () => void;
  onSimpan: (m: MemberRow, patch: Parameters<typeof patchMember>[2]) => Promise<void>;
}) {
  const [nama, setNama] = useState(member.name ?? "");
  const [wa, setWa] = useState(formatWA(member.phone));
  const [sosial, setSosial] = useState(member.social_handle ?? "");
  const [merch, setMerch] = useState(!!member.merchandise_given_at);
  const [menyimpan, setMenyimpan] = useState(false);

  return (
    <Modal
      title={`Member ${member.member_code}`}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button size="pos" variant="ghost" className="border-card-border" onClick={onClose}>
            Batal
          </Button>
          <Button
            size="pos"
            variant="primary"
            className="flex-1"
            disabled={menyimpan}
            onClick={async () => {
              setMenyimpan(true);
              await onSimpan(member, {
                name: nama.trim(),
                phone: wa.trim(),
                social_handle: sosial.trim(),
                merchandise_given: merch,
              });
              setMenyimpan(false);
            }}
          >
            {menyimpan ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <p className="font-sans text-sm text-main">
          Terdaftar {tanggal(member.first_seen_at)} · {member.jumlah_transaksi}× belanja ·{" "}
          {rupiah(member.total_belanja)}
        </p>

        <Input
          label="Nama"
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          maxLength={200}
        />
        <Input
          label="Nomor WhatsApp"
          value={wa}
          onChange={(e) => setWa(e.target.value)}
          inputMode="tel"
          hint="Diperbaiki di sini bila salah ketik — pengingat WA kelak dikirim ke nomor ini."
        />
        <Input
          label="Akun sosial media"
          value={sosial}
          onChange={(e) => setSosial(e.target.value)}
          maxLength={100}
          placeholder="(kosong)"
        />

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-card-border bg-surface p-4">
          <input
            type="checkbox"
            checked={merch}
            onChange={(e) => setMerch(e.target.checked)}
            className="mt-0.5 h-6 w-6 shrink-0 accent-sweet-strawberry"
          />
          <span>
            <span className="block font-sans text-sm font-bold text-main">
              Merchandise perdana sudah diberikan
            </span>
            <span className="block font-sans text-xs text-main">
              Terisi otomatis pada pembelian pertama. Matikan bila ternyata belum sempat diserahkan
              — kasir akan diingatkan lagi di transaksi berikutnya.
            </span>
          </span>
        </label>

        <p className="font-sans text-xs text-muted">
          Kode member tidak bisa diubah: barcodenya sudah tercetak di nota yang dipegang pelanggan.
        </p>
      </div>
    </Modal>
  );
}
