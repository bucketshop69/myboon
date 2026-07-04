import { Composition } from "remotion";
import { Main } from "./Main";
import { EntityKnowledgeLayer } from "./vlog/EntityKnowledgeLayer";
import { VlogGeneralBackground, VlogIntro } from "./vlog/VlogIntro";
import { WorldCupMatchCard } from "./world-cup/WorldCupMatchCard";
import { defaultWorldCupMatchCardProps } from "./world-cup/schema";

const WorldCupMatchCardComposition = WorldCupMatchCard as unknown as React.FC<Record<string, unknown>>;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Main"
        component={Main}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="VlogIntro"
        component={VlogIntro}
        durationInFrames={120}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="VlogGeneralBackground"
        component={VlogGeneralBackground}
        durationInFrames={1}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="EntityKnowledgeLayer"
        component={EntityKnowledgeLayer}
        durationInFrames={1}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="WorldCupMatchCard"
        component={WorldCupMatchCardComposition}
        durationInFrames={1}
        fps={30}
        width={1200}
        height={675}
        defaultProps={defaultWorldCupMatchCardProps}
      />
    </>
  );
};
