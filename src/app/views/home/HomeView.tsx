import React from 'react';
import { Image, Text, View } from 'react-native';
import { Button } from '../../../ui';
import { styles } from '../styles';

const STEPS = [
  { n: '01', t: 'Dispatch' },
  { n: '02', t: 'Observe' },
  { n: '03', t: 'Done' },
];

/** The first screen: what the app is, in three steps, and one way in. */
const HomeViewImpl = React.memo(function HomeView({ onStart }: { onStart: () => void }) {
  return <View style={styles.welcome}>
    <View style={styles.welcomeBody}>
      <Image source={require('../../../../assets/dispatch-mark.png')} resizeMode="contain" style={styles.welcomeMark} accessibilityLabel="Dispatch AI" />
      <Text style={styles.welcomeTitle}>Dispatch AI</Text>
      <View style={styles.welcomeSteps}>
        {STEPS.map(step => <View key={step.n} style={styles.welcomeStep}>
          <Text style={styles.welcomeStepN}>{step.n}</Text>
          <Text style={styles.welcomeStepT}>{step.t}</Text>
        </View>)}
      </View>
      <Button label="Start working" variant="primary" onPress={onStart} />
    </View>
  </View>;
});

export { HomeViewImpl as HomeView };
