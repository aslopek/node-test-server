#!/bin/sh

NODE_VERSIONS=(19 22 24 26)

echo Build application using node@${NODE_VERSIONS[0]}
npx --yes node@${NODE_VERSIONS[0]} -e "const child_process = require('child_process');console.log('Build using node.js v' + process.versions.node);child_process.exec('npm run build')"

for version in "${NODE_VERSIONS[@]}"
do
  echo Run tests using node@$version
  npx --yes node@$version test.js
done
