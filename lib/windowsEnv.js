const childProcess = require('child_process');
const Error = require('./error');

const userEnvRegKey = 'HKCU\\Environment';
const systemEnvRegKey =
    'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment';
const queryRegex = /^ *\w+ +REG(_EXPAND)?_SZ *([^ ].*)$/;

/**
 * Gets an environment variable from the user or system profile.
 */
function getEnvironmentVariable(name, isSystem) {
    let regKey = (isSystem ? systemEnvRegKey : userEnvRegKey);
    let regLabel = (isSystem ? 'system' : 'user');
    let child = childProcess.spawnSync(
        'reg.exe',
        [ 'QUERY', regKey, '/V', name ],
        { stdio: 'pipe' });
    if (child.error) {
        throw new Error('Failed to read from ' + regLabel + ' registry.', child.error);
    } else if (child.status) {
        let message = child.stderr.toString().trim().replace(/^ERROR: */, '') ||
            'Reg.exe exited with code: ' + child.status;
        let code = (/denied/.test(message) ? Error.EPERM : undefined);
        throw new Error('Failed to read from ' + regLabel + ' registry.',
            new Error(message, code));
    }

    let output = child.stdout.toString().trim().split(/\r?\n/);

    let match = queryRegex.exec(output[1]);
    if (!match) {
        throw new Error('Registry query returned unexpected data.');
    }

    let value = match[2];
    return value;
}

/**
 * Sets an environment variable in the user or system profile.
 */
function setEnvironmentVariable(name, value, isSystem) {
    let regKey = (isSystem ? systemEnvRegKey : userEnvRegKey);
    let regLabel = (isSystem ? 'system' : 'user');
    let regValueType = (/path/i.test(name) ? 'REG_EXPAND_SZ' : 'REG_SZ');

    let child = childProcess.spawnSync(
        'reg.exe',
        [ 'ADD', regKey, '/V', name, '/T', regValueType, '/D', value, '/F' ],
        { stdio: 'pipe' });
    if (child.error) {
        throw new Error('Failed to write to ' + regLabel + ' registry.', child.error);
    } else if (child.status) {
        let message = child.stderr.toString().trim().replace(/^ERROR: */, '') ||
            'Reg.exe exited with code: ' + child.status;
        let code = (/denied/.test(message) ? 'EPERM' : undefined);
        throw new Error('Failed to write to ' + regLabel + ' registry.',
            new Error(message, code));
    }

    // Use SETX.EXE to set TEMP to the same value it already has.
    // The desired effect is just the broadcast of the settings-changed
    // message, so that new command windows will pick up the changes.
    // SETX.EXE isn't used to directly set variables because it
    // has an unfortunate 1024-character limit.
    let tempValue = getEnvironmentVariable('TEMP', isSystem);
    child = childProcess.spawnSync(
        'setx.exe',
        (isSystem ? ['TEMP', tempValue, '/M'] : ['TEMP', tempValue]),
        { stdio: 'ignore' });
    if (child.error) {
        throw new Error('Failed broadcast ' + regLabel + ' environment change.',
            child.error);
    } else if (child.status) {
        throw new Error('Failed broadcast ' + regLabel + ' environment change.',
            new Error('Setx.exe exited with code: ' + child.status));
    }
}

module.exports = {
    getEnvironmentVariable,
    setEnvironmentVariable,
};
