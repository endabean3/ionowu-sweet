"use client";

import { PrinterPicker } from "@/components/pos/printer-picker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { JaringanError } from "@/lib/auth/api";
import { useAuth } from "@/lib/auth/context";
import { profilTerakhir } from "@/lib/auth/profile";
import { db } from "@/lib/db";
import { type OutletRow, cacheOutlets, fetchOutlets, patchOutlet } from "@/lib/outlet/api";
import { useReceiptPrinter } from "@/lib/printer/use-receipt-printer";
import { COLUMNS, encodeReceipt, printedText } from "@/lib/receipt/escpos";
import { type ReceiptData, notaWebLink } from "@/lib/receipt/format";
import { simpanTema, temaGelapTersimpan } from "@/lib/theme";
import { ArrowLeft, LogOut, Moon, Printer, Store, Sun } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  cashier: "Kasir",
  warehouse: "Gudang",
  sales_floor: "Sales",
};

const MAKS = 200;

interface Form {
  name: string;
  address: string;
  phone: string;
  receipt_footer: string;
  /** Teks di input; diubah ke angka saat simpan. */
  warranty_days: string;
  social_handle: string;
  /** Teks di input; diubah ke angka saat simpan. */
  bibit_percent: string;
  nota_web_url: string;
}

const kosong: Form = {
  name: "",
  address: "",
  phone: "",
  receipt_footer: "",
  warranty_days: "0",
  social_handle: "",
  bibit_percent: "0",
  nota_web_url: "",
};

function keForm(o: OutletRow): Form {
  return {
    name: o.name ?? "",
    address: o.address ?? "",
    phone: o.phone ?? "",
    receipt_footer: o.receipt_footer ?? "",
    warranty_days: String(o.warranty_days ?? 0),
    social_handle: o.social_handle ?? "",
    bibit_percent: String(o.bibit_percent ?? 0),
    nota_web_url: o.nota_web_url ?? "",
  };
}

/**
 * Pengaturan toko & perangkat.
 *
 * Ditaruh di grup (kasir), bukan (dashboard): printer dan akun harus tetap bisa
 * diatur saat toko OFFLINE. Menyimpan profil toko memang butuh server — saat
 * offline formnya tampil hanya-baca dari cache, dengan alasan yang jelas.
 *
 * Pratinjau struk disusun dari BYTE ESC/POS yang sama persis dengan yang
 * dikirim ke printer (printedText), bukan tiruan HTML — jadi apa yang terlihat
 * di sini adalah apa yang keluar dari printer, termasuk lipatan barisnya.
 */
