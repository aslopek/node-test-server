import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  verbose: true,
  maxWorkers: 1,
  testMatch: [
    '**/*.test.ts',
    '**/*.unit-test.ts',
    '**/*.integration-test.ts'
  ],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
};

export default config;
