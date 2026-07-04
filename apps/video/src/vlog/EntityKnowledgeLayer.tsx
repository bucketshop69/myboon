import { AbsoluteFill } from "remotion";

const colors = {
  ink: "#062F38",
  inkDeep: "#03232C",
  panel: "rgba(4, 45, 55, 0.78)",
  panelStrong: "rgba(7, 59, 70, 0.9)",
  line: "rgba(133, 231, 232, 0.24)",
  text: "#F4FBFC",
  muted: "#A5C2C9",
  accent: "#FFD24A",
  green: "#14D6A1",
  pink: "#F0527C",
};

const fontFamily =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';

const logoStyle: React.CSSProperties = {
  position: "absolute",
  top: 64,
  left: 78,
  lineHeight: 0.82,
  fontFamily,
  fontWeight: 900,
  letterSpacing: -1,
  color: colors.text,
};

const Column: React.FC<{
  title: string;
  subtitle: string;
  items: string[];
  x: number;
  width: number;
  accent: string;
}> = ({ title, subtitle, items, x, width, accent }) => {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: 360,
        width,
        minHeight: 386,
        border: `1px solid ${colors.line}`,
        background: colors.panel,
        borderRadius: 26,
        padding: "30px 32px",
        boxShadow: "0 24px 80px rgba(0, 0, 0, 0.18)",
        fontFamily,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          color: colors.muted,
          fontSize: 20,
          fontWeight: 780,
          marginBottom: 13,
        }}
      >
        <span
          style={{
            width: 11,
            height: 11,
            borderRadius: 99,
            background: accent,
            boxShadow: `0 0 20px ${accent}`,
          }}
        />
        {subtitle}
      </div>
      <div
        style={{
          color: colors.text,
          fontSize: 38,
          lineHeight: 1.05,
          fontWeight: 900,
          letterSpacing: 0,
          marginBottom: 28,
        }}
      >
        {title}
      </div>
      <div style={{ display: "grid", gap: 14 }}>
        {items.map((item) => (
          <div
            key={item}
            style={{
              border: "1px solid rgba(133, 231, 232, 0.16)",
              background: "rgba(255, 255, 255, 0.045)",
              borderRadius: 16,
              color: colors.text,
              fontSize: 23,
              fontWeight: 760,
              padding: "14px 16px",
            }}
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
};

const Arrow: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: 112,
      height: 50,
      fontFamily,
      color: colors.accent,
      fontSize: 56,
      fontWeight: 900,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      opacity: 0.92,
    }}
  >
    →
  </div>
);

export const EntityKnowledgeLayer: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        background:
          `radial-gradient(circle at 12% 12%, rgba(255, 210, 74, 0.13), transparent 28%), ` +
          `radial-gradient(circle at 72% 40%, rgba(20, 214, 161, 0.11), transparent 34%), ` +
          `linear-gradient(135deg, ${colors.ink}, ${colors.inkDeep})`,
      }}
    >
      <div style={logoStyle}>
        <div
          style={{
            color: colors.accent,
            fontSize: 28,
            marginLeft: 5,
            marginBottom: 8,
          }}
        >
          my
        </div>
        <div style={{ fontSize: 54 }}>BOON</div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 78,
          top: 176,
          fontFamily,
        }}
      >
        <div
          style={{
            color: colors.accent,
            fontSize: 24,
            fontWeight: 850,
            marginBottom: 16,
          }}
        >
          Entity-first knowledge layer
        </div>
        <div
          style={{
            color: colors.text,
            fontSize: 56,
            lineHeight: 1.08,
            fontWeight: 930,
            letterSpacing: 0,
            maxWidth: 980,
          }}
        >
          Raw signals become market context.
        </div>
      </div>

      <Column
        x={78}
        width={418}
        accent={colors.pink}
        subtitle="Inputs"
        title="Raw Signals"
        items={[
          "News headlines",
          "Market moves",
          "Wallet activity",
          "Funding rates",
          "Odds changes",
        ]}
      />
      <Arrow x={514} y={516} />
      <Column
        x={644}
        width={430}
        accent={colors.accent}
        subtitle="Worker"
        title="Entity Manager"
        items={[
          "Match the entity",
          "Save evidence",
          "Link claims",
          "Update memory",
        ]}
      />
      <Arrow x={1096} y={516} />
      <Column
        x={1226}
        width={514}
        accent={colors.green}
        subtitle="Output"
        title="Entity Memory"
        items={[
          "Timeline",
          "Evidence",
          "Claims",
          "Relationships",
          "What changed?",
        ]}
      />

      <div
        style={{
          position: "absolute",
          left: 78,
          bottom: 74,
          width: 1040,
          border: `1px solid ${colors.line}`,
          background: "rgba(2, 35, 44, 0.58)",
          borderRadius: 22,
          padding: "22px 28px",
          color: colors.muted,
          fontFamily,
          fontSize: 27,
          lineHeight: 1.28,
          fontWeight: 760,
        }}
      >
        Instead of storing updates by source, myBoon connects each signal to the
        thing the user cares about.
      </div>

      <div
        style={{
          position: "absolute",
          right: 84,
          bottom: 62,
          width: 508,
          height: 286,
          borderRadius: 28,
          background: "rgba(3, 35, 44, 0)",
        }}
      />
    </AbsoluteFill>
  );
};