export default function PengaturanPage() {
  const router = useRouter();
  const { user, accessToken, logout } = useAuth();
  const identitas = user ?? profilTerakhir();
  const bolehUbah = identitas?.role === "owner" || identitas?.role === "manager";
  const printer = useReceiptPrinter();

  const [outlets, setOutlets] = useState<OutletRow[] | null>(null);
  const [outletId, setOutletId] = useState("");
  const [form, setForm] = useState<Form>(kosong);
  const [offline, setOffline] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);

  useEffect(() => {
    let batal = false;
    (async () => {
      let rows: OutletRow[] = [];
      try {
        if (!accessToken) throw new JaringanError();
        rows = await fetchOutlets(accessToken);
        if (identitas?.tenant_id) await cacheOutlets(identitas.tenant_id, rows);
      } catch {
        // Offline atau sesi mati: tampilkan profil tersimpan, hanya-baca.
        setOffline(true);
        rows = identitas?.tenant_id
          ? await db.outlets.where("tenant_id").equals(identitas.tenant_id).toArray()
          : [];
      }
      if (batal) return;
      setOutlets(rows);
      if (rows.length > 0) {
        setOutletId(rows[0].id);
        setForm(keForm(rows[0]));
      }
    })();
    return () => {
      batal = true;
    };
  }, [accessToken, identitas?.tenant_id]);

  const pilihOutlet = (id: string) => {
    const o = outlets?.find((x) => x.id === id);
    if (!o) return;
    setOutletId(id);
    setForm(keForm(o));
  };

  const asli = outlets?.find((o) => o.id === outletId);
  const berubah = asli ? JSON.stringify(keForm(asli)) !== JSON.stringify(form) : false;
  const garansiHari = Number(form.warranty_days);
  const garansiSah =
    form.warranty_days.trim() !== "" &&
    Number.isInteger(garansiHari) &&
    garansiHari >= 0 &&
    garansiHari <= 365;
  const racikan = Number(form.bibit_percent);
  const racikanSah =
    form.bibit_percent.trim() !== "" && Number.isInteger(racikan) && racikan >= 0 && racikan <= 100;
  // Sama dengan cekNotaWebURL di server: https, tanpa ?/#.
  const notaUrlBersih = form.nota_web_url.trim().replace(/\/+$/, "");
  const notaUrlSah =
    notaUrlBersih === "" ||
    (/^https:\/\/[^\s/?#@]+\.[^\s/?#@]+(\/[^\s?#]*)?$/.test(notaUrlBersih) &&
      notaUrlBersih.length <= 150);
  const dapatSimpan =
    notaUrlSah &&
    bolehUbah &&
    !offline &&
    berubah &&
    form.name.trim() !== "" &&
    garansiSah &&
    racikanSah &&
    !menyimpan;

  const simpan = async () => {
    if (!accessToken || !dapatSimpan) return;
    setMenyimpan(true);
    const rapi = {
      name: form.name.trim(),
      address: form.address.trim(),
      phone: form.phone.trim(),
      receipt_footer: form.receipt_footer.trim(),
      warranty_days: garansiHari,
      social_handle: form.social_handle.trim().replace(/^@/, ""),
      bibit_percent: racikan,
      nota_web_url: notaUrlBersih,
    };
    try {
      await patchOutlet(accessToken, outletId, rapi);
      const baru = (outlets ?? []).map((o) => (o.id === outletId ? { ...o, ...rapi } : o));
      setOutlets(baru);
      setForm({
        ...rapi,
        warranty_days: String(rapi.warranty_days),
        bibit_percent: String(rapi.bibit_percent),
      });
      if (identitas?.tenant_id) await cacheOutlets(identitas.tenant_id, baru);
      toast.success("Pengaturan toko tersimpan", {
        description: "Struk berikutnya memakai data ini.",
      });
    } catch (err) {
      toast.error(
        err instanceof JaringanError
          ? "Tidak bisa menghubungi server — perubahan belum tersimpan"
          : err instanceof Error
            ? err.message
            : "Gagal menyimpan",
      );
    } finally {
      setMenyimpan(false);
    }
  };

  const kertas = printer.printer?.paper ?? 58;
  const pratinjau = useMemo(() => {
    const contoh: ReceiptData = {
      transactionId: "01CONTOHSTRUK0000000PRATINJ",
      occurredAt: new Date().toISOString(),
      outletName: form.name.trim() || "Nama toko",
      outletAddress: form.address,
      outletPhone: form.phone,
      footer: form.receipt_footer,
      warrantyDays: garansiSah ? garansiHari : 0,
      recipePercent: racikanSah ? racikan : 0,
      notaUrl: notaUrlSah
        ? notaWebLink(notaUrlBersih, "01CONTOHTENANT000000000000", "01CONTOHSTRUK0000000PRATINJ")
        : null,
      cashierName: identitas?.name ?? "Kasir",
      lines: [
        {
          name: "Bibit Parfum Vanilla",
          quantity: "30",
          unitPrice: "1500",
          discount: "0",
          uom: "ml",
        },
        { name: "Botol Spray", quantity: "1", unitPrice: "5000", discount: "0" },
      ],
      subtotal: "50000",
      taxTotal: "0",
      grandTotal: "50000",
      method: "cash",
      givenAmount: 50000,
      changeAmount: 0,
      pending: false,
    };
    return printedText(encodeReceipt(contoh, kertas)).replace(/\n+$/, "");
  }, [
    form,
    kertas,
    identitas?.name,
    garansiHari,
    garansiSah,
    racikan,
    racikanSah,
    notaUrlBersih,
    notaUrlSah,
  ]);

  const keluar = async () => {
    if (
      !window.confirm(
        "Keluar dari akun ini? Transaksi yang belum terkirim tetap tersimpan di perangkat.",
      )
    ) {
      return;
    }
    await logout();
    router.replace("/login");
  };

  // Tema pindah ke sini untuk ponsel: header kasir 360 px tidak punya ruang.
  const [gelap, setGelap] = useState(false);
  useEffect(() => setGelap(temaGelapTersimpan()), []);
  const gantiTema = (g: boolean) => {
    setGelap(g);
    simpanTema(g);
  };

  const ubah = (k: keyof Form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="min-h-[100dvh] bg-base p-3 pb-16 sm:p-4 md:p-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-3 sm:gap-4">
        {/* Lengket: halaman ini panjang di ponsel, dan jalan kembali ke kasir
           tidak boleh ada di ujung atas saja. */}
        <header className="sticky top-0 z-30 -mx-3 -mt-3 flex items-center gap-3 bg-base/95 px-3 py-2 backdrop-blur sm:static sm:m-0 sm:bg-transparent sm:p-0">
          <Link
            href="/kasir"
            aria-label="Kembali ke kasir"
            className="mochi-button flex h-11 w-11 shrink-0 items-center justify-center rounded-pill border-2 border-card-border bg-card text-main shadow-hard-sm"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <h1 className="font-display text-xl font-bold text-main sm:text-2xl">Pengaturan</h1>
        </header>

        <Card variant="solid" className="p-4 sm:p-5">
          <h2 className="mb-1 flex items-center gap-2 font-sans text-lg font-bold">
            <Store className="h-5 w-5" aria-hidden="true" />
            Profil toko & struk
          </h2>
          <p className="mb-4 font-sans text-sm text-main">
            Dicetak di bagian atas dan bawah setiap struk.
          </p>

          {outlets === null ? (
            <p className="py-6 text-center font-bold text-main">Memuat…</p>
          ) : outlets.length === 0 ? (
            <p className="font-sans text-sm text-main">
              Belum ada data toko di perangkat ini. Sambungkan ke internet lalu buka lagi.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {(offline || !bolehUbah) && (
                <output className="block rounded-2xl border-2 border-card-border bg-sweet-custard p-3 font-sans text-sm font-semibold text-main">
                  {offline
                    ? "Sedang offline — data di bawah dari penyimpanan perangkat. Perubahan bisa disimpan setelah online."
                    : "Hanya owner atau manager yang bisa mengubah profil toko."}
                </output>
              )}

              {outlets.length > 1 && (
                <label className="flex flex-col gap-1.5 font-sans text-sm font-medium text-main">
                  Toko
                  <select
                    value={outletId}
                    onChange={(e) => pilihOutlet(e.target.value)}
                    className="h-12 rounded-[22px] border-2 border-card-border/25 bg-surface px-4 text-base text-main"
                  >
                    {outlets.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <fieldset disabled={offline || !bolehUbah} className="flex flex-col gap-4">
                <Input
                  label="Nama toko"
                  value={form.name}
                  onChange={ubah("name")}
                  maxLength={MAKS}
                  autoComplete="organization"
                  error={form.name.trim() === "" ? "Nama toko wajib diisi" : undefined}
                />
                <Input
                  label="Alamat"
                  value={form.address}
                  onChange={ubah("address")}
                  maxLength={MAKS}
                  placeholder="Jl. …, Dongko, Trenggalek"
                  autoComplete="street-address"
                />
                <Input
                  label="Telepon / WhatsApp"
                  value={form.phone}
                  onChange={ubah("phone")}
                  maxLength={50}
                  type="tel"
                  inputMode="tel"
                  placeholder="0812-…"
                  autoComplete="tel"
                />
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="penutup" className="text-sm font-medium text-main">
                    Teks penutup struk
                  </label>
                  <textarea
                    id="penutup"
                    value={form.receipt_footer}
                    onChange={ubah("receipt_footer")}
                    maxLength={MAKS}
                    rows={3}
                    placeholder="Terima kasih"
                    aria-describedby="penutup-hint"
                    className="w-full resize-none rounded-[22px] border-2 border-card-border/25 bg-surface/60 px-4 py-3 text-base text-main outline-none placeholder:text-muted focus:border-card-border focus:ring-4 focus:ring-[rgba(162,232,206,0.6)] disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <p id="penutup-hint" className="text-xs text-main">
                    Mis. ucapan terima kasih, akun Instagram, atau aturan tukar barang. Kosong =
                    "Terima kasih". {form.receipt_footer.length}/{MAKS}
                  </p>
                </div>
                {/* Dua angka pendek berdampingan: masing-masing selebar layar
                   hanya memanjangkan halaman di ponsel. */}
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Garansi (hari)"
                    value={form.warranty_days}
                    onChange={ubah("warranty_days")}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={365}
                    hint="0 = tanpa garansi"
                    error={garansiSah ? undefined : "Isi 0–365 hari"}
                  />
                  <Input
                    label="Racikan % bibit"
                    value={form.bibit_percent}
                    onChange={ubah("bibit_percent")}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    hint={
                      racikanSah && racikan > 0
                        ? `${racikan} : ${100 - racikan} pelarut`
                        : "0 = tanpa racikan"
                    }
                    error={racikanSah ? undefined : "Isi 0–100"}
                  />
                </div>
                <p className="-mt-2 text-xs text-main">
                  Di nota: "Garansi {garansiSah ? garansiHari : "N"} hari s/d &lt;tanggal&gt;" dan
                  tabel takaran bibit per ukuran botol (hanya nota berisi bibit ml).
                </p>
                <Input
                  label="Akun TikTok toko"
                  value={form.social_handle}
                  onChange={ubah("social_handle")}
                  maxLength={100}
                  autoComplete="off"
                  placeholder="@warungwangi"
                  hint="Ditampilkan di form daftar member: calon member wajib follow akun ini."
                />
                <Input
                  label="Alamat web nota (QR)"
                  value={form.nota_web_url}
                  onChange={ubah("nota_web_url")}
                  maxLength={150}
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  placeholder="https://warungwangi.ionowu.com/nota"
                  hint="Nota mencetak QR ke halaman ini: pembeli bisa cek garansi dan daftar member dari HP. Kosong = tanpa QR."
                  error={notaUrlSah ? undefined : "Harus diawali https:// tanpa ? atau #"}
                />
              </fieldset>

              {bolehUbah && !offline && (
                // Lengket di dasar layar selama ada perubahan: di ponsel tombol
                // ini ada di bawah tujuh kolom, dan pemilik yang baru mengubah
                // alamat tidak tahu harus menggulir ke mana untuk menyimpan.
                <Button
                  size="pos"
                  variant="primary"
                  disabled={!dapatSimpan}
                  onClick={simpan}
                  className={berubah ? "sticky bottom-3 z-20 shadow-hard" : ""}
                >
                  {menyimpan ? "Menyimpan…" : berubah ? "Simpan" : "Tersimpan"}
                </Button>
              )}
            </div>
          )}
        </Card>

        <Card variant="solid" className="p-4 sm:p-5">
          <h2 className="mb-1 font-sans text-lg font-bold">Pratinjau struk</h2>
          <p className="mb-3 font-sans text-sm text-main">
            Persis seperti hasil cetak kertas {kertas} mm ({COLUMNS[kertas]} huruf per baris).
          </p>
          <div className="overflow-x-auto rounded-2xl border-2 border-dashed border-card-border/40 bg-white p-4">
            <pre
              aria-label="Pratinjau struk"
              className="mx-auto w-fit font-mono text-[13px] leading-5 text-black"
            >
              {pratinjau}
            </pre>
          </div>
        </Card>

        <Card variant="solid" className="p-4 sm:p-5">
          <h2 className="mb-1 flex items-center gap-2 font-sans text-lg font-bold">
            <Printer className="h-5 w-5" aria-hidden="true" />
            Printer
          </h2>
          {printer.bluetooth ? (
            <div className="flex flex-col gap-3">
              <p className="font-sans text-sm text-main">
                {printer.printer
                  ? `${printer.printer.name} · kertas ${printer.printer.paper} mm · cetak otomatis ${printer.autoPrint ? "nyala" : "mati"}`
                  : "Belum ada printer dipilih."}
              </p>
              <Button size="pos" variant="custard" onClick={printer.bukaPicker}>
                {printer.printer ? "Atur printer" : "Pilih printer"}
              </Button>
            </div>
          ) : (
            <p className="font-sans text-sm text-main">
              Di browser, struk dicetak lewat dialog cetak perangkat. Printer Bluetooth diatur dari
              aplikasi Android.
            </p>
          )}
        </Card>

        <Card variant="solid" className="p-4 sm:p-5">
          <h2 className="mb-3 font-sans text-lg font-bold">Tampilan</h2>
          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="sr-only">Tema layar</legend>
            {(
              [
                [false, "Terang", Sun],
                [true, "Gelap", Moon],
              ] as const
            ).map(([g, label, Icon]) => (
              <Button
                key={label}
                aria-pressed={gelap === g}
                size="pos"
                variant={gelap === g ? "custard" : "ghost"}
                className={`gap-2 ${gelap === g ? "" : "border-card-border"}`}
                onClick={() => gantiTema(g)}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </Button>
            ))}
          </fieldset>
          <p className="mt-2 text-xs text-main">
            Terang paling mudah dibaca di bawah sinar matahari. Berlaku di perangkat ini saja.
          </p>
        </Card>

        <Card variant="solid" className="p-4 sm:p-5">
          <h2 className="mb-3 font-sans text-lg font-bold">Akun</h2>
          <p className="font-sans text-base font-bold text-main">{identitas?.name ?? "—"}</p>
          <p className="mb-4 font-sans text-sm text-main">
            {identitas?.email}
            {identitas?.role && ` · ${ROLE_LABEL[identitas.role] ?? identitas.role}`}
          </p>
          <Button size="pos" variant="destructive" className="w-full gap-2" onClick={keluar}>
            <LogOut className="h-5 w-5" aria-hidden="true" />
            Keluar
          </Button>
        </Card>
      </div>

      {printer.pickerOpen && <PrinterPicker rp={printer} />}
    </div>
  );
}
