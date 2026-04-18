import { motion } from "framer-motion";
import { ArrowLeft, Download, Home, Printer, QrCode, RefreshCw, Ticket, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import TicketCard from "../../components/ticket/TicketCard";
import { getBookingById, getBookingTicketPdf } from "../../services/booking.service";

export default function TicketPage() {
  const { bookingId } = useParams();

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");

  const ticketElementId = booking?._id ? `ticket-pdf-${booking._id}` : "ticket-pdf";

  const loadBooking = async () => {
    if (!bookingId) {
      setError("Missing booking id");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await getBookingById(bookingId);
      setBooking(data || null);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to load ticket");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line no-void
    void loadBooking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  useEffect(() => {
    if (!booking?._id) return;

    let active = true;
    void (async () => {
      try {
        const { default: QRCode } = await import("qrcode");
        const url = await QRCode.toDataURL(String(booking._id), {
          width: 240,
          margin: 1,
          color: {
            dark: "#5b21b6",
            light: "#ffffff",
          },
        });

        if (!active) return;
        setQrCodeUrl(url);
      } catch {
        if (!active) return;
        setQrCodeUrl("");
      }
    })();

    return () => {
      active = false;
    };
  }, [booking?._id]);

  const onDownloadPDF = async () => {
    if (!booking?._id || downloading) return;

    setDownloading(true);
    try {
      const { blob, filename } = await getBookingTicketPdf(booking._id);
      const blobUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = filename || `ticket-${booking._id}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Delay revocation slightly so browsers finish handling the download stream.
      window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1500);
    } catch (e) {
      const msg = e?.message || "Failed to generate ticket PDF";
      // eslint-disable-next-line no-alert
      alert(msg);
    } finally {
      setDownloading(false);
    }
  };

  const onPrintTicket = async () => {
    if (printing) return;

    const ticketElement = document.getElementById(ticketElementId);
    if (!ticketElement) {
      // eslint-disable-next-line no-alert
      alert("Ticket layout not ready. Please refresh and try again.");
      return;
    }

    setPrinting(true);
    try {
      const printWindow = window.open("", "_blank", "width=1000,height=900");
      if (!printWindow) {
        throw new Error("Popup blocked. Please allow popups to print ticket.");
      }

      printWindow.document.open();
      printWindow.document.write(`
        <!doctype html>
        <html>
          <head>
            <meta charset=\"utf-8\" />
            <title>Ticket ${booking._id}</title>
            <style>
              @page { size: A4; margin: 10mm; }
              body {
                margin: 0;
                padding: 0;
                background: #ffffff;
                font-family: \"Manrope\", \"Segoe UI\", Arial, sans-serif;
              }
              .ticket-print-root {
                box-shadow: none !important;
                border: 1px solid #e2e8f0 !important;
                width: 100% !important;
                max-width: 760px !important;
                margin: 0 auto !important;
              }
              .no-print { display: none !important; }
            </style>
          </head>
          <body>
            ${ticketElement.outerHTML}
            <script>
              window.onload = function () {
                window.focus();
                window.print();
                window.close();
              };
            <\/script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (e) {
      const msg = e?.message || "Failed to print ticket";
      // eslint-disable-next-line no-alert
      alert(msg);
    } finally {
      setPrinting(false);
    }
  };

  const onCloseTab = () => {
    window.close();
  };

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto w-full max-w-6xl">
        <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
            <QrCode className="h-4 w-4 text-violet-600" />
            E-Ticket Preview
          </p>

          <div className="flex flex-wrap gap-2">
            <Link
              to="/dashboard?view=bookings"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:text-violet-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Bookings
            </Link>

            <button
              type="button"
              onClick={onCloseTab}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:text-violet-700"
            >
              <X className="h-4 w-4" />
              Close Tab
            </button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="skeleton h-14 w-full rounded-xl" />
            <div className="mt-3 skeleton h-72 w-full rounded-xl" />
          </div>
        ) : null}

        {!loading && error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-700 shadow-sm">
            <p className="text-sm font-semibold">{error}</p>
            <button
              type="button"
              onClick={() => {
                // eslint-disable-next-line no-void
                void loadBooking();
              }}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        ) : null}

        {!loading && !error && booking ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {booking.status !== "confirmed" ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Ticket preview is available for confirmed bookings only.
              </div>
            ) : null}

            <TicketCard booking={booking} qrCodeUrl={qrCodeUrl} elementId={ticketElementId} />

            <div className="no-print flex flex-wrap justify-center gap-2 pb-6">
              <button
                type="button"
                onClick={onDownloadPDF}
                disabled={downloading || booking.status !== "confirmed"}
                className="inline-flex items-center gap-2 rounded-xl bg-linear-to-r from-violet-600 to-purple-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(124,58,237,0.3)] transition hover:from-violet-700 hover:to-purple-800 disabled:opacity-70"
              >
                <Download className="h-4 w-4" />
                {downloading ? "Generating PDF..." : "Download Ticket"}
              </button>

              <button
                type="button"
                onClick={onPrintTicket}
                disabled={printing}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:text-violet-700 disabled:opacity-70"
              >
                <Printer className="h-4 w-4" />
                {printing ? "Preparing Print..." : "Print Ticket"}
              </button>

              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-300 hover:text-violet-700"
              >
                <Home className="h-4 w-4" />
                Go to Home
              </Link>
            </div>
          </motion.div>
        ) : null}

        {!loading && !error && !booking ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <Ticket className="mx-auto h-9 w-9 text-violet-500" />
            <h3 className="mt-3 text-lg font-bold text-slate-900">Ticket not found</h3>
            <p className="mt-1 text-sm text-slate-600">The requested booking could not be loaded.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
