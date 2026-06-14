import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  Image,
  Font,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

// ── Register fonts (DM Mono + a standard sans for body) ──
// Using built-in Helvetica fallback avoids extra font downloads;
// if you want exact brand fonts, register TTF URLs here.

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
    borderBottomWidth: 2.25, // 3px
    borderBottomColor: COLORS.orange,
    borderBottomStyle: "solid",
    paddingTop: 16.5, // 22px
    paddingBottom: 13.5, // 18px
    paddingHorizontal: 18, // 24px
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
    fontSize: 13.5, // ~1.25rem at base 16 -> 18px -> *0.75
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
    paddingVertical: 10.5, // 14px
    paddingHorizontal: 15, // 20px
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
    paddingTop: 13.5, // 18px
    paddingHorizontal: 15, // 20px
    paddingBottom: 13.5,
    backgroundColor: COLORS.white,
  },
  route: {
    flexDirection: "column",
    marginBottom: 10.5, // 14px
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
    fontSize: 9.75, // 0.88rem
    fontFamily: "Helvetica-Bold",
    color: COLORS.dark,
    lineHeight: 1.3,
  },
  itemsCard: {
    backgroundColor: COLORS.bodyBg,
    borderRadius: 7.5, // 10px
    padding: 10.5, // 14px 16px approx
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
    fontSize: 9, // 0.85rem
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
    paddingVertical: 9, // 12px
    paddingHorizontal: 15, // 20px
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
  watermark: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.06,
  },
  watermarkImg: {
    width: 180,
    height: 180,
    objectFit: "contain",
  },
});

// Try to break a numbered-list description into rows; otherwise plain text.
function ItemsContent({ raw }) {
  if (!raw || raw === "N/A") {
    return <Text style={styles.itemsValue}>N/A</Text>;
  }
  const matches = raw.match(/\d+\.\s[^0-9.][^]*?(?=\s*\d+\.|$)/g);
  if (matches && matches.length > 1) {
    return (
      <View>
        {matches.map((item, i) => (
          <Text key={i} style={styles.itemRow}>
            {item.trim()}
          </Text>
        ))}
      </View>
    );
  }
  return <Text style={styles.itemsValue}>{raw}</Text>;
}

function ReceiptDocument({
  companyName,
  tracking,
  sender,
  receiver,
  items,
  dateStr,
  isPaid,
  logoUrl,
}) {
  return (
    <Document>
      <Page size={[300, 480]} style={styles.page}>
        {/* Header */}
        {isPaid ? (
          <View style={styles.headerPaid}>
            <Text style={styles.companyNamePaid}>{companyName}</Text>
            <Text style={styles.companySubPaid}>WAYBILL RECEIPT</Text>
          </View>
        ) : (
          <View style={styles.headerFree}>
            <Text style={styles.companyName}>{companyName}</Text>
            <Text style={styles.companySub}>WAYBILL RECEIPT</Text>
            <Text style={styles.poweredBadge}>POWERED BY EVUEO</Text>
          </View>
        )}

        {/* Watermark (premium only) */}
        {isPaid && logoUrl ? (
          <View style={styles.watermark}>
            <Image src={logoUrl} style={styles.watermarkImg} />
          </View>
        ) : null}

        {/* Tracking strip */}
        <View style={styles.trackingStrip}>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.trackingLabel}>TRACKING ID</Text>
            <Text style={styles.trackingNum}>{tracking || "N/A"}</Text>
          </View>
          <Text style={styles.dateVal}>{dateStr}</Text>
        </View>

        {/* Body */}
        <View style={styles.body}>
          <View style={styles.route}>
            <View style={styles.partyBlock}>
              <Text style={styles.partyLabel}>FROM</Text>
              <Text style={styles.partyName}>{sender || "N/A"}</Text>
            </View>
            <View>
              <Text style={styles.partyLabel}>TO</Text>
              <Text style={styles.partyName}>{receiver || "N/A"}</Text>
            </View>
          </View>

          <View style={styles.itemsCard}>
            <Text style={styles.itemsLabel}>ITEMS / DESCRIPTION</Text>
            <ItemsContent raw={items} />
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerNote}>
            This receipt confirms registration only.
          </Text>
          <Text style={styles.evueoBrand}>
            ev<Text style={styles.evueoBrandAccent}>u</Text>eo
          </Text>
        </View>
      </Page>
    </Document>
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

    const doc = (
      <ReceiptDocument
        companyName={companyName || "Your Logistics Company"}
        tracking={tracking}
        sender={sender}
        receiver={receiver}
        items={
          typeof items === "object" ? JSON.stringify(items) : items || "N/A"
        }
        dateStr={dateStr || ""}
        isPaid={!!isPaid}
        logoUrl={isPaid ? logoUrl : null}
      />
    );

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
