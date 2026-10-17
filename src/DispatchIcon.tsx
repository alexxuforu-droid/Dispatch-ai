import React from 'react';
import { View } from 'react-native';
import { colors } from './theme';

type Name = 'dispatch' | 'team' | 'runs' | 'reviews' | 'files' | 'settings' | 'search' | 'plus' | 'send' | 'close' | 'check' | 'spark';
type Props = { name: Name; size?: number; color?: string };

const line = (width: number, height: number, left: number, top: number, color: string, extra = {}) => ({
  position: 'absolute' as const, width, height, left, top, backgroundColor: color, ...extra,
});

export function DispatchIcon({ name, size = 20, color = colors.secondary }: Props) {
  const scale = size / 20;
  const box = { width: size, height: size, position: 'relative' as const };
  const px = (n: number) => n * scale;
  const hair = Math.max(1.4, px(1.7));
  if (name === 'plus') return <View style={box}><View style={line(px(12), hair, px(4), px(9), color, { borderRadius: hair })}/><View style={line(hair, px(12), px(9), px(4), color, { borderRadius: hair })}/></View>;
  if (name === 'close') return <View style={box}><View style={line(px(14), hair, px(3), px(9), color, { borderRadius: hair, transform: [{ rotate: '45deg' }] })}/><View style={line(px(14), hair, px(3), px(9), color, { borderRadius: hair, transform: [{ rotate: '-45deg' }] })}/></View>;
  if (name === 'dispatch') return <View style={box}>
    <View style={line(px(6), px(6), px(2), px(7), color, { borderRadius: px(3) })}/>
    <View style={line(px(6), px(6), px(7), px(7), color, { borderRadius: px(3) })}/>
    <View style={line(px(6), px(6), px(12), px(7), color, { borderRadius: px(3) })}/>
    <View style={line(px(2), px(2), px(4), px(3), color, { borderRadius: px(1) })}/>
    <View style={line(px(2), px(2), px(10), px(3), color, { borderRadius: px(1) })}/>
    <View style={line(px(2), px(2), px(16), px(3), color, { borderRadius: px(1) })}/>
  </View>;
  if (name === 'team') return <View style={box}>
    {[3, 8, 13].map((left) => <View key={left} style={line(px(4), px(4), px(left), px(3), color, { borderRadius: px(2) })}/>)}
    <View style={line(px(7), px(6), px(1), px(10), color, { borderRadius: px(4), opacity: .8 })}/>
    <View style={line(px(7), px(6), px(7), px(10), color, { borderRadius: px(4), opacity: .95 })}/>
    <View style={line(px(7), px(6), px(13), px(10), color, { borderRadius: px(4), opacity: .8 })}/>
  </View>;
  if (name === 'runs') return <View style={box}>
    <View style={{ ...line(px(13), px(13), px(3), px(3), color, { borderWidth: hair, borderColor: color, borderRadius: px(4), backgroundColor: 'transparent' }) }}/>
    <View style={{ position: 'absolute', left: px(8), top: px(7), width: 0, height: 0, borderTopWidth: px(3), borderBottomWidth: px(3), borderLeftWidth: px(5), borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: color }}/>
  </View>;
  if (name === 'reviews' || name === 'check') return <View style={box}>
    {name === 'reviews' && <View style={{ position: 'absolute', left: px(3), top: px(3), width: px(14), height: px(14), borderWidth: hair, borderColor: color, borderRadius: px(4) }}/>} 
    <View style={line(px(6), hair, px(4), px(10), color, { borderRadius: hair, transform: [{ rotate: '45deg' }] })}/>
    <View style={line(px(9), hair, px(7), px(8), color, { borderRadius: hair, transform: [{ rotate: '-48deg' }] })}/>
  </View>;
  if (name === 'files') return <View style={box}>
    <View style={{ position: 'absolute', left: px(4), top: px(2), width: px(12), height: px(16), borderWidth: hair, borderColor: color, borderRadius: px(2) }}/>
    <View style={line(px(6), hair, px(7), px(7), color, { opacity: .8 })}/><View style={line(px(6), hair, px(7), px(11), color, { opacity: .8 })}/>
  </View>;
  if (name === 'settings') return <View style={box}>
    {[4, 9, 14].map((top, i) => <React.Fragment key={top}><View style={line(px(15), hair, px(2), px(top), color, { opacity: .8 })}/><View style={line(px(4), px(4), px([5, 11, 7][i]), px(top - 1), colors.panel, { borderWidth: hair, borderColor: color, borderRadius: px(2) })}/></React.Fragment>)}
  </View>;
  if (name === 'search') return <View style={box}>
    <View style={{ position: 'absolute', left: px(2), top: px(2), width: px(12), height: px(12), borderWidth: hair, borderColor: color, borderRadius: px(7) }}/>
    <View style={line(px(7), hair, px(11), px(13), color, { borderRadius: hair, transform: [{ rotate: '45deg' }] })}/>
  </View>;
  if (name === 'send') return <View style={box}>
    <View style={line(px(2), px(13), px(9), px(4), color, { borderRadius: px(1) })}/>
    <View style={line(px(8), hair, px(6), px(5), color, { borderRadius: hair, transform: [{ rotate: '-45deg' }] })}/>
    <View style={line(px(8), hair, px(6), px(5), color, { borderRadius: hair, transform: [{ rotate: '45deg' }] })}/>
  </View>;
  if (name === 'spark') return <View style={box}>
    <View style={line(hair, px(16), px(9), px(2), color, { borderRadius: hair })}/><View style={line(px(16), hair, px(2), px(9), color, { borderRadius: hair })}/>
    <View style={{ position: 'absolute', left: px(3), top: px(3), width: px(14), height: px(14), borderWidth: hair, borderColor: color, transform: [{ rotate: '45deg' }], borderRadius: px(3) }}/>
  </View>;
  return <View style={box}/>;
}
