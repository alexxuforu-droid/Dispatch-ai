import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { FocusPressable } from '../../../Reveal';
import { Button } from '../../../ui';
import { styles } from '../styles';

export type DashboardStats = { waiting: number; runsToday: number; done: number; failed: number; tokens: string; agents: number };

type Props = {
  stats: DashboardStats;
  /** The active team's name, or null when no team has been made yet. */
  teamName: string | null;
  waitingTitles: string[];
  onMakeTeam: () => void;
  onGoAgents: () => void;
  onNewDispatch: () => void;
  onOpenDispatch: () => void;
};

/**
 * The overview: six numbers about the workspace, the team, the agents, and whatever is
 * waiting. Everything starts at zero and empty on a fresh install — no fake data.
 */
const DashboardViewImpl = React.memo(function DashboardView({ stats, teamName, waitingTitles, onMakeTeam, onGoAgents, onNewDispatch, onOpenDispatch }: Props) {
  const cards: { label: string; value: string }[] = [
    { label: 'Waiting', value: String(stats.waiting) },
    { label: 'Runs today', value: String(stats.runsToday) },
    { label: 'Done', value: String(stats.done) },
    { label: 'Failed', value: String(stats.failed) },
    { label: 'Tokens used', value: stats.tokens },
    { label: 'Agents', value: String(stats.agents) },
  ];
  return <ScrollView style={styles.dashPage} contentContainerStyle={styles.dashPageContent}>
    <View style={styles.dashGrid}>
      {cards.map(card => <View key={card.label} style={styles.statCard} accessibilityLabel={`${card.label}: ${card.value}`}>
        <Text style={styles.statLabel}>{card.label}</Text>
        <Text style={styles.statValue}>{card.value}</Text>
      </View>)}
    </View>
    <View style={styles.dashPanels}>
      <View style={styles.dashPanel}>
        <Text style={styles.eyebrow}>TEAM</Text>
        {teamName
          ? <View><Text style={styles.dashPanelTitle}>{teamName}</Text><Text style={styles.dashPanelBody}>{stats.agents} {stats.agents === 1 ? 'agent' : 'agents'} on the team</Text></View>
          : <View style={styles.dashPanelEmpty}>
              <Text style={styles.dashPanelTitle}>Soooo Emptyyyy</Text>
              <Button label="Make team?" variant="primary" onPress={onMakeTeam} />
            </View>}
      </View>
      <View style={styles.dashPanel}>
        <Text style={styles.eyebrow}>AGENTS</Text>
        {stats.agents > 0
          ? <View><Text style={styles.dashPanelTitle}>{stats.agents} {stats.agents === 1 ? 'agent' : 'agents'} ready</Text>
              <FocusPressable accessibilityRole="button" accessibilityLabel="Open agents" accessibilityHint="Open the agents screen" onPress={onGoAgents} style={styles.dashPanelBody}><Text style={styles.dashPanelBody}>Open agents</Text></FocusPressable></View>
          : <View style={styles.dashPanelEmpty}>
              <Text style={styles.dashPanelTitle}>Where did everyone go?</Text>
              <Button label="Make agent" variant="primary" onPress={onGoAgents} />
            </View>}
      </View>
    </View>
    <View style={styles.dashWaiting}>
      <View style={styles.dashWaitingHead}>
        <Text style={styles.eyebrow}>WAITING</Text>
        <Text style={styles.eyebrow}>{stats.waiting} waiting</Text>
      </View>
      {waitingTitles.length === 0
        ? <View style={styles.dashPanelEmpty}>
            <Text style={styles.dashPanelTitle}>Nothing waiting</Text>
            <Button label="New dispatch" variant="primary" onPress={onNewDispatch} />
          </View>
        : waitingTitles.map(title => <FocusPressable key={title} accessibilityRole="button" accessibilityLabel={`Open ${title} in Dispatch`} onPress={onOpenDispatch} style={styles.dashWaitingRow}>
            <Text style={styles.dashWaitingTitle} numberOfLines={1}>{title}</Text>
          </FocusPressable>)}
    </View>
  </ScrollView>;
});

export { DashboardViewImpl as DashboardView };
