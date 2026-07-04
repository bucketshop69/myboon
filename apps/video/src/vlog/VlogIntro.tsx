import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const colors = {
  ink: "#062F38",
  inkDeep: "#03232C",
  panel: "#073B46",
  panelSoft: "rgba(10, 97, 110, 0.28)",
  line: "rgba(133, 231, 232, 0.22)",
  text: "#F4FBFC",
  muted: "#9FC0C7",
  accent: "#FFD24A",
  green: "#14D6A1",
  pink: "#F0527C",
};

const fontFamily =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';

const myboonLogo: React.CSSProperties = {
  position: "absolute",
  top: 72,
  left: 88,
  lineHeight: 0.82,
  fontFamily,
  fontWeight: 900,
  letterSpacing: -1,
  color: colors.text,
};

const SignalCard: React.FC<{
  top: number;
  left: number;
  width: number;
  label: string;
  title: string;
  accent: string;
  delay: number;
}> = ({ top, left, width, label, title, accent, delay }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [delay, delay + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, [delay, delay + 18], [18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        top,
        left,
        width,
        opacity,
        transform: `translateY(${y}px)`,
        border: `1px solid ${colors.line}`,
        background: "rgba(4, 45, 55, 0.72)",
        borderRadius: 22,
        padding: "22px 26px",
        boxShadow: "0 22px 60px rgba(0, 0, 0, 0.18)",
        fontFamily,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
          color: colors.muted,
          fontSize: 20,
          fontWeight: 700,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 99,
            background: accent,
            boxShadow: `0 0 20px ${accent}`,
          }}
        />
        {label}
      </div>
      <div
        style={{
          color: colors.text,
          fontSize: 32,
          fontWeight: 850,
          letterSpacing: -0.5,
        }}
      >
        {title}
      </div>
    </div>
  );
};

const Node: React.FC<{
  x: number;
  y: number;
  label: string;
  delay: number;
}> = ({ x, y, label, delay }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [delay, delay + 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scale = interpolate(frame, [delay, delay + 16], [0.82, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: "center",
        background: "rgba(255, 255, 255, 0.06)",
        border: `1px solid ${colors.line}`,
        borderRadius: 999,
        padding: "13px 19px",
        color: colors.text,
        fontFamily,
        fontSize: 22,
        fontWeight: 800,
        boxShadow: "0 18px 50px rgba(0, 0, 0, 0.16)",
      }}
    >
      {label}
    </div>
  );
};

export const VlogGeneralBackground: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        background:
          `radial-gradient(circle at 12% 14%, rgba(255, 210, 74, 0.13), transparent 29%), ` +
          `radial-gradient(circle at 66% 44%, rgba(20, 214, 161, 0.10), transparent 34%), ` +
          `linear-gradient(135deg, ${colors.ink}, ${colors.inkDeep})`,
      }}
    >
      <div style={myboonLogo}>
        <div
          style={{
            color: colors.accent,
            fontSize: 30,
            marginLeft: 5,
            marginBottom: 8,
          }}
        >
          my
        </div>
        <div style={{ fontSize: 58 }}>BOON</div>
      </div>
    </AbsoluteFill>
  );
};

