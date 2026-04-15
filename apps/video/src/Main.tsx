import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
} from "remotion";

const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: "clamp",
  });
  const scale = interpolate(frame, [0, 30], [0.8, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)",
        justifyContent: "center",
        alignItems: "center",
        opacity,
      }}
    >
      <div style={{ transform: `scale(${scale})`, textAlign: "center" }}>
        <h1
          style={{
            color: "#fff",
            fontSize: 80,
            fontFamily: "sans-serif",
            fontWeight: 800,
            margin: 0,
          }}
        >
          pnl.fun
        </h1>
        <p
          style={{
            color: "#a78bfa",
            fontSize: 32,
            fontFamily: "sans-serif",
            marginTop: 16,
          }}
        >
          Narrative Intelligence for Perpetuals
        </p>
      </div>
    </AbsoluteFill>
  );
};

const PacificaSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });
  const slideUp = interpolate(frame, [0, 20], [40, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)",
        justifyContent: "center",
        alignItems: "center",
        opacity,
      }}
    >
      <div
        style={{
          transform: `translateY(${slideUp}px)`,
          textAlign: "center",
          maxWidth: 1200,
          padding: 60,
        }}
      >
        <h2
          style={{
            color: "#00d4ff",
            fontSize: 56,
            fontFamily: "sans-serif",
            fontWeight: 700,
            marginBottom: 40,
          }}
        >
          Built on Pacifica
        </h2>
        <div
          style={{
            display: "flex",
            gap: 40,
            justifyContent: "center",
          }}
        >
          {["Analytics & Data", "Trading Bots", "Social & Gamification"].map(
            (track, i) => {
              const itemOpacity = interpolate(
                frame,
                [20 + i * 10, 35 + i * 10],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              );
              return (
                <div
                  key={track}
                  style={{
                    opacity: itemOpacity,
                    background: "rgba(255,255,255,0.08)",
                    borderRadius: 16,
                    padding: "32px 40px",
                    color: "#fff",
                    fontSize: 28,
                    fontFamily: "sans-serif",
                    border: "1px solid rgba(255,255,255,0.15)",
                  }}
                >
                  {track}
                </div>
              );
            }
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)",
        justifyContent: "center",
        alignItems: "center",
        opacity,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h2
          style={{
            color: "#fff",
            fontSize: 64,
            fontFamily: "sans-serif",
            fontWeight: 800,
          }}
        >
          Ship narratives, not noise.
        </h2>
        <p
          style={{
            color: "#a78bfa",
            fontSize: 28,
            fontFamily: "sans-serif",
            marginTop: 20,
          }}
        >
          pnl.fun — Pacifica Hackathon 2026
        </p>
      </div>
    </AbsoluteFill>
  );
};

export const Main: React.FC = () => {
  const { durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={100}>
        <Intro />
      </Sequence>
      <Sequence from={100} durationInFrames={120}>
        <PacificaSlide />
      </Sequence>
      <Sequence from={220} durationInFrames={durationInFrames - 220}>
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
};
