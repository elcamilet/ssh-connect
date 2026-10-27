'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const pkg = require('../../package.json');

test('package manifest targets the 0.2.0 extension', () => {
    assert.equal(pkg.version, '0.2.0');
    assert.equal(pkg.main, './extension.js');
    assert.equal(pkg.engines.vscode, '^1.96.0');
});

test('package manifest contributes the expected commands and activation events', () => {
    const commandIds = pkg.contributes.commands.map((command) => command.command);
    assert.deepEqual(commandIds, [
        'ssh-connect.editConfig',
        'ssh-connect.savePassword',
        'ssh-connect.deletePassword'
    ]);
    for (const command of commandIds) {
        assert.ok(pkg.activationEvents.includes(`onCommand:${command}`));
    }
    assert.ok(pkg.activationEvents.includes('onView:sshHostsView'));
});

test('package manifest exposes password actions in the item context menu', () => {
    const itemMenus = pkg.contributes.menus['view/item/context'];
    assert.ok(Array.isArray(itemMenus));
    assert.ok(
        itemMenus.some(
            (menu) =>
                menu.command === 'ssh-connect.savePassword' &&
                menu.when.includes('viewItem == host')
        )
    );
    assert.ok(
        itemMenus.some(
            (menu) =>
                menu.command === 'ssh-connect.deletePassword' &&
                menu.when.includes('viewItem == group')
        )
    );
});

test('package manifest does not ship native or unused runtime dependencies', () => {
    assert.equal(pkg.dependencies, undefined);
    assert.equal(pkg.devDependencies.keytar, undefined);
    assert.equal(pkg.devDependencies['@vscode/test-cli'], undefined);
    assert.equal(pkg.devDependencies['@vscode/test-electron'], undefined);
});
