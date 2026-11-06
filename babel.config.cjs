module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    '@babel/preset-typescript',
  ],
  // The server project is TypeORM: entities, columns, indexes and injectables
  // all use legacy stage-2 decorators. Without this transform Babel refuses to
  // parse any spec that imports an entity (data-source.spec, server.spec), so
  // those suites could never run. Keep this in sync with tsconfig.server.json,
  // which enables `experimentalDecorators` for tsc.
  plugins: [
    ['@babel/plugin-proposal-decorators', { legacy: true }],
    ['@babel/plugin-transform-class-properties', { loose: true }],
  ],
};
