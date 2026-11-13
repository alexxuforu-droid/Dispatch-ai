import { pageTitles, pages } from '../src/app/types';

test('computer use is a first-class native workspace screen', () => {
  expect(pages.map(page => page.id)).toContain('computerUse');
  expect(pageTitles).toHaveProperty('computerUse', 'Computer use');
});
