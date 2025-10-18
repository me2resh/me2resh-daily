/** @type {import('jest').Config} */
module.exports = {
    roots: ['<rootDir>/src/tests'],
    testEnvironment: 'node',
    transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
    },
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
    },
    collectCoverageFrom: ['src/**/*.ts', '!src/tests/**'],
};
