import { AppTopBar, AppTopBarLogo } from '@/components/AppTopBar';
import { AvatarTrigger } from '@/components/drawer/AvatarTrigger';

export function FeedHeader() {
  return (
    <AppTopBar
      left={<AppTopBarLogo />}
      right={<AvatarTrigger />}
    />
  );
}
