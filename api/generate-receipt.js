import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import QRCode from "qrcode";

const VERIFY_BASE_URL = "https://evueo.com.ng/verify";

const e = React.createElement;

const COLORS = {
  orange: "#f97316",
  dark: "#1c1917",
  white: "#ffffff",
  cream: "#fff7ed",
  bodyBg: "#faf8f5",
  border: "#e8e2d9",
  muted: "#a8a29e",
  mutedLight: "#d6d3d1",
  text: "#374151",
};

const styles = StyleSheet.create({
  page: {
    width: 300, // 400px @ 0.75pt/px = 300pt
    paddingBottom: 0,
    fontFamily: "Helvetica",
  },
  headerFree: {
    backgroundColor: COLORS.cream,
    borderBottomWidth: 2.25,
    borderBottomColor: COLORS.orange,
    borderBottomStyle: "solid",
    paddingTop: 16.5,
    paddingBottom: 13.5,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  headerPaid: {
    backgroundColor: COLORS.orange,
    paddingTop: 16.5,
    paddingBottom: 13.5,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  companyName: {
    fontSize: 13.5,
    fontFamily: "Helvetica-Bold",
    color: COLORS.dark,
    marginBottom: 2,
    textAlign: "center",
  },
  companyNamePaid: {
    fontSize: 13.5,
    fontFamily: "Helvetica-Bold",
    color: COLORS.white,
    marginBottom: 2,
    textAlign: "center",
  },
  companySub: {
    fontSize: 7.5,
    color: COLORS.muted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    textAlign: "center",
  },
  companySubPaid: {
    fontSize: 7.5,
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    textAlign: "center",
  },
  poweredBadge: {
    marginTop: 7,
    backgroundColor: "#f5f5f4",
    color: "#c4b5a5",
    fontSize: 6.5,
    letterSpacing: 1,
    textTransform: "uppercase",
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 999,
    borderWidth: 0.75,
    borderColor: COLORS.border,
    borderStyle: "solid",
  },
  trackingStrip: {
    backgroundColor: COLORS.dark,
    paddingVertical: 10.5,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  trackingLabel: {
    fontSize: 6.5,
    color: "rgba(255,255,255,0.4)",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 2,
  },
  trackingNum: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: COLORS.orange,
    letterSpacing: 0.5,
  },
  dateVal: {
    fontSize: 7.5,
    color: "rgba(255,255,255,0.45)",
    textAlign: "right",
    lineHeight: 1.5,
  },
  body: {
    paddingTop: 13.5,
    paddingHorizontal: 15,
    paddingBottom: 13.5,
    backgroundColor: COLORS.white,
  },
  route: {
    flexDirection: "column",
    marginBottom: 10.5,
    width: "100%",
  },
  partyBlock: {
    marginBottom: 8,
  },
  partyLabel: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: COLORS.muted,
    marginBottom: 3,
  },
  partyName: {
    fontSize: 9.75,
    fontFamily: "Helvetica-Bold",
    color: COLORS.dark,
    lineHeight: 1.3,
  },
  itemsCard: {
    backgroundColor: COLORS.bodyBg,
    borderRadius: 7.5,
    padding: 10.5,
    paddingHorizontal: 12,
    borderWidth: 0.75,
    borderColor: COLORS.border,
    borderStyle: "solid",
  },
  itemsLabel: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: COLORS.muted,
    marginBottom: 4.5,
  },
  itemsValue: {
    fontSize: 9,
    color: COLORS.text,
    lineHeight: 1.5,
  },
  itemRow: {
    fontSize: 8.5,
    lineHeight: 1.5,
    color: COLORS.text,
    paddingVertical: 3,
    borderBottomWidth: 0.75,
    borderBottomColor: "#f0ebe3",
    borderBottomStyle: "solid",
  },
  footer: {
    paddingVertical: 9,
    paddingHorizontal: 15,
    borderTopWidth: 0.75,
    borderTopColor: "#f5f5f4",
    borderTopStyle: "solid",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerNote: {
    fontSize: 5.5,
    color: COLORS.mutedLight,
  },
  evueoBrand: {
    fontSize: 8.25,
    fontFamily: "Helvetica-Bold",
    color: COLORS.mutedLight,
  },
  evueoBrandAccent: {
    color: COLORS.orange,
  },
  headerLogo: {
    width: 36,
    height: 36,
    objectFit: "contain",
    marginBottom: 6,
  },
  verifySection: {
    paddingVertical: 9,
    paddingHorizontal: 15,
    borderTopWidth: 0.75,
    borderTopColor: "#f5f5f4",
    borderTopStyle: "solid",
    flexDirection: "row",
    alignItems: "center",
  },
  verifyQr: {
    width: 38,
    height: 38,
    marginRight: 9,
  },
  verifyTextWrap: {
    flexShrink: 1,
  },
  verifyTitle: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: COLORS.dark,
    marginBottom: 1.5,
  },
  verifyUrl: {
    fontSize: 6.5,
    color: COLORS.muted,
  },
});

