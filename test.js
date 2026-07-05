const child_process = require("child_process");
const env = {
    ...process.env,
    NODE_TLS_REJECT_UNAUTHORIZED: '0'
}
const childProcess = child_process.exec('npm run test', {
    env: env
});

let output = '';

childProcess.stdout.on('data', (data) => {
    output += data;
});

childProcess.stderr.on('data', (data) => {
    output += data;
});

childProcess.on('exit', (code) => {
    if (code !== 0) {
        console.log(output);
    }
    console.log(`Test command finished with code ${code} using node.js v${process.versions.node}`);
});