export const VlogIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleIn = spring({
    frame: frame - 8,
    fps,
    config: { damping: 18, stiffness: 90 },
  });
  const subtitleOpacity = interpolate(frame, [34, 54], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const tickerX = interpolate(frame, [0, 120], [0, -180], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        background:
          `radial-gradient(circle at 12% 14%, rgba(255, 210, 74, 0.13), transparent 29%), ` +
          `radial-gradient(circle at 62% 46%, rgba(20, 214, 161, 0.11), transparent 34%), ` +
          `linear-gradient(135deg, ${colors.ink}, ${colors.inkDeep})`,
      }}
    >
      <div style={myboonLogo}>
        <div
          style={{
            color: colors.accent,
            fontSize: 30,
            marginLeft: 5,
            marginBottom: 8,
          }}
        >
          my
        </div>
        <div style={{ fontSize: 58 }}>BOON</div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 88,
          top: 266,
          width: 940,
          fontFamily,
        }}
      >
        <h1
          style={{
            margin: 0,
            color: colors.text,
            fontSize: 96,
            lineHeight: 0.98,
            letterSpacing: 0,
            fontWeight: 920,
            maxWidth: 920,
            transform: `translateY(${(1 - titleIn) * 36}px)`,
            opacity: titleIn,
          }}
        >
          Hey, I&apos;m Bibhu.
        </h1>

        <p
          style={{
            marginTop: 32,
            color: colors.muted,
            fontSize: 36,
            lineHeight: 1.26,
            fontWeight: 680,
            maxWidth: 820,
            opacity: subtitleOpacity,
            transform: `translateY(${(1 - subtitleOpacity) * 18}px)`,
          }}
        >
          I&apos;m building myBoon, a mobile-first market intelligence app for
          crypto users.
        </p>
      </div>

      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: 790,
          height: "100%",
          background:
            "linear-gradient(90deg, rgba(3, 35, 44, 0), rgba(3, 35, 44, 0.72) 46%, rgba(3, 35, 44, 0.18))",
        }}
      />

      <div
        style={{
          position: "absolute",
          right: 110,
          top: 130,
          width: 548,
          height: 548,
          borderRadius: "50%",
          border: `1px solid ${colors.line}`,
          opacity: 0.42,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: 184,
          top: 204,
          width: 400,
          height: 400,
          borderRadius: "50%",
          border: `1px solid rgba(255, 210, 74, 0.18)`,
          opacity: 0.65,
        }}
      />

      <svg
        viewBox="0 0 1920 1080"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0.42,
        }}
      >
        <g transform="translate(0 -90)">
          <path
            d="M1152 360 C1260 270 1370 292 1452 396 C1534 500 1626 496 1718 410"
            fill="none"
            stroke="rgba(133, 231, 232, 0.28)"
            strokeWidth="3"
          />
          <path
            d="M1164 612 C1288 538 1368 578 1450 664 C1518 736 1624 742 1712 666"
            fill="none"
            stroke="rgba(255, 210, 74, 0.28)"
            strokeWidth="3"
          />
        </g>
      </svg>

      <Node x={1162} y={238} label="Market" delay={20} />
      <Node x={1364} y={298} label="Wallet" delay={28} />
      <Node x={1576} y={236} label="Event" delay={36} />
      <Node x={1220} y={534} label="Protocol" delay={44} />
      <Node x={1508} y={554} label="Narrative" delay={52} />

      <SignalCard
        top={758}
        left={88}
        width={438}
        label="Signal"
        title="Narratives move fast"
        accent={colors.pink}
        delay={56}
      />
      <SignalCard
        top={758}
        left={558}
        width={438}
        label="Memory"
        title="Context compounds"
        accent={colors.green}
        delay={64}
      />

      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: "100%",
          height: 72,
          borderTop: `1px solid rgba(133, 231, 232, 0.14)`,
          background: "rgba(2, 29, 38, 0.46)",
          overflow: "hidden",
          fontFamily,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 54,
            alignItems: "center",
            height: "100%",
            transform: `translateX(${tickerX}px)`,
            color: colors.muted,
            fontSize: 22,
            fontWeight: 780,
            whiteSpace: "nowrap",
          }}
        >
          {[
            "Polymarket events",
            "Perps traders",
            "Funding rates",
            "Wallet activity",
            "Market timelines",
            "Entity Manager",
            "Polymarket events",
            "Perps traders",
            "Funding rates",
            "Wallet activity",
          ].map((item, index) => (
            <span key={`${item}-${index}`}>
              <span style={{ color: colors.accent, marginRight: 14 }}>•</span>
              {item}
            </span>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