// Try to break a numbered-list description into rows; otherwise plain text.
function itemsContent(raw) {
  if (!raw || raw === "N/A") {
    return e(Text, { style: styles.itemsValue }, "N/A");
  }
  const matches = raw.match(/\d+\.\s[^0-9.][^]*?(?=\s*\d+\.|$)/g);
  if (matches && matches.length > 1) {
    return e(
      View,
      null,
      matches.map((item, i) =>
        e(Text, { key: i, style: styles.itemRow }, item.trim()),
      ),
    );
  }
  return e(Text, { style: styles.itemsValue }, raw);
}

function receiptDocument({
  companyName,
  tracking,
  sender,
  receiver,
  items,
  dateStr,
  isPaid,
  logoUrl,
  qrDataUrl,
}) {
  const logo =
    isPaid && logoUrl
      ? e(Image, { src: logoUrl, style: styles.headerLogo })
      : null;

  const header = isPaid
    ? e(
        View,
        { style: styles.headerPaid },
        logo,
        e(Text, { style: styles.companyNamePaid }, companyName),
        e(Text, { style: styles.companySubPaid }, "WAYBILL RECEIPT"),
      )
    : e(
        View,
        { style: styles.headerFree },
        e(Text, { style: styles.companyName }, companyName),
        e(Text, { style: styles.companySub }, "WAYBILL RECEIPT"),
        e(Text, { style: styles.poweredBadge }, "POWERED BY EVUEO"),
      );

  const trackingStrip = e(
    View,
    { style: styles.trackingStrip },
    e(
      View,
      { style: { flexShrink: 1 } },
      e(Text, { style: styles.trackingLabel }, "TRACKING ID"),
      e(Text, { style: styles.trackingNum }, tracking || "N/A"),
    ),
    e(Text, { style: styles.dateVal }, dateStr),
  );

  const body = e(
    View,
    { style: styles.body },
    e(
      View,
      { style: styles.route },
      e(
        View,
        { style: styles.partyBlock },
        e(Text, { style: styles.partyLabel }, "FROM"),
        e(Text, { style: styles.partyName }, sender || "N/A"),
      ),
      e(
        View,
        null,
        e(Text, { style: styles.partyLabel }, "TO"),
        e(Text, { style: styles.partyName }, receiver || "N/A"),
      ),
    ),
    e(
      View,
      { style: styles.itemsCard },
      e(Text, { style: styles.itemsLabel }, "ITEMS / DESCRIPTION"),
      itemsContent(items),
    ),
  );

  const verifySection = qrDataUrl
    ? e(
        View,
        { style: styles.verifySection },
        e(Image, { src: qrDataUrl, style: styles.verifyQr }),
        e(
          View,
          { style: styles.verifyTextWrap },
          e(Text, { style: styles.verifyTitle }, "Verify this waybill"),
          e(
            Text,
            { style: styles.verifyUrl },
            `Scan, or visit evueo.com.ng/verify and enter ${tracking || "your tracking ID"}`,
          ),
        ),
      )
    : null;

  const footer = e(
    View,
    { style: styles.footer },
    e(
      Text,
      { style: styles.footerNote },
      "This receipt confirms registration only.",
    ),
    e(
      Text,
      { style: styles.evueoBrand },
      "ev",
      e(Text, { style: styles.evueoBrandAccent }, "u"),
      "eo",
    ),
  );

  return e(
    Document,
    null,
    e(
      Page,
      { size: [300, 535], style: styles.page },
      header,
      trackingStrip,
      body,
      verifySection,
      footer,
    ),
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      companyName,
      tracking,
      sender,
      receiver,
      items,
      dateStr,
      isPaid,
      logoUrl,
    } = req.body || {};

    if (!tracking) {
      return res.status(400).json({ error: "Missing tracking number" });
    }

    let qrDataUrl = null;
    try {
      const verifyUrl = `${VERIFY_BASE_URL}?tracking=${encodeURIComponent(tracking)}`;
      qrDataUrl = await QRCode.toDataURL(verifyUrl, {
        width: 300,
        margin: 1,
        color: { dark: "#1c1917", light: "#ffffff" },
      });
    } catch (qrErr) {
      console.error("QR generation failed, continuing without it:", qrErr);
    }

    const doc = receiptDocument({
      companyName: companyName || "Your Logistics Company",
      tracking,
      sender,
      receiver,
      items: typeof items === "object" ? JSON.stringify(items) : items || "N/A",
      dateStr: dateStr || "",
      isPaid: !!isPaid,
      logoUrl: isPaid ? logoUrl : null,
      qrDataUrl,
    });

    const buffer = await renderToBuffer(doc);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Evueo-${tracking}.pdf"`,
    );
    res.status(200).send(buffer);
  } catch (err) {
    console.error("generate-receipt error:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
}
