import React from 'react';
import { Image } from 'react-native';
import { agentAvatarImages } from '../../../agentAvatars';
import { colors } from '../../../theme';
import { styles } from '../styles';

const AgentAvatarImpl = React.memo(function AgentAvatar({ avatarId, size, style, name }: { avatarId: number; size: number; style?: object; name?: string }) {
  const safeId = agentAvatarImages[avatarId] ? avatarId : 1;
  // A named avatar is announced by the person it belongs to. Without a name there is only
  // the number of the mark to say.
  return <Image accessibilityLabel={name ? `${name} avatar` : `Agent avatar ${safeId}`} source={agentAvatarImages[safeId]} resizeMode="cover" style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceRaised }, styles.agentAvatarBorder, style]} />;
});

export { AgentAvatarImpl as AgentAvatar };
