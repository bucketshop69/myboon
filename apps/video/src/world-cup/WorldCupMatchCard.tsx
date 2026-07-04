import { AbsoluteFill, staticFile } from 'remotion'
import type { WorldCupMatchCardProps } from './schema'
import { worldCupTheme as theme } from './theme'

const TeamBlock: React.FC<{ flag: string; name: string; align?: 'left' | 'right' }> = ({ flag, name, align = 'left' }) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 26,
        minWidth: 0,
      }}
    >
      <div
        style={{
          width: 190,
          height: 190,
          borderRadius: 95,
          background: 'rgba(4, 27, 25, 0.86)',
          border: '1px solid rgba(24, 207, 172, 0.28)',
          boxShadow: '0 0 42px rgba(20, 184, 166, 0.16)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 98,
          flex: '0 0 auto',
        }}
      >
        {flag}
      </div>
      <div
        style={{
          color: theme.text,
          fontFamily: 'Inter, Arial, sans-serif',
          fontWeight: 750,
          fontSize: name.length > 12 ? 34 : 40,
          lineHeight: 1,
          textAlign: 'center',
          maxWidth: 360,
          overflowWrap: 'break-word',
        }}
      >
        {name}
      </div>
    </div>
  )
}

export const WorldCupMatchCard: React.FC<WorldCupMatchCardProps> = (props) => {
  return (
    <AbsoluteFill
      style={{
        width: 1200,
        height: 675,
        background: theme.tealBackground,
        padding: 0,
        fontFamily: 'Inter, Arial, sans-serif',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 50% 44%, rgba(20, 184, 166, 0.22), transparent 30%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.22,
          backgroundImage:
            'linear-gradient(rgba(148, 163, 184, 0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.22) 1px, transparent 1px)',
          backgroundSize: '42px 42px',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.1,
          backgroundImage:
            'linear-gradient(rgba(20, 184, 166, 0.24) 1px, transparent 1px), linear-gradient(90deg, rgba(20, 184, 166, 0.24) 1px, transparent 1px)',
          backgroundSize: '11px 11px',
        }}
      />
      <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            marginTop: 112,
            textAlign: 'center',
            color: 'rgba(226, 232, 240, 0.72)',
            fontSize: 17,
            fontWeight: 720,
            letterSpacing: 9,
          }}
        >
          FIFA WORLD CUP 2026
        </div>

        <div
          style={{
            marginTop: 76,
            display: 'grid',
            gridTemplateColumns: '1fr 130px 1fr',
            alignItems: 'center',
            gap: 50,
            padding: '0 154px',
          }}
        >
          <TeamBlock flag={props.assets.homeFlag} name={props.fixture.homeTeam} />
          <div style={{ color: 'rgba(226, 232, 240, 0.24)', textAlign: 'center', fontSize: 48, fontWeight: 900 }}>
            VS
          </div>
          <TeamBlock flag={props.assets.awayFlag} name={props.fixture.awayTeam} align="right" />
        </div>

        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 66,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
          }}
        >
          <img src={staticFile('app-icon-v2.png')} style={{ width: 26, height: 26, borderRadius: 7 }} />
          <div style={{ color: 'rgba(226, 232, 240, 0.62)', fontSize: 20, fontWeight: 750 }}>@myboonapp</div>
        </div>
      </div>
    </AbsoluteFill>
  )
}
