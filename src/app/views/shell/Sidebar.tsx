import React from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { DispatchIcon } from '../../../DispatchIcon';
import { colors } from '../../../theme';
import { FocusPressable } from '../../../Reveal';
import { Screen, pages } from '../../types';
import { NavItem } from './NavItem';
import { styles } from '../styles';

const SidebarImpl = React.memo(function Sidebar({ screen, setScreen, compact, onNew }: { screen: Screen; setScreen: (screen: Screen) => void; compact: boolean; onNew: () => void }) {
  let group = '';
  return <View style={[styles.sidebar, compact && styles.sidebarCompact]}>
    <View style={[styles.brand, compact && styles.brandCompact]}>
      <Image source={require('../../../../assets/dispatch-mark.png')} resizeMode="contain" style={styles.brandMark} accessibilityLabel="Dispatch AI" />
    </View>
    <FocusPressable accessibilityRole="button" accessibilityLabel="New run" accessibilityHint="Start a new run" tooltip={compact ? 'New run' : undefined} onPress={onNew} style={({ pressed }) => [styles.newRun, pressed && styles.pressed]}>
      <DispatchIcon name="plus" size={18} color={colors.text} />{!compact && <Text style={styles.newRunText}>New run</Text>}
    </FocusPressable>
    <ScrollView style={styles.navScroll} contentContainerStyle={styles.navList}>
      {pages.map(page => {
        const header = !compact && page.group !== group ? page.group : null;
        group = page.group;
        return <View key={page.id}>{header ? <Text style={styles.navGroup}>{header}</Text> : null}
          <NavItem label={page.label} icon={page.icon} active={screen === page.id} compact={compact} onPress={() => setScreen(page.id)} />
        </View>;
      })}
    </ScrollView>
    <View style={styles.sidebarSpacer} />
    <View style={styles.sidebarBottom}>
      <NavItem label="Advanced settings" icon="settings" active={screen === 'settings'} compact={compact} onPress={() => setScreen('settings')} />
      {/* Not a profile. It says where the run history lives, and it says nothing else. */}
      {!compact ? <View style={styles.profile}>
        <View style={styles.flexOne}><Text style={styles.profileName}>Local workspace</Text></View>
      </View> : null}
    </View>
  </View>;
});

export { SidebarImpl as Sidebar };
